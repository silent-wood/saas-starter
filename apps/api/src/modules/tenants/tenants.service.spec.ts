import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { TenantsService } from './tenants.service.ts';
import { PRISMA } from '../../prisma/prisma.module.ts';

/**
 * TenantsService 单测。
 *
 * 为什么用 mock 而不是连真实数据库？
 *   listByUser 的核心逻辑是「过滤条件怎么传给 Prisma + 返回行怎么映射成契约」，
 *   这两件事都是纯逻辑，不依赖数据库。用 mock 顶掉 PrismaService 后：
 *     - 能精确断言「传给 findMany 的参数对不对」（连库反而测不到这个）
 *     - 跑得快、可重复、不依赖任何外部环境
 *   真正「SQL 能不能跑通」的风险，由手工冒烟（真连 dev 库走一遍）兜底。
 *
 * 本文件用到的 Vitest API 速查（配合 vitest/globals，describe/it/expect 可直接用）：
 *   - describe(name, fn)     把一组用例归类；it(name, fn) 单个用例
 *   - beforeEach(fn)         每个 it 之前跑一次（这里每次重建 service + mock）
 *   - vi.fn()                创建一个「可编程的空函数」，记录被调用的次数与参数
 *   - mockResolvedValue(v)   让 mock 函数 resolve 出 v（模拟异步返回）
 *   - toHaveBeenCalledWith(x) 断言 mock 被调用时的参数「包含」x（可用 expect.objectContaining 做部分匹配）
 *   - toEqual(x)             深度相等断言（对象/数组逐字段比）
 *   - toBeNull()             断言值严格等于 null
 */

describe('TenantsService', () => {
  let service: TenantsService;
  // listByUser 只碰 membership.findMany 一个方法，只 mock 它，其余方法不 stub
  let findMany: Mock;
  // create 走事务：$transaction 的 cb 会被调用并拿到 tx，tx 上只有 tenant/membership 的 create
  let tenantCreate: Mock;
  let membershipCreate: Mock;
  let transaction: Mock;

  beforeEach(async () => {
    // 每个用例前重置 mock，避免上一个用例的调用记录/返回值串到下一个
    findMany = vi.fn();
    tenantCreate = vi.fn();
    membershipCreate = vi.fn();
    // 事务在测试里就是「立刻执行回调并把 tx 递进去」，事务回滚语义由 Prisma 保证，
    // 这里只验证「两条写入都在同一个事务里发生」
    transaction = vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ tenant: { create: tenantCreate }, membership: { create: membershipCreate } }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          // 用假对象顶掉真实的扩展 client（PRISMA token）：单测不连库。
          // useValue 只提供一个「长得像 client 一部分」的对象即可，
          // 因为被测方法只会用到 membership.findMany / $transaction 这两个入口。
          // token 是 Symbol，必须显式 provide: PRISMA，与 service 里的 @Inject(PRISMA) 对齐
          provide: PRISMA,
          useValue: { membership: { findMany }, $transaction: transaction },
        },
      ],
    }).compile();

    // 从 DI 容器里取出组装好的 service（此时它的 prisma 已被替换成 mock）
    service = module.get<TenantsService>(TenantsService);
  });

  it('应把过滤条件下推：userId + active + 未软删租户', async () => {
    findMany.mockResolvedValue([]);

    await service.listByUser('u1');

    // 断言传给 findMany 的参数，而不是只看返回值：
    // 这才是「过滤下推」建模纪律的核心——查库前就把条件带进 where，
    // 而不是查回来再 filter（后者会多读已删/禁用行）
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          status: 'active',
          tenant: { deletedAt: null },
        },
        // 只 select 租户的 id/name，不整表拖回 logo_url 等本期用不到的列
        include: { tenant: { select: { id: true, name: true } } },
        // 最近活跃在前；Prisma 的 desc 对 null 默认排最后，正好符合契约
        orderBy: { lastActiveAt: 'desc' },
      }),
    );
  });

  it('应把 membership 行映射成契约字段（lastActiveAt 转 ISO 字符串）', async () => {
    // 造一个带 Date 的假行：验证 Date → toISOString 的转换
    const at = new Date('2026-11-04T03:00:00.000Z');
    findMany.mockResolvedValue([
      {
        tenant: { id: 't1', name: '冒烟团队' },
        role: 'owner',
        status: 'active',
        lastActiveAt: at,
      },
    ]);

    const result = await service.listByUser('u1');

    // 映射后的返回必须严格等于契约字段，lastActiveAt 是字符串而非 Date
    expect(result).toEqual([
      {
        id: 't1',
        name: '冒烟团队',
        role: 'owner',
        status: 'active',
        lastActiveAt: at.toISOString(),
      },
    ]);
  });

  it('lastActiveAt 为 null 时应原样透出 null（不崩、不转成字符串）', async () => {
    // 契约里 lastActiveAt 是 string | null：注册后从没活跃过，库里就是 null
    findMany.mockResolvedValue([
      {
        tenant: { id: 't1', name: '冒烟团队' },
        role: 'owner',
        status: 'active',
        lastActiveAt: null,
      },
    ]);

    const result = await service.listByUser('u1');

    // null 分支必须能正确透出，而不是变成 'null' 或抛错
    expect(result[0].lastActiveAt).toBeNull();
  });

  it('多条应按数据库返回顺序透传（排序交给 Prisma，service 不二次排序）', async () => {
    // 两条：一条活跃一条从未活跃。验证 service 保持 findMany 返回的原始顺序，
    // 不自己再做 sort——排序已经由 orderBy 在 SQL 层完成了
    findMany.mockResolvedValue([
      {
        tenant: { id: 't2', name: '团队二' },
        role: 'member',
        status: 'active',
        lastActiveAt: new Date('2026-11-04T03:00:00.000Z'),
      },
      {
        tenant: { id: 't1', name: '团队一' },
        role: 'owner',
        status: 'active',
        lastActiveAt: null,
      },
    ]);

    const result = await service.listByUser('u1');

    expect(result.map((r) => r.id)).toEqual(['t2', 't1']);
  });

  it('创建团队：同一事务内写 tenant 与 owner membership，并返回契约形状', async () => {
    tenantCreate.mockResolvedValue({ id: 't9', name: '新团队' });
    membershipCreate.mockResolvedValue({});

    const result = await service.create('u1', '新团队');

    // 两条写入必须共用一个事务：拆开写会留下「有团队没成员」的孤儿租户，
    // 它不在任何人的列表里，用户既看不到也删不掉
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tenantCreate).toHaveBeenCalledWith({
      data: { name: '新团队', ownerId: 'u1' },
      select: { id: true, name: true },
    });
    expect(membershipCreate).toHaveBeenCalledWith({
      data: { tenantId: 't9', userId: 'u1', role: 'owner', status: 'active' },
    });
    // 返回形状必须与 GET /tenants 的列表项一致，前端才能直接追加进缓存
    expect(result).toEqual({
      id: 't9',
      name: '新团队',
      role: 'owner',
      status: 'active',
      lastActiveAt: null,
    });
  });
});
