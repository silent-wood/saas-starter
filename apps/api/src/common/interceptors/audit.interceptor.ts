import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../../modules/audit/audit.service.ts';
import { Observable, tap } from 'rxjs';
import { AuthenticatedRequest } from '../types/authenticated-request.ts';
import { AUDIT_KEY, type AuditMeta } from '../decorators/audit.decorator.ts';
import { tenantContext } from '../../prisma/tenant.extension.ts';

/**
 * 只把「非空字符串」当命中。响应体里可能出现 `id: ''`（部分 DTO 用空串表示"没有"），
 * 空串进 audit_logs.object_id 会变成一条指向不存在对象的记录。
 */
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * 从响应体 + 路径参数里取「对谁干的」。同步、纯函数，不 await 任何东西。
 *
 * ⚠️ params 的值类型是 `string | string[]`（Express 5 支持可重复参数），
 * 所以用 `str()` 统一收口而不是断言成 string —— 数组进 `object_id` 会被 Prisma 拼成 `a,b`。
 *
 * 顺序是有讲究的：
 * - id：响应体 `id` → 响应体 `inviteId` → params[objectIdParam]。
 *   后两者分别对应「邀请的响应体字段叫 inviteId」和「transfer-owner 返回
 *   { tenantId, ownerId } 没有 id」，漏了会只剩 null。
 * - name：`name` → `nickname` → `email`。邀请响应体里没有名字只有邮箱，不补这一档，
 *   「邀请成员」这条记录的对象列会只剩一串 cuid。
 */
const pickObject = (
  value: unknown,
  params: Record<string, string | string[] | undefined>,
  meta: AuditMeta,
): { objectId: string | null; objectName: string | null } => {
  const body = (value ?? {}) as Record<string, unknown>;
  return {
    objectId:
      str(body.id) ??
      str(body.inviteId) ??
      (meta.objectIdParam ? str(params[meta.objectIdParam]) : undefined) ??
      null,
    objectName: str(body.name) ?? str(body.nickname) ?? str(body.email) ?? null,
  };
};

/**
 * 审计拦截器：对标注了 @Audit 的接口自动留痕。
 *
 * 无 @Audit 的接口零开销（不查库、不建计时器）。
 * 执行时机在守卫之后 —— 此时 req.user 和租户上下文都已就绪。
 *
 * 为什么选 tap 而不是 map / finalize：
 *   tap 是旁路副作用，不改动流本身；map 要求改返回值，会逼着这里把结果原样再包一层。
 *   finalize 只给「结束」这一个信号，拿不到错误对象，分不清成功与失败。
 *   tap({ next, error }) 恰好给出这两条分支，且不吞异常。
 *
 * tap 的 `value` 是 controller 的**最终返回值**（Nest 的 InterceptorsConsumer.transformDeferred
 * 里已经 await 过 `next()` 并对 Promise 做了 `from()`），所以取对象不必改成 mergeMap。
 *
 * 为什么这里**不** try/catch：
 *   record() 内部已吞掉所有异常，这里再包一层只会掩盖「永不抛」契约被改坏的事实。
 *   火忘三件套缺一不可：`void` 不 await（主请求不等 INSERT）+ service 内 try-catch
 *   （库抖动不传染） + interceptor 不 catch（异常照常向上传播，业务错误码不被改写）。
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [ctx.getHandler()]);
    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const actorUserId = req.user?.sub;

    if (!actorUserId) {
      this.logger.warn(`接口标了 @Audit(${meta.action}) 但无登录用户，已跳过`);
      return next.handle();
    }

    const started = Date.now();
    /**
     * 上下文快照。只求值一次，成功/失败两条分支共用。
     *
     * ⚠️ path 必须用 req.path，不能用 req.originalUrl：
     *   originalUrl 带 query string，一旦接口出现 ?token=xxx（验证邮件、签名下载链接），
     *   明文令牌就会写进 audit_logs.detail 并保留 180 天，违反 AC-11。
     */
    const snapshot = (
      object: { objectId: string | null; objectName?: string | null },
      statusCode?: number,
    ) => ({
      // 从 AsyncLocalStorage 取当前租户：中间件为整个请求链建立了上下文，
      // 拦截器跑在同一条异步链里能读到；@SkipTenant 的接口读到 null，正好对应账号级事件
      tenantId: tenantContext.getStore()?.tenantId ?? null,
      actorUserId,
      action: meta.action,
      // 没声明 objectType 的动作（订阅、配额等）落 null，列里不显示类型
      objectType: meta.objectType ?? null,
      objectId: object.objectId,
      // 用 || 而非 ??：req.ip 在某些代理配置下是空串，INET 列不接受空串，必须兜成 null
      ip: req.ip || null,
      detail: {
        method: req.method,
        path: req.path,
        durationMs: Date.now() - started,
        /**
         * 角色快照 —— 「快照」在这里是字面意思：把当前值抄一份存进 jsonb，之后永不回查。
         *
         * 为什么必须抄下来，而不是查询时按 actorUserId 回 memberships 查：
         *   现查拿到的是「现在是什么角色」，本条记录发生时的角色早就不存在了。
         *   当事人从 admin 被降成 member 后，他三个月前那条「邀请成员」会显示成
         *   「成员」—— 审计记录被现状篡改，而它恰恰是用来追责的。
         *
         * 为什么这是免费的：TenantGuard 在请求入口为了做 RBAC 已经查过 membership，
         * 把结果挂在 req.userRole 上（tenant.guard.ts:71）。这里只是读一个内存字段，
         * 零额外查询 —— 相比读侧 join 每页少一次往返，且语义还更强。
         *
         * 不写 null 而是整个键都不写：与 objectName 同一策略。历史记录缺键与写 null
         * 在读侧都归一到 null，但「没这个键」在库里能一眼区分出「这条是新版写的」。
         * @SkipTenant 的接口 userRole 恒 undefined（守卫根本没跑），自然落到不写。
         */
        ...(req.userRole ? { actorRole: req.userRole } : {}),
        // 只在取到名字时写这个键。写 null 会让历史记录里出现一堆无意义的 null，
        // 反正查询侧缺键与 null 都归一到 null
        ...(object.objectName ? { objectName: object.objectName } : {}),
        // 只有 error 分支才带 statusCode。成功时 Nest 要等拦截器退出后才把状态码
        // 写回 res，此刻读 res.statusCode 只会拿到旧值（外加 @HttpCode(204) 也没生效）。
        ...(statusCode === undefined ? {} : { statusCode }),
      },
    });

    return next.handle().pipe(
      tap({
        // void 丢弃 Promise：审计写入不让主请求等（Neon 跨区一次 INSERT 约 5–20ms）
        next: (value: unknown) =>
          void this.auditService.record({
            ...snapshot(pickObject(value, req.params, meta)),
            result: 'success',
          }),
        error: (err: unknown) => {
          // 非 HttpException（Prisma 连接中断、TypeError 等）会被 Nest 内置的
          // BaseExceptionFilter 统一转成 500，所以这里也按 500 记，与真实响应码一致
          const statusCode = err instanceof HttpException ? err.getStatus() : 500;
          // 失败时没有响应体，只能退回路径参数；未声明 objectIdParam 就一律 null
          const objectId = meta.objectIdParam
            ? (str(req.params[meta.objectIdParam]) ?? null)
            : null;
          void this.auditService.record({
            ...snapshot({ objectId }, statusCode),
            result: 'failed',
          });
        },
      }),
    );
  }
}
