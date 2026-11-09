import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import configuration from './config/configuration.js';
import { envSchema } from './config/env.schema.js';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module.ts';
import { TenantsModule } from './modules/tenants/tenants.module.ts';
import { ResourcesModule } from './modules/resources/resources.module.ts';
import { TenantGuard } from './common/guards/tenant.guard.ts';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware.ts';
import { AuditModule } from './modules/audit/audit.module.ts';
import { AuditInterceptor } from './common/interceptors/audit.interceptor.ts';
import { RolesGuard } from './common/guards/roles.guard.ts';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // 把 configuration 工厂挂进来，ConfigService 才能取到 nodeEnv / port / corsOrigins
      load: [configuration],
      validationSchema: envSchema,
      validationOptions: {},
    }),

    // JWT 配置。global: true → 其它模块（Step 5 的 AuthModule）无需再 import JwtModule，
    // 直接注入 JwtService 即可签发 / 校验
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        // expiresIn 要数字（秒）。传字符串 '15m' 在 jsonwebtoken 的类型里是 StringValue 联合，
        // 从 ConfigService 取出来是宽 string，编译期就会报不兼容 —— 这也是 TTL 改数字型的原因
        signOptions: { expiresIn: config.getOrThrow<number>('jwt.accessTtlSeconds') },
      }),
    }),
    // 全局默认限流：100 次 / 分钟 / IP。单个路由可以用 @Throttle 覆盖得更严
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    AuditModule,
    ResourcesModule,
  ],
  providers: [
    // 全局守卫注册在这里，而**不是** app.useGlobalGuards(new JwtAuthGuard())：
    // useGlobalGuards 创建的实例不经过 DI 容器，构造函数里的 Reflector / JwtService 会是 undefined，
    // 表现为「一访问就 500」。APP_GUARD 走容器，依赖才能正常注入
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // TenantGuard 必须排在 JwtAuthGuard 之后：APP_GUARD 数组顺序即执行顺序，
    // 先由 JwtAuthGuard 验 token、写入 req.user.sub，TenantGuard 才能用它查 membership。
    // 顺序颠倒会拿到 undefined 的 req.user，所有受保护请求都 403
    { provide: APP_GUARD, useClass: TenantGuard },
    // 排在 TenantGuard 之后（末位）：它读的 req.userRole 由 TenantGuard 写入。
    // 它只读该字段、绝不查库，否则每个受保护请求会多一次 membership 查询。
    // 连带后果：标了 @SkipTenant() 的接口 userRole 一定是 undefined，
    // 所以 @Roles 与 @SkipTenant 不能同时标 —— 那样会 fail-closed 一律 403
    { provide: APP_GUARD, useClass: RolesGuard },
    // 审计。注册成全局拦截器而不是逐控制器 @UseInterceptors：
    // 后续新增的接口只要标 @Audit 就自动生效，不需要记得去挂拦截器。
    // 无 @Audit 的接口在 intercept 第一行就 return，零额外开销。
    // 注意放在 AuditModule 之后导入 —— AuditService 由它提供（虽然是 @Global，
    // 但 imports 里不列会让人误以为依赖关系不存在）
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 中间件对【所有路由】生效。读 X-Tenant-Id 建立租户上下文
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
