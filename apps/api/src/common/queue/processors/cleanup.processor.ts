import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { CLEANUP_JOB_NAME, CLEANUP_QUEUE_NAME, QueueService } from '../queue.service.ts';
import { CleanupService, type CleanupResult } from '../cleanup.service.ts';

/**
 * cleanup 队列的 Worker 侧（08 方案 §4.1）。
 *
 * 只在 QueueService.enabled 时创建 Worker；降级模式下本类构造后 worker 为 null，
 * 生命周期钩子全部空转。异常直接上抛给 BullMQ —— 重试语义（3 次 / 指数退避）
 * 由入队时的 JOB_DEFAULTS 定义，这里不做 catch，否则会吞掉重试（08 方案 §4.1）。
 */
@Injectable()
export class CleanupProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(CleanupProcessor.name);

  private readonly worker: Worker | null = null;

  constructor(
    queueService: QueueService,
    private readonly cleanupService: CleanupService,
  ) {
    if (!queueService.enabled || !queueService.connection) return;

    this.worker = new Worker(
      CLEANUP_QUEUE_NAME,
      async (job: Job): Promise<CleanupResult | null> => {
        if (job.name !== CLEANUP_JOB_NAME) return null;
        return this.cleanupService.run();
      },
      { connection: queueService.connection, concurrency: 1, skipVersionCheck: true },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `清理任务失败（第 ${job ? job.attemptsMade + 1 : '?'} 次尝试）：${err.message}`,
      );
    });
    this.worker.on('error', (err) => {
      this.logger.error(`Worker 异常：${err.message}`);
    });
  }

  /** 优雅关闭第一步：停 Worker（随后 QueueService 关队列与连接，08 方案 §4.3-7） */
  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
