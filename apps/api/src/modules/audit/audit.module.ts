import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.ts';
import { AuditController } from './audit.controller.ts';

/**
 * 审计模块，只提供 AuditService。
 *
 * 为什么 @Global：
 *   AuditService 的消费方有两类 —— 全局拦截器（在 AppModule 注册）和后续各业务 service。
 *   不做全局模块的话，每个用到审计的业务模块都得 imports: [AuditModule]，
 *   漏一个就是启动期依赖解析失败，而这类错误只在启动时暴露、单测发现不了。
 *
 * 这里刻意**不**注册 AuditInterceptor：
 *   拦截器统一由 AppModule 的 APP_INTERCEPTOR 注册。若在模块里再 provide 一次，
 *   同一个拦截器会被 Nest 注册两遍，元数据生效两遍 —— 一次操作写两条审计记录。
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
