import { Module } from '@nestjs/common';
import { QueueService } from './queue.service.ts';
import { CleanupService } from './cleanup.service.ts';
import { CleanupProcessor } from './processors/cleanup.processor.ts';

/**
 * 异步任务队列基建（08 方案）。
 *
 * 不做 @Global：目前只有本模块内的 Worker 用到队列能力，09/10 方案接入
 * 业务任务（COS 清理、邮件异步化）时由对应模块显式 import QueueModule
 * 注入 QueueService —— 与 MailModule 同样的「显式依赖」纪律。
 *
 * 无新增 HTTP 接口；REDIS_URL 缺失时整体降级，见 queue.service.ts。
 */
@Module({
  providers: [QueueService, CleanupService, CleanupProcessor],
  exports: [QueueService],
})
export class QueueModule {}
