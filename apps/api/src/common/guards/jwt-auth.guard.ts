import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.ts';
import { AuthenticatedRequest, JwtPayload } from '../types/authenticated-request.ts';
import { ERROR_CODES } from '@saas/shared';
/**
 * 全局鉴权守卫。注册为 APP_GUARD 后对**所有**路由生效，靠 @Public() 开口子。
 *
 * 只做两件事：验令牌、把 payload 挂到 req.user。
 * 租户校验（X-Tenant-Id 对应的 membership 是否存在）放到后续的 TenantGuard，
 * 因为不是所有接口都需要租户上下文（/auth/me、/tenants 就不需要）。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1) 先看 @Public()。装饰器既能标在方法上，也能标在整个 Controller 上，
    //    所以要把 handler 和 class 都传给 getAllAndOverride。
    //    数组顺序即优先级：[handler, class] → 方法级压过类级
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(req.headers.authorization);
    if (!token) {
      throw this.unauthorized(ERROR_CODES.UNAUTHORIZED, '未登录或者登录过期');
    }

    let payload: JwtPayload;
    try {
      // verifyAsync 同时校验签名与 exp。失败分两种：
      //   过期 → name 为 TokenExpiredError（前端据此触发 refresh）
      //   签名错 / 被篡改 → JsonWebTokenError
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch (err) {
      // 不用 instanceof 判断：jsonwebtoken 只是 @nestjs/jwt 的传递依赖，
      // 没直接装到 apps/api 的 dependencies 里，直接 import 它属于隐式依赖。
      // 靠 name 识别更稳，也少一个需要维护的依赖
      const name = err instanceof Error ? err.name : '';
      if (name === 'TokenExpiredError') {
        throw this.unauthorized(ERROR_CODES.TOKEN_EXPIRED, '登录过期，请重新登录');
      }
      throw this.unauthorized(ERROR_CODES.UNAUTHORIZED, '登录凭证无效');
    }
    // 2) 类型校验。refresh token 也是这段密钥签的、也带 sub，
    //    不查 type 就等于允许用 30 天有效期的 refresh 长期假冒 access
    if (payload.type !== 'access' || !payload.sub) {
      throw this.unauthorized(ERROR_CODES.UNAUTHORIZED, '登录凭证无效');
    }

    req.user = payload;
    return true;
  }

  /** 从 `Authorization: Bearer xxx` 里取令牌；格式不对一律当没带 */
  private extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const [schema, value] = header.split(' ');
    if (schema?.toLowerCase() !== 'bearer' || !value) return null;
    return value.trim() || null;
  }

  /**
   * 显式带上 code。HttpExceptionFilter 只在响应体里能读到 code 时才不套默认映射，
   * 否则 401 会被 STATUS_TO_CODE 兜底成通用码，前端无法区分「过期」和「无效」。
   */
  private unauthorized(code: string, message: string): UnauthorizedException {
    return new UnauthorizedException({
      code,
      message,
    });
  }
}
