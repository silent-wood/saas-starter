import { describe, it, expect, vi } from 'vitest';
import { tenantContext, applyTenantScope } from './tenant.extension.ts';

/**
 * tenant 扩展的过滤/注入逻辑单测，不连库。
 *
 * 被测对象是纯函数 applyTenantScope({ model, args, query })——它封装了扩展的
 * 全部拦截逻辑，与生产代码（tenantScopedExtension 的 $allOperations 委托给它）
 * 共用同一份实现。用一个假的 query（vi.fn）观察它最终以什么参数放行，
 * 即可精确验证四条隔离规则，无需起数据库。
 */
describe('applyTenantScope 隔离规则', () => {
  // 一个「返回入参」的假 query，用来观察 applyTenantScope 最终交给它的 args 长什么样
  const passthrough = vi.fn(async (args: unknown) => args);

  it('有上下文 + create + 白名单模型 → 往 data 注入 tenantId', async () => {
    // tenantContext.run 建立请求级上下文；run 回调内同步/异步代码都能 getStore() 拿到它
    await tenantContext.run({ tenantId: 'tenant-a' }, () =>
      applyTenantScope({
        model: 'AiDocument',
        args: { data: { fileId: 'f1' } },
        query: passthrough,
      }),
    );

    // create 没有 where，走 data 注入分支；data 被自动塞进 tenantId，业务代码无需手动传
    expect(passthrough).toHaveBeenCalledWith({
      data: { fileId: 'f1', tenantId: 'tenant-a' },
    });
  });

  it('有上下文 + findMany + 白名单模型 → 往 where 合并 tenantId', async () => {
    await tenantContext.run({ tenantId: 'tenant-a' }, () =>
      applyTenantScope({
        model: 'AiChunk',
        args: { where: { documentId: 'd1' } },
        query: passthrough,
      }),
    );

    // findMany 有 where，走合并分支；原有条件保留，追加 tenantId
    expect(passthrough).toHaveBeenCalledWith({
      where: { documentId: 'd1', tenantId: 'tenant-a' },
    });
  });

  it('有上下文 + 非白名单模型（Membership）→ 原样放行，不加 tenantId', async () => {
    await tenantContext.run({ tenantId: 'tenant-a' }, () =>
      applyTenantScope({
        model: 'Membership',
        args: { where: { userId: 'u1' } },
        query: passthrough,
      }),
    );

    // where 不能被污染——这正是 TenantGuard 能干净查 membership 的原因
    expect(passthrough).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('无租户上下文（run 之外调用）→ 原样放行', async () => {
    // 不在 tenantContext.run 里调用，getStore() 返回 undefined，直接放行
    await applyTenantScope({ model: 'AiDocument', args: { where: {} }, query: passthrough });

    expect(passthrough).toHaveBeenCalledWith({ where: {} });
  });

  it('有上下文 + 白名单模型 + updateMany（同时有 where 和 data）→ 只合并 where，data 原样保留', async () => {
    await tenantContext.run({ tenantId: 'tenant-a' }, () =>
      applyTenantScope({
        model: 'AiDocument',
        args: { where: { status: 'processing' }, data: { status: 'ready' } },
        query: passthrough,
      }),
    );

    // update 同时有 where 和 data，但隔离只关心 where（定位"改哪一行"），
    // data 原样保留，不额外注入
    expect(passthrough).toHaveBeenCalledWith({
      where: { status: 'processing', tenantId: 'tenant-a' },
      data: { status: 'ready' },
    });
  });
});
