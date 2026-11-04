import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller.ts';
import { TenantsService } from './tenants.service.ts';

/**
 * 租户模块装配。
 *
 * 这里不需要 import 任何其它模块：
 *   - PrismaService 是 @Global 的（app.module 里 PrismaModule 注册并标记 global），
 *     本模块的 service 直接注入即可
 *   - JwtAuthGuard 是全局 APP_GUARD，也不需要在本模块声明
 *
 * 所以这个 module 只有 controller + service 一对，非常薄。
 */
@Module({
  // controllers：声明「哪些类是 HTTP 路由处理类」，由 Nest 实例化并挂到路由上
  controllers: [TenantsController],
  // providers：声明「哪些类需要被实例化并互相注入」，Nest 据此建立依赖关系
  providers: [TenantsService],
})
export class TenantsModule {}
