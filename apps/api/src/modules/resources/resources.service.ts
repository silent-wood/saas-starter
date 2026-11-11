import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PRISMA } from '../../prisma/prisma.module.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import {
  ERROR_CODES,
  ResourceCreateInput,
  ResourceUpdateInput,
  TrashItem,
  TrashListResult,
  type ResourceItem,
  type ResourceListResult,
  type ResourceQuery,
} from '@saas/shared';
import type { Prisma } from '../../generated/prisma/client.ts';

/**
 * 资源域数据访问。
 *
 * 三条贯穿全文件的约定，改代码前先看这里：
 *
 * 1. **where 里永不出现 tenantId**。它是 prisma/tenant.extension.ts 在中间件
 *    提供的 AsyncLocalStorage 上下文里自动合并进去的。手写 tenantId 有两重坏处：
 *    一旦两处不一致就变成「加了范围反而查不到」，以及让读者误以为漏写是 bug。
 *    代价是：凡是「不该按租户过滤」的场景（定时清理、迁移脚本）必须跑在
 *    无上下文的环境里，否则会被静默加上租户条件。
 *
 * 2. **查不到一律 404，不用 403**。跨租户访问别人的 id 时，扩展会把 tenantId
 *    合并进 where → findFirst 返回 null → 与「id 根本不存在」走同一个分支。
 *    这是刻意的：403 等于告诉攻击者「这个 id 真实存在，只是不属于你」，
 *    可以拿来枚举其他租户的数据规模。
 *
 * 3. **出参整形统一走文件末尾的 toItem / toTrashItem**。DB 里是 Date 和
 *    creator 嵌套对象，HTTP 层要的是 ISO 字符串和 createdByName。只在映射函数里
 *    做一次转换，列表、详情、创建、更新的返回形状就不可能漂移。
 *
 * 另外：deletedAt 判定全部自己写（deletedAt: null / { gt: cutoff }）。
 * Prisma 的扩展只处理 tenantId，不知道「软删除」这回事。
 */

/** 回收站可见窗口：30 天。常量集中一处，改期只改这里 */
const TRASH_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * include 抽成常量而不是每处内联：四个读方法都要 join 用户昵称，
 * 一处写错（比如忘了 select 导致把 passwordHash 一起带出来）就会泄漏字段。
 * as const 是为了让 Prisma 推断出字面量类型，否则 mode: 'insensitive' 之类的
 * 字符串会被放宽成 string 而报类型错。
 */
const CREATOR_INCLUDE = { creator: { select: { nickname: true } } } as const;
const TRASH_INCLUDE = {
  creator: { select: { nickname: true } },
  deleter: { select: { nickname: true } },
} as const;
/** 映射只用到这些列；用窄接口而不是 Prisma 生成类型，避免被 ORM 版本反向绑死 */
interface ResourceRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  creator: { nickname: string } | null;
}
interface TrashRow extends ResourceRow {
  deletedAt: Date | null;
  deletedBy: string | null;
  deleter: { nickname: string } | null;
}

@Injectable()
export class ResourcesService {
  // 用符号 PRISMA 注入而不是 PrismaService 类：注入的是「被租户扩展包装过的
  // client」，普通 PrismaClient 不认 tenantId 自动注入。
  constructor(@Inject(PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  /** 资源列表：只含未删除的行，按创建时间倒序 */
  async list(query: ResourceQuery): Promise<ResourceListResult> {
    const { page, pageSize, q, category } = query;
    // deletedAt: null 是「不在回收站」的唯一判据，别改成 deletedBy == null
    // （历史上存在 deletedBy 有值但 deletedAt 漏写的脏数据）
    const where: Prisma.ResourceWhereInput = {
      deletedAt: null,
      // 可选过滤用展开语法拼：写 where.q 之类的假字段会直接编译不过
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      ...(category ? { category } : {}),
    };
    // count 与 findMany 并发：两者互不依赖，串行会让一次列表查询耗时翻倍。
    // 注意这里没包事务，两者之间若有写入，total 与 items 可能差一两条；
    // 分页列表接受这点误差，不值得为它加重锁。
    const [total, rows] = await Promise.all([
      this.prisma.resource.count({ where }),
      this.prisma.resource.findMany({
        where,
        include: CREATOR_INCLUDE,
        orderBy: { createdAt: 'desc' },
        // 分页下推到 DB（skip/take），不要在内存里 slice：
        // 数据量上来后再改就是全表扫描
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map(toItem), total, page, pageSize };
  }

  /** 详情：回收站里的资源同样视为不存在 */
  async detail(id: string): Promise<ResourceItem> {
    const row = await this.prisma.resource.findFirst({
      where: { id, deletedAt: null },
      include: CREATOR_INCLUDE,
    });
    if (!row) throw notFound();
    return toItem(row);
  }

  /**
   * 新建。userId 来自 token 的 sub，由控制器传入。
   * tenantId 不在 data 里——扩展会自动补，见文件头说明 1。
   */
  async create(input: ResourceCreateInput, userId: string): Promise<ResourceItem> {
    // satisfies 而非类型断言：写完字段后仍会校验结构，漏字段或拼错列名当场报错。
    // Omit<..., 'tenantId'> 是刻意保留的：提醒后来者「这个字段不该在这里出现」，
    // 真要传时会因为类型不匹配而编译失败。
    const data = {
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      createdBy: userId,
    } satisfies Omit<Prisma.ResourceUncheckedCreateInput, 'tenantId'>;

    // create 时传的 data 类型是 Unchecked（直接给外键列），因为 createdBy 是标量列；
    // 换成 Checked 版本就必须写成 creator: { connect: { id } } 的嵌套形式，
    // 多一层对象却没有任何收益。
    const row = await this.prisma.resource.create({
      data: data as Prisma.ResourceUncheckedCreateInput,
      include: CREATOR_INCLUDE,
    });
    return toItem(row);
  }

  /**
   * 局部更新。空对象合法且幂等：直接回读，不落一次无意义的 UPDATE。
   */
  async update(id: string, input: ResourceUpdateInput): Promise<ResourceItem> {
    // 先查再加 deletedAt: null：已进回收站的资源禁止编辑，
    // 否则会出现「回收站里的数据被改了，恢复后内容与删除时不一致」
    const current = await this.prisma.resource.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound();

    // 逐字段判 undefined 而不是把 input 直接展开进 data：
    // 展开会把契约外的键（客户端多传的 id / tenantId / createdBy）一起写进数据库，
    // 等于绕过校验层做越权修改。这里白名单式赋值，多的键自然被丢弃。
    const data: Prisma.ResourceUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;
    // 空 PATCH 不算错：契约允许 {}，这里回读即可，前端不必额外禁用提交按钮
    if (Object.keys(data).length === 0) return this.detail(id);

    const row = await this.prisma.resource.update({
      where: { id },
      data,
      include: CREATOR_INCLUDE,
    });
    // 注意 update 的 where 只有 id：安全性由上面的 findFirst 保证（已按租户过滤）。
    // 不要以为这里漏了 tenantId——扩展同样会给 update 的 where 合并租户条件。
    return toItem(row);
  }

  /** 软删除：只打时间戳与人，行留在表里 */
  async softDelete(id: string, userId: string): Promise<{ id: string }> {
    // 先 findFirst 带 deletedAt: null：重复删除返回 404 而不是静默成功，
    // 前端才能区分「我刚删成功」和「这条早就被人删了」
    const current = await this.prisma.resource.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound();
    await this.prisma.resource.update({
      where: { id },
      // ⚠️ 必须写 deletedAt，它是「是否在回收站」的唯一判据。
      // 曾经这里只写了 updatedAt + deletedBy，结果接口返回 200、列表却仍然查得到
      // （相当于没删），单测也没覆盖这条路径，一路全绿到手工验证才发现。
      // 加字段时想清楚：谁读 deletedAt，谁读 deletedBy——两者缺一都会出现「半删」状态。
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { id };
  }

  /** 回收站列表：仅 30 天窗口内，按删除时间倒序（最近删的在最上面） */
  async listTrash(query: ResourceQuery): Promise<TrashListResult> {
    const { page, pageSize, q, category } = query;
    const where: Prisma.ResourceWhereInput = {
      // 只返回 30 天窗口内：超窗行仍在表里等清理任务，但不再对用户可见
      deletedAt: { gt: trashCutoff() },
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      ...(category ? { category } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.resource.count({ where }),
      this.prisma.resource.findMany({
        where,
        include: TRASH_INCLUDE,
        orderBy: { deletedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items: rows.map(toTrashItem), total, page, pageSize };
  }

  /** 从回收站恢复：把 deletedAt / deletedBy 一起清空，两步必须同时做 */
  async restore(id: string): Promise<ResourceItem> {
    const row = await this.prisma.resource.findFirst({
      where: { id, deletedAt: { gt: trashCutoff() } },
    });
    // 超窗与「不属于本租户」统一 404，不暴露 id 是否存在
    if (!row) throw notFound('该资源已超过 30 天可恢复期');

    const restored = await this.prisma.resource.update({
      where: { id },
      // 两个字段一起清：只清 deletedAt 会留下「正常资源却有删除人」的脏数据，
      // 回收站列表和 createdByName 之外的展示都会跟着错
      data: { deletedAt: null, deletedBy: null },
      include: CREATOR_INCLUDE,
    });
    return toItem(restored);
  }

  /**
   * 彻底删除：本期同步物理删行，不可恢复。
   * 只允许删回收站内的行——直接删「正常」资源等于绕过软删除，前端也就失去了
   * 误删保护，所以这里同样要 findFirst 带 30 天窗口条件。
   * M3 有 files 表后改为写 purged_at + 投 cleanup 队列异步清对象存储。
   */
  async purge(id: string): Promise<{ id: string }> {
    const row = await this.prisma.resource.findFirst({
      where: { id, deletedAt: { gt: trashCutoff() } },
    });
    if (!row) throw notFound('该资源不在回收站中');

    await this.prisma.resource.delete({ where: { id } });
    return { id };
  }
}

/** 窗口左边界。用「当前时间往前推」而不是在构造 where 时内联，便于单测用假时钟锁定 */
function trashCutoff(): Date {
  return new Date(Date.now() - TRASH_WINDOW_DAYS * DAY_MS);
}

/**
 * 统一 404 构造器。code 走 shared 的 ERROR_CODES，前端按 code 分支，
 * message 只是给人看的（两端不同场景文案不同，比如「已超 30 天」）。
 */
function notFound(message = '资源不存在或已被删除'): NotFoundException {
  return new NotFoundException({ code: ERROR_CODES.RESOURCE_NOT_FOUND, message });
}

/** DB 行 → 接口出参。Date 转 ISO 字符串在 HTTP 序列化时本来也会发生，显式转是为了统一类型 */
function toItem(row: ResourceRow): ResourceItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    createdBy: row.createdBy,
    createdByName: row.creator?.nickname ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTrashItem(row: TrashRow): TrashItem {
  return {
    ...toItem(row),
    // 查询条件已保证非空（deletedAt > cutoff），这里的断言只是让类型对上
    deletedAt: row.deletedAt!.toISOString(),
    deletedBy: row.deletedBy,
    deletedByName: row.deleter?.nickname ?? null,
  };
}
