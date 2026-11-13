import { ForbiddenException, Logger } from '@nestjs/common';
import { describe, beforeEach, afterEach, it, expect, vi, type Mock } from 'vitest';
import { ERROR_CODES, type AuditLogQuery } from '@saas/shared';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import { tenantContext } from '../../prisma/tenant.extension.ts';
import { AuditService, type AuditRecord } from './audit.service.ts';

/**
 * AuditService 单测。
 *
 * 主目标是锁住「永不抛」这条契约：写库失败时 record() 必须正常 resolve。
 * 一旦破坏，拦截器里 `void record(...)` 会变成 unhandled rejection，
 * 严重时直接终止 Node 进程 —— 审计故障升级成全站故障。
 *
 * 用 mock 而非真库：真库正常时走不到 catch 分支，测不出这条契约；
 * 且要断言「异常被吞掉」只能让 create 明确 reject。
 */
describe('AuditService', () => {
  let create: Mock;
  let service: AuditService;

  const entry: AuditRecord = {
    tenantId: 't1',
    actorUserId: 'u1',
    action: 'member.remove',
    result: 'success',
    detail: { method: 'DELETE', path: '/members/m1', durationMs: 12 },
  };

  beforeEach(() => {
    create = vi.fn().mockResolvedValue({});
    service = new AuditService({ auditLog: { create } } as unknown as ExtendedPrismaClient);
    // 失败用例会打 error 日志，静音避免污染测试输出
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('正常写入：把 entry 原样交给 auditLog.create', async () => {
    await service.record(entry);
    expect(create).toHaveBeenCalledWith({ data: entry });
  });

  it('写库失败 → 吞掉异常，不向调用方抛（审计不能带崩主请求）', async () => {
    create.mockRejectedValue(new Error('pg down'));
    await expect(service.record(entry)).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});

/**
 * list 的单测。与上面 record 的用例分成独立 describe：
 * 两者契约方向相反（record 永不抛，list 该抛），共用一个 beforeEach 只会让
 * 「这个用例为什么要 mock 四个方法」变得不可读。
 *
 * 租户上下文用真实的 AsyncLocalStorage.run，不 mock 模块：
 * 这个 store 是 service 唯一的租户来源（不读 query / header），
 * mock 掉它等于把「有没有真的从上下文取」这条被测逻辑一起删了。
 */
describe('AuditService.list', () => {
  let count: Mock;
  let findMany: Mock;
  let findUsers: Mock;
  let service: AuditService;

  /**
   * 与 audit.service.ts 里私有的 AuditRow 同形。那边没 export（有意：外部不该依赖
   * 查询行形状），所以这里维护一份；改 service 的列时要同步这里，否则用例会因为
   * 「mock 返回的对象少字段」而测不到真实分支。
   */
  interface Row {
    id: string;
    action: string;
    objectType: string | null;
    objectId: string | null;
    actorUserId: string;
    result: 'success' | 'failed';
    ip: string | null;
    detail: unknown;
    createdAt: Date;
  }

  /** 一行正常的审计记录。用 Partial 覆盖来构造各用例的差异，避免每处写 9 个字段 */
  const row = (over: Partial<Row> = {}): Row => ({
    id: 'a1',
    action: 'member.remove',
    objectType: 'member',
    objectId: 'm1',
    actorUserId: 'u1',
    result: 'success',
    ip: '203.0.113.7',
    detail: { method: 'DELETE', path: '/api/v1/members/m1', durationMs: 12, objectName: '张三' },
    createdAt: new Date('2026-11-13T02:00:00.000Z'),
    ...over,
  });

  /**
   * page / pageSize 是 z.infer 的输出类型（有 default 故非可选），
   * 所以这里必须写全 —— 少写会让 `(page - 1) * pageSize` 算出 NaN，
   * 而单测直接 new service，绕过了把 default 补上的校验管道。
   */
  const baseQuery: AuditLogQuery = { page: 1, pageSize: 20 };

  const runAs = (tenantId: string, query: Partial<AuditLogQuery> = {}) =>
    tenantContext.run({ tenantId }, () => service.list({ ...baseQuery, ...query }));

  /** 取 mock 第 n 次调用收到的 where。count / findMany 入参形状相同，共用这一个取值器 */
  const whereOf = (mock: Mock, call = 0): Record<string, unknown> =>
    (mock.mock.calls[call]![0] as { where: Record<string, unknown> }).where;

  beforeEach(() => {
    count = vi.fn().mockResolvedValue(0);
    findMany = vi.fn().mockResolvedValue([]);
    findUsers = vi.fn().mockResolvedValue([]);
    service = new AuditService({
      auditLog: { create: vi.fn(), count, findMany },
      user: { findMany: findUsers },
    } as unknown as ExtendedPrismaClient);
  });

  afterEach(() => {
    // restoreAllMocks 不管假时钟，漏掉这行会让后续文件里的 Date.now() 一起被冻住
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('取不到租户上下文 → 403 TENANT_MISMATCH，且一条查询都不发', async () => {
    let caught: unknown;
    try {
      await service.list(baseQuery);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getResponse()).toMatchObject({
      code: ERROR_CODES.TENANT_MISMATCH,
    });
    // 关键：上下文缺失时绝不能「降级成全量查询」，否则等于把跨租户数据一次吐出
    expect(count).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('where 显式带上下文的 tenantId，且 count 与 findMany 共用同一个 where（AC-16）', async () => {
    await runAs('t1');
    expect(whereOf(count).tenantId).toBe('t1');
    // 用 toBe（同一引用）而不是 toEqual：这正锁住「共用一个 where 变量」。
    // 一旦有人为了可读性拆成两份字面量，改动时漏一处就会「总数 60、翻到第 3 页是空」。
    expect(whereOf(count)).toBe(whereOf(findMany));
  });

  it('query 里混入 tenantId 不能覆盖上下文（越权防线在 service，不依赖 schema strip）', async () => {
    // 绕过 zod 管道直接塞进去，模拟「将来有人给 query 加了 tenantId 字段」的最坏情况。
    // zod 的 strip 是第一道防线，service 不读 query.tenantId 是第二道 —— 这里测第二道。
    await runAs('t1', { tenantId: 't2' } as Partial<AuditLogQuery>);
    expect(whereOf(count).tenantId).toBe('t1');
  });

  it('不传 from 时默认查最近 30 天（假时钟锁边界）', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-13T00:00:00.000Z') });
    await runAs('t1');
    expect(whereOf(count).createdAt).toEqual({ gte: new Date('2026-10-14T00:00:00.000Z') });
  });

  it('传 from/to 时构造闭区间 gte/lte（AC-22）', async () => {
    const from = '2026-11-01T00:00:00.000Z';
    const to = '2026-11-13T23:59:59.000Z';
    await runAs('t1', { from, to });
    // 闭区间：前端选「11-01 到 11-13」时两端当天的记录都要在
    expect(whereOf(count).createdAt).toEqual({ gte: new Date(from), lte: new Date(to) });
  });

  it('只把传入的筛选项放进 where，未传的键不出现', async () => {
    await runAs('t1');
    expect(whereOf(count)).not.toHaveProperty('action');
    expect(whereOf(count)).not.toHaveProperty('result');
    expect(whereOf(count)).not.toHaveProperty('actorUserId');

    await runAs('t1', { action: 'member.remove', result: 'failed', actorUserId: 'u9' });
    expect(whereOf(count, 1)).toMatchObject({
      action: 'member.remove',
      result: 'failed',
      actorUserId: 'u9',
    });
    expect(whereOf(count, 1).createdAt).not.toHaveProperty('lte');
  });

  it('排序同时按 createdAt 与 id 倒序，保证翻页稳定（AC-18）', async () => {
    await runAs('t1');
    expect(findMany.mock.calls[0]![0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('分页下推到 DB：skip=(page-1)*pageSize、take=pageSize', async () => {
    await runAs('t1', { page: 3, pageSize: 20 });
    expect(findMany.mock.calls[0]![0]).toMatchObject({ skip: 40, take: 20 });

    await runAs('t1', { page: 1, pageSize: 5 });
    expect(findMany.mock.calls[1]![0]).toMatchObject({ skip: 0, take: 5 });
  });

  it('操作者只批量查一次，且 id 去重（AC-23）', async () => {
    findMany.mockResolvedValue([
      row({ id: 'a1', actorUserId: 'u1' }),
      row({ id: 'a2', actorUserId: 'u1' }),
      row({ id: 'a3', actorUserId: 'u2' }),
    ]);
    await runAs('t1');
    // 20 行 × 单次往返在 Neon 上会拖到 200ms+，这条钉住「固定 1 次」
    expect(findUsers).toHaveBeenCalledTimes(1);
    expect(findUsers.mock.calls[0]![0].where.id.in).toEqual(['u1', 'u2']);
  });

  it('detail 为 null / 数组 / 标量时摊平字段归 null，整页不抛', async () => {
    findMany.mockResolvedValue([
      row({ id: 'a1', detail: null }),
      row({ id: 'a2', detail: [1, 2] }),
      row({ id: 'a3', detail: 'oops' }),
    ]);
    const res = await runAs('t1');
    expect(res.items.map((i) => [i.path, i.statusCode, i.durationMs, i.objectName])).toEqual([
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]);
  });

  it('detail 正常时摊平 path / statusCode / durationMs，objectName 从 jsonb 取', async () => {
    findMany.mockResolvedValue([
      row({
        id: 'a1',
        detail: {
          method: 'PATCH',
          path: '/api/v1/members/m1',
          statusCode: 409,
          durationMs: 8,
          objectName: '张三',
        },
      }),
    ]);
    const res = await runAs('t1');
    expect(res.items[0]).toMatchObject({
      path: '/api/v1/members/m1',
      statusCode: 409,
      durationMs: 8,
      objectName: '张三',
      // 表里没这一列，只能来自 detail —— 顺手钉住「不是从行上读的」
      objectType: 'member',
      objectId: 'm1',
      ip: '203.0.113.7',
    });
  });

  it('操作者查不到（已注销）时 actorName/actorEmail 为 null，行本身不丢', async () => {
    findMany.mockResolvedValue([row({ id: 'a1', actorUserId: 'ghost' })]);
    findUsers.mockResolvedValue([]);
    const res = await runAs('t1');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ actorUserId: 'ghost', actorName: null, actorEmail: null });
  });

  /**
   * 角色快照。这组用例锁的是「角色只来自 detail，不来自任何现查」：
   * 一旦有人为了「补全历史数据」在 service 里加一次 membership 查询，
   * 第一条断言会立刻变红 —— 因为那条路径下 actorRole 会跟着 memberships 的现值走。
   */
  it('角色从 detail.actorRole 快照透出，与 memberships 现值无关', async () => {
    findMany.mockResolvedValue([
      // memberships 里这个人早就被降成 member 了，但记录里抄下的是当时的 admin
      row({ id: 'a1', detail: { path: '/p', actorRole: 'admin' } }),
    ]);
    const res = await runAs('t1');
    expect(res.items[0].actorRole).toBe('admin');
  });

  it('actorRole 缺失或非法时归 null，不猜、不抛', async () => {
    findMany.mockResolvedValue([
      // 本期之前写的历史记录：没有这个键
      row({ id: 'a1', detail: { path: '/p' } }),
      // 手工改库 / 将来新增档位后被回退：值不在枚举里
      row({ id: 'a2', detail: { actorRole: 'superadmin' } }),
      // 非字符串（jsonb 里什么都能存）
      row({ id: 'a3', detail: { actorRole: { role: 'owner' } } }),
      row({ id: 'a4', detail: null }),
    ]);
    const res = await runAs('t1');
    expect(res.items.map((i) => i.actorRole)).toEqual([null, null, null, null]);
  });

  it('操作者命中时把 nickname / email 填进列表项，并把 Date 转成 ISO 字符串', async () => {
    findMany.mockResolvedValue([row({ id: 'a1', actorUserId: 'u1' })]);
    findUsers.mockResolvedValue([{ id: 'u1', nickname: '李四', email: 'lisi@example.com' }]);
    const res = await runAs('t1');
    expect(res.items[0]).toMatchObject({
      actorName: '李四',
      actorEmail: 'lisi@example.com',
      createdAt: '2026-11-13T02:00:00.000Z',
    });
  });

  it('结果原样回传 total / page / pageSize（前端分页器按它算页数）', async () => {
    count.mockResolvedValue(41);
    findMany.mockResolvedValue([row()]);
    const res = await runAs('t1', { page: 2, pageSize: 20 });
    expect(res).toMatchObject({ total: 41, page: 2, pageSize: 20 });
    expect(res.items).toHaveLength(1);
  });

  it('空结果集不抛，items 为空数组', async () => {
    const res = await runAs('t1');
    expect(res).toMatchObject({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});
