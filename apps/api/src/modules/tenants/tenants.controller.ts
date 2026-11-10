import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  createTenantInputSchema,
  type CreateTenantInput,
  type CreateTenantResult,
  type TenantListResult,
} from '@saas/shared';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.ts';
import { TenantsService } from './tenants.service.ts';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator.ts';

/**
 * 租户 HTTP 入口。
 *
 * - `GET /tenants`  当前用户所属租户列表
 * - `POST /tenants` 创建团队（创建者即 owner）
 *
 * 路由前缀 /api/v1 是全局 prefix，这里 @Controller('tenants') 最终就是 /api/v1/tenants。
 *
 * 鉴权：两个接口都【不】加 @Public()，走全局 JwtAuthGuard。
 *  守卫校验 access token 后会把 payload 里的 sub 写进 req.user，
 *  controller 直接拿 req.user.sub 当「当前用户 id」，不信任任何客户端传参。
 *
 * 两个接口都必须 @SkipTenant()：它们都发生在「选定租户之前 / 之外」——
 * 列出租户时尚无 X-Tenant-Id 可选；创建租户时目标租户还不存在。
 */
@Controller('tenants')
export class TenantsController {
  // 参数属性注入：TS 自动声明字段并赋值。service 由 Nest DI 容器实例化并注入
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * 返回 { items: [...] }。
   *
   * 为什么包一层 items 而不是直接返回数组？
   *   一是响应结构可扩展（以后可能加 total、分页游标）；二是与 shared 的
   *   tenantListResultSchema 对齐 —— 校验 schema 是 { items: [...] }，返回必须匹配。
   *
   * 注意：这里只 return 数据本身，统一响应包装（{ success, data, ... }）由全局
   *   TransformInterceptor 完成，Controller 不要自己拼包装，否则会被包两层。
   */
  @Get()
  @SkipTenant()
  async list(@Req() req: AuthenticatedRequest): Promise<TenantListResult> {
    // @SkipTenant()：本接口就是「列出我能进哪些租户」，调用时还没选定租户，
    // 自然没有 X-Tenant-Id 可带。要它反而成了先有鸡还是先有蛋。
    // 数据范围由 req.user.sub 决定（service 里查 membership），不依赖租户上下文。

    // @Req() 拿到原始请求对象；req.user 是 JwtAuthGuard 校验通过后写入的
    //（类型 AuthenticatedRequest 在 common/types 里定义，含 { sub, type }）
    const items = await this.tenantsService.listByUser(req.user.sub);
    return { items };
  }

  /**
   * 创建团队。用于「用户被移出所有团队后自救」这条链路：
   * 没有这个接口，用户会在 0 个团队的状态里无处可去。
   *
   * 201 而非 200：产生了新资源。Nest 对 POST 默认就是 201，这里显式声明，
   * 避免以后有人把 @HttpCode 改到别的值而无从察觉。
   */
  @Post()
  @SkipTenant()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body({ schema: createTenantInputSchema }) body: CreateTenantInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<CreateTenantResult> {
    // ownerId 只取 token 里的 sub，请求体里没有这个字段（契约层就不给客户端这个念想）
    return this.tenantsService.create(req.user.sub, body.name);
  }
}
