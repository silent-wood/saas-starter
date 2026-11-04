import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.ts';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator.ts';
import {
  ERROR_CODES,
  type ForgotPasswordInput,
  type ForgotPasswordResult,
  type LoginInput,
  type LoginResult,
  type LogoutResult,
  type MeResult,
  type RefreshResult,
  type RegisterInput,
  type RegisterResult,
  type ResetPasswordInput,
  type ResetPasswordResult,
  type VerifyEmailInput,
  VerifyEmailResult,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@saas/shared';
import type { Response, Request } from 'express';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.ts';

/** cookie 名与作用域提成常量：controller 与 e2e 断言要共用，写死两处必然对不上 */
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 认证 HTTP 入口。
 *
 * NestJS 里 Controller 只做四件事，业务全在 Service：
 *  1. 定义路由（@Post/@Get + 路径）
 *  2. 声明鉴权（@Public 放开 / 默认走全局 JwtAuthGuard）
 *  3. 解析入参（@Body/@Req/@Res）并做运行时校验（@Body({ schema })）
 *  4. 组装响应（含写 refresh cookie）
 *
 * 常用装饰器含义：
 *  - @Controller('auth')      → 所有路由前缀 /api/v1/auth（api/v1 是全局 prefix）
 *  - @Post('register')        → 子路径，最终是 POST /api/v1/auth/register
 *  - @HttpCode(201)           → 覆盖默认的 200 状态码（Nest 对 POST 默认返回 201）
 *  - @Public()                → 跳过全局 JwtAuthGuard，未登录也能访问
 *  - @Throttle(...)           → 覆盖默认限流（登录收紧到 5 次/15 分钟）
 *  - @Body({ schema })        → Nest 12 写法，由 StandardSchemaValidationPipe 校验
 *  - @Res({ passthrough:true})→ 拿到底层 res 但返回体仍由 Nest 处理（用于写 cookie）
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * `@Body({ schema })` 是 Nest 12 的写法：schema 挂到参数元数据上，
   * 由全局的 StandardSchemaValidationPipe 读取并校验。
   * 只写 `@Body() body: RegisterInput` 不会做任何运行时校验（TS 类型在运行时不存在）。
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body({ schema: registerSchema }) body: RegisterInput): Promise<RegisterResult> {
    return this.authService.register(body);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @Body({ schema: verifyEmailSchema }) body: VerifyEmailInput,
  ): Promise<VerifyEmailResult> {
    return this.authService.verifyEmail(body.token);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  forgotPassword(
    @Body({ schema: forgotPasswordSchema }) body: ForgotPasswordInput,
  ): Promise<ForgotPasswordResult> {
    return this.authService.forgotPassword(body);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body({ schema: resetPasswordSchema }) body: ResetPasswordInput,
  ): Promise<ResetPasswordResult> {
    return this.authService.resetPassword(body);
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    const { accessToken, refreshToken, user } = await this.authService.login(body);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResult> {
    const rawToken = this.readRefreshCookie(req);
    // 没有 cookie 直接拒：不必进 service 白算一次哈希
    if (!rawToken) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHORIZED,
        message: '登录已失效，请重新登录',
      });
    }
    const { accessToken, refreshToken } = await this.authService.refresh(rawToken);
    // 轮转：旧令牌已吊销，必须把新令牌写回去，否则前端手里那个下次就 401
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResult> {
    await this.authService.logout(this.readRefreshCookie(req));
    // clearCookie 的 path 必须与下发时完全一致，否则浏览器认为「不是同一个 cookie」，删不掉
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { ok: true };
  }

  /** 唯一需要登录的接口：没有 @Public()，走全局 JwtAuthGuard，req.user 由守卫写入 */
  @Get('me')
  me(@Req() req: AuthenticatedRequest): Promise<MeResult> {
    return this.authService.me(req.user.sub);
  }

  private readRefreshCookie(req: Request): string | undefined {
    // req.cookies 由 cookieParser 提供，@types/cookie-parser 里是 any；
    // 这里收窄成 Record，避免 any 一路传染到调用方
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true, // JS 读不到，XSS 也偷不走
      sameSite: 'strict', // 跨站请求不带，CSRF 的主要防线
      // 本地 http 下开 Secure 浏览器会直接丢弃 cookie，refresh 永远失败；
      // 所以按环境判断，不写死
      secure: this.config.getOrThrow<string>('nodeEnv') === 'production',
      path: REFRESH_COOKIE_PATH, // 只在 /api/v1/auth 下发送，业务接口拿不到它
      maxAge: this.config.getOrThrow<number>('jwt.refreshTtlDays') * MS_PER_DAY,
    });
  }
}
