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
import { AuditAction } from '@saas/shared';
import { AUDIT_KEY } from '../decorators/audit.decorator.ts';
import { tenantContext } from '../../prisma/tenant.extension.ts';

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
    const action = this.reflector.getAllAndOverride<AuditAction>(AUDIT_KEY, [ctx.getHandler()]);
    if (!action) return next.handle();

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const actorUserId = req.user?.sub;

    if (!actorUserId) {
      this.logger.warn(`接口标了 @Audit(${action}) 但无登录用户，已跳过`);
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
    const snapshot = (statusCode?: number) => ({
      // 从 AsyncLocalStorage 取当前租户：中间件为整个请求链建立了上下文，
      // 拦截器跑在同一条异步链里能读到；@SkipTenant 的接口读到 null，正好对应账号级事件
      tenantId: tenantContext.getStore()?.tenantId ?? null,
      actorUserId,
      action,
      // 用 || 而非 ??：req.ip 在某些代理配置下是空串，INET 列不接受空串，必须兜成 null
      ip: req.ip || null,
      detail: {
        method: req.method,
        path: req.path,
        durationMs: Date.now() - started,
        // 只有 error 分支才带 statusCode。成功时 Nest 要等拦截器退出后才把状态码
        // 写回 res，此刻读 res.statusCode 只会拿到旧值（外加 @HttpCode(204) 也没生效）。
        ...(statusCode === undefined ? {} : { statusCode }),
      },
    });

    return next.handle().pipe(
      tap({
        // void 丢弃 Promise：审计写入不让主请求等（Neon 跨区一次 INSERT 约 5–20ms）
        next: () => void this.auditService.record({ ...snapshot(), result: 'success' }),
        error: (err: unknown) => {
          // 非 HttpException（Prisma 连接中断、TypeError 等）会被 Nest 内置的
          // BaseExceptionFilter 统一转成 500，所以这里也按 500 记，与真实响应码一致
          const statusCode = err instanceof HttpException ? err.getStatus() : 500;
          void this.auditService.record({
            ...snapshot(statusCode),
            result: 'failed',
          });
        },
      }),
    );
  }
}
