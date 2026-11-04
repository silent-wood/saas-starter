import { Controller, Get, Req } from '@nestjs/common';
import type { TenantListResult } from '@saas/shared';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.ts';
import { TenantsService } from './tenants.service.ts';

/**
 * 租户 HTTP 入口。
 *
 * 本期的唯一路由：GET /tenants → 当前用户所属租户列表。
 * 路由前缀 /api/v1 是全局 prefix，这里 @Controller('tenants') 最终就是 /api/v1/tenants。
 *
 * 鉴权：这里【不】加 @Public()，所以走全局 JwtAuthGuard。
 *   守卫校验 access token 后会把 payload 里的 sub（用户 id）写进 req.user，
 *   controller 直接拿 req.user.sub 当「当前用户 id」，不信任任何客户端传参。
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
  async list(@Req() req: AuthenticatedRequest): Promise<TenantListResult> {
    // @Req() 拿到原始请求对象；req.user 是 JwtAuthGuard 校验通过后写入的
    //（类型 AuthenticatedRequest 在 common/types 里定义，含 { sub, type }）
    const items = await this.tenantsService.listByUser(req.user.sub);
    return { items };
  }
}
