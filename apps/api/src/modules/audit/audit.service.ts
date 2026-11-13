import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA } from '../../prisma/prisma.module.ts';
import type { ExtendedPrismaClient } from '../../prisma/prisma.service.ts';
import {
  AuditAction,
  AuditLogItem,
  AuditLogListResult,
  AuditLogQuery,
  ERROR_CODES,
  ROLE,
  type Role,
} from '@saas/shared';
import type { Prisma } from '../../generated/prisma/client.ts';
import { tenantContext } from '../../prisma/tenant.extension.ts';

/**
 * 一条审计记录。字段与 AuditLog model 的可见列一一对应。
 *
 * 为什么单独定义而不直接用 Prisma 的 AuditLogCreateInput：
 *   让 interceptor 依赖 ORM 生成类型，会把「审计契约」和 Prisma 版本绑死；
 *   这里用窄接口，由 service 负责最后一步映射。
 */
export interface AuditRecord {
  /** null = 账号级事件（如登录），当前无此类写入 */
  tenantId?: string | null;
  actorUserId: string;
  action: AuditAction;
  objectType?: string | null;
  objectId?: string | null;
  /** PG 列是 INET，只接受合法 IPv4/IPv6；调用方必须把空串兜成 null */
  ip?: string | null;
  result: 'success' | 'failed';
  /** 脱敏上下文：禁止放请求体原文、Authorization、cookie、令牌 */
  detail?: Prisma.InputJsonObject;
}

/**
 * 审计写入服务。唯一职责：把一条 AuditRecord 落到 audit_logs，失败就吞掉。
 *
 * 注入的是带租户扩展的 PRISMA client，但 AuditLog **不在** TENANT_SCOPED 白名单里，
 * 扩展不会给它自动加 tenant_id —— 这是有意的：
 *   1. 审计要能记录「跨租户」和「账号级」事件，自动注入会把这两种场景写歪；
 *   2. 读审计（后续的审计页）要按 tenant_id 显式过滤，由查询方控制更安全。
 * 所以 tenantId 一律由调用方在 entry 里显式给出。
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PRISMA) private readonly prisma: ExtendedPrismaClient) {}

  /**
   * 写一条审计。**永不抛异常** —— 审计是旁路，不能把业务请求带崩。
   * 调用方用 `void` 不 await，主请求不等这次 INSERT（Neon 远程库约 5–20ms）。
   *
   * 这条「永不抛」是契约而非实现细节，audit.service.spec 专门锁了它：
   * 一旦这里开始抛，拦截器里的 void 调用会变成 unhandled rejection，
   * 在某些 Node 版本上直接终止进程。
   */
  async record(entry: AuditRecord): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { ...entry } });
    } catch (err) {
      // 只打日志不重抛：审计库抖动不应导致业务 500
      this.logger.error(
        `审计写入失败 action=${entry.action}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * 审计列表查询
   * 与record 的永不抛异常相反，这里该抛异常，异常必须让前端看见
   * 两者共用同一个 AuditService只是数据同源，调用侧不要互相套用错误处理方式
   */
  async list(query: AuditLogQuery): Promise<AuditLogListResult> {
    /**
     * tenantId 只从 AsyncLocalStorage 取，不从 query / header 读。
     * 原因：TenantGuard 已经在请求入口校验过 membership 并把 role 挂到 req 上，
     * 这里再信一次入参等于把已被守卫拒绝的路径重新打开（攻击者换个 query 参数即可越权）。
     * 取不到只可能是路由漏配 @Roles 却绕过了守卫，属于配置错误，直接 403。
     */
    const tenantId = tenantContext.getStore()?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException({
        code: ERROR_CODES.TENANT_MISMATCH,
        message: '缺少租户上下文',
      });
    }
    const { from, to, action, result, actorUserId, page, pageSize } = query;
    /**
     * 默认只看最近 30 天。审计行保留 180 天，但「默认窗口」刻意窄于「保留期」：
     * 审计页最高频的诉求是「刚刚谁改了什么」，默认全量查 180 天会让索引扫过的行数
     * 多出数倍，而 95% 的查询结果在第一页之后没人看。要看更早的数据必须显式传 from。
     */
    const DAY_MS = 24 * 60 * 60 * 1000;
    const startDate = from ? new Date(from!) : new Date(Date.now() - 30 * DAY_MS);
    const endDate = to ? new Date(to!) : undefined;
    /**
     * ⚠️ tenantId 必须显式写。AuditLog 不在 tenant.extension.ts 的 TENANT_SCOPE 白名单里
     * （审计要能记录跨租户与账号级事件，自动注入会把那两种场景写歪），扩展不会兜底。
     * 漏写的症状是「查询成功、不报错、把别租户的审计一起返回」——只能靠人工比对发现。
     */

    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(action ? { action } : {}),
      ...(result ? { result } : {}),
      ...(actorUserId ? { actorUserId } : {}),
      // 闭区间：前端选「11-01 到 11-13」时两端的记录都要在（AC-22）
      createdAt: { gte: startDate, ...(endDate ? { lte: endDate } : {}) },
    };
    /**
     * count 与 findMany **共用同一个 where 变量**，不各写一份：
     * 分开写的话改动时必然漏一处，症状是「翻到第 3 页突然空了，但总数写着 60」。
     *
     * 用 Promise.all 而不是方案里的 $transaction([...])：
     *   1. 只读列表，两个查询之间没有一致性要求，差一两条 total 对分页体验无影响；
     *   2. 与 resources.service.list 保持同一模式，仓库里只有一种列表写法；
     *   3. Neon + PgBouncer 事务池下，批量事务会多出版式往返，而收益仅是一个
     *      没人会感知的强一致快照。
     */
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        /**
         * 必须带 id 做 tie-break。同一次操作失败后立刻重试会在同一秒写入多条，
         * 只按 createdAt 排序时 PostgreSQL 不保证稳定顺序 —— 翻页会出现
         * 「第 1 页第 3 条」和「第 2 页第 1 条」是同一条记录（AC-18）。
         */
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        // 分页下推到 DB，不要捞出后在内存 slice
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    /**
     * 操作者昵称批量取：一次 IN 查询，不是每行一次 findUnique（AC-23）。
     * 20 行 × 单次往返在 Neon 上会拖到 200ms+，而这里固定只有 1 次。
     * users 也不在白名单，不会被注入 tenantId，但 id 集合只来自已按租户过滤的
     * 审计行，所以不存在跨租户泄漏。
     */
    const actors = rows.length
      ? await this.prisma.user.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.actorUserId))] } },
          select: { id: true, nickname: true, email: true },
        })
      : [];
    const byId = new Map(actors.map((u) => [u.id, u]));

    return {
      items: rows.map((row) => toItem(row, byId.get(row.actorUserId))),
      total,
      page,
      pageSize,
    };
  }
}

/**
 * 列表查询用到的列，用窄接口而不是 Prisma 生成类型：
 * 避免 ORM 版本升级时把 service 的签名一起带偏。
 *
 * ⚠️ 这里**没有** objectName —— 表里没这一列。对象名是拦截器写进
 * detail.objectName 的，读的时候从 jsonb 里取。
 */
interface AuditRow {
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

interface ActorRow {
  id: string;
  nickname: string;
  email: string;
}

/**
 * jsonb → 可安全取键的对象。
 *
 * 不要写成 `(row.detail as { path: string }).path`：历史数据的 detail 为 null 时
 * 这里立刻抛 TypeError，整页 500。数组也要挡掉 —— `['a'][0]` 能取到值，
 * 但 `['a'].path` 是 undefined，语义上就是错的。
 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** jsonb 里的值没有类型保证，逐个窄化。类型不匹配一律归 null，不猜、不强转 */
const pickString = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const pickNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * 角色快照的窄化。写成三个 `===` 而不是 `(ROLES as string[]).includes(v)`：
 * jsonb 里的值可能是任意字符串（手工改库、旧版本写入），用 === 比较能同时
 * 完成「是不是合法角色」的**类型收窄**，不需要 `as Role` 这种断言 ——
 * 断言会把将来新增角色档位时漏改这里的风险藏起来。
 */
const pickRole = (v: unknown): Role | null =>
  v === ROLE.owner || v === ROLE.admin || v === ROLE.member ? v : null;

/** DB 行 → 接口出参。Date 显式转 ISO，与 resources.service 的 toItem 保持同一口径 */
function toItem(row: AuditRow, actor?: ActorRow): AuditLogItem {
  const detail = toRecord(row.detail);
  return {
    id: row.id,
    action: row.action,
    objectType: row.objectType,
    objectId: row.objectId,
    objectName: pickString(detail.objectName),
    actorUserId: row.actorUserId,
    // 账号被删/查不到时留 null，前端显示「已注销用户」，不要让整行消失
    actorName: actor?.nickname ?? null,
    actorEmail: actor?.email ?? null,
    /**
     * 来自 detail 的**写入时快照**，不是现查 memberships。
     * 别为了「补全历史数据」在这里加一次 membership 查询：那会把角色语义
     * 从「操作当时」悄悄换成「现在」，正好毁掉这个字段存在的理由。
     */
    actorRole: pickRole(detail.actorRole),
    result: row.result,
    ip: row.ip,
    path: pickString(detail.path),
    statusCode: pickNumber(detail.statusCode),
    durationMs: pickNumber(detail.durationMs),
    createdAt: row.createdAt.toISOString(),
  };
}
