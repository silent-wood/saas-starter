import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '../generated/prisma/client.ts';

/**
 * 请求级租户上下文容器。
 *
 * AsyncLocalStorage 的作用：在 Node 的异步调用链里传一个「跟当前请求绑定」的变量，
 * 不需要把它一层层传参。每个 HTTP 请求进来时，middleware 用 tenantContext.run(ctx, ...)
 * 包住整条处理链，链上任意深处调 prisma.xxx.findMany() 都能 getStore() 拿到当前租户 id。
 *
 * 为什么不用普通全局变量？
 *   并发请求会互相覆盖：A 请求的 tenantId 还没用完，B 请求就把它改了。
 *   AsyncLocalStorage 保证每个请求各自看到自己的值。
 */
export const tenantContext = new AsyncLocalStorage<{ tenantId: string }>();

/**
 * 哪些模型需要强制注入 tenantId 过滤（即"租户内的业务数据"）。
 *
 * ⚠️ 这里只列【当前 schema 里真实存在】且含 tenant_id 列的业务模型：
 *   - AiDocument / AiChunk：AI 知识库文档与切片（M4 用，表已建）
 *   - Resource：资源域业务实体（M2 步骤 8，表已建）
 *   - Membership：故意【不】放进白名单，见下方说明
 *
 * 文档 8.2 原样里的一长串（File / Subscription / Invoice ...）都是后续里程碑
 * 才建的表，现在列进来会引用不存在的模型名，编译不过，等建表时再补。
 * 新建含 tenant_id 的表后忘了加这里，隔离会静默失效：查询不报错、但跨租户返回数据。
 */
const TENANT_SCOPE = new Set(['AiDocument', 'AiChunk', 'Resource']);

/**
 * 为什么不把 Membership 放进白名单？
 *   TenantGuard 需要查 membership 判断"这个用户属不属于这个租户"，
 *   但守卫执行的那一刻，租户上下文还没建立（上下文正是靠这次查询才建立的）。
 *   如果 Membership 也被强制合并 tenantId，守卫查询会被扩展开"加持"一个
 *   来自【上一个请求】或【空】的 tenantId，导致误判。
 *   membership 是"谁能进租户"的元数据，不是"租户内的业务数据"，本身就不该被隔离。
 */

/**
 * 租户隔离的核心拦截逻辑（抽成纯函数，便于单测）。
 *
 * $allOperations 拦截所有模型的所有操作（findMany/findUnique/create/update/delete...）。
 * 对白名单内的模型：
 *   - create：往 data 里自动塞 tenantId（业务代码不用手动传，也不会传错）
 *   - 其它（读/改/删）：往 where 里自动合并 tenantId（业务代码忘写也能兜底过滤）
 * 不在白名单、或当前无租户上下文时：原样放行，不做任何改动。
 *
 * 为什么单独抽出这个纯函数？
 *   Prisma.defineExtension 返回的是一个「函数」（$extends 的钩子），不是对象，
 *   单测无法从扩展对象里取出 $allOperations 回调。抽出纯函数后，测试直接调
 *   applyTenantScope({ model, args, query })，无需接触 defineExtension 的复杂类型。
 */
export async function applyTenantScope(params: {
  model?: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}): Promise<unknown> {
  const { model, args, query } = params;
  const ctx = tenantContext.getStore();
  // 三个放行条件：没有租户上下文 / 模型不在白名单 / model 为空（理论不发生）
  if (!ctx || !TENANT_SCOPE.has(model ?? '')) return query(args);

  // 用「有没有 where 字段」区分操作类型，而不是用 operation 参数：
  //  - operation 是普通 string，TS 无法靠它收窄 args 的联合类型
  //  - create / createMany 没有 where 只有 data；其余读改写操作有 where
  const argsObj = args as { where?: unknown; data?: unknown };
  if ('where' in argsObj) {
    // 读/改/删：往 where 里合并 tenantId（业务代码忘写也能兜底过滤）
    const where = (argsObj.where ?? {}) as Record<string, unknown>;
    return query({ ...argsObj, where: { ...where, tenantId: ctx.tenantId } });
  }

  // create / createMany：往 data 里注入 tenantId（业务代码不用手动传，也不会传错）
  const data = argsObj.data;
  return query({
    ...argsObj,
    data: { ...(data as object), tenantId: ctx.tenantId },
  });
}

/**
 * 租户隔离扩展的 defineExtension 装配。
 * $allOperations 的回调直接委托给上面的纯函数 applyTenantScope。
 */
export function tenantScopedExtension() {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          // 委托给纯函数：拦截逻辑与测试共用同一份实现，避免「生产一套、测试一套」漂移
          return applyTenantScope({ model: model ?? undefined, args, query });
        },
      },
    },
  });
}
