import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const CLEANUP_QUEUE_NAME = 'cleanup';
export const CLEANUP_JOB_NAME = 'daily-cleanup';
/** 每日 03:00（进程本地时区）触发，08 方案 §4.3-8 */
export const CLEANUP_CRON = '0 3 * * *';

/** 任务默认策略：失败重试 3 次、指数退避、成功/失败集按 08 方案 §4.3-5 保留 */
export const JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 60_000 },
  removeOnComplete: { count: 7 },
  removeOnFail: { count: 50 },
} as const;

/**
 * 队列基建的唯一出入口（08 方案）。
 *
 * 降级是显式状态而不是错误：`redis.url` 缺失（本地开发 / 单测没配 REDIS_URL）时
 * `enabled = false`，不建任何连接，enqueue 只 warn。业务模块注入本服务时**不需要**
 * 判断 enabled —— 降级模式下调用方语义是「任务被丢弃」，与 08 方案 AC-10 一致；
 * 真正关心执行结果的只有 Worker 侧（同样以 enabled 分支跳过创建）。
 *
 * 连接参数必须 maxRetriesPerRequest: null：BullMQ Worker 依赖阻塞命令（BRPOPLPUSH 等），
 * ioredis 默认的每请求重试上限会让阻塞命令在空闲超时后报错。
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  /** REDIS_URL 已配置 = 队列功能启用 */
  readonly enabled: boolean;

  /** 降级模式下为 null；CleanupProcessor 借它建 Worker 连接 */
  readonly connection: Redis | null = null;

  private readonly cleanupQueue: Queue | null = null;

  constructor(config: ConfigService) {
    const url = config.get<string | null>('redis.url');
    this.enabled = Boolean(url);
    if (!url) {
      // 只 warn 一次（构造期），不作为运行期噪音
      this.logger.warn('[队列降级] 未配置 REDIS_URL，定时清理任务不会执行（08 方案 §4.3-1）');
      return;
    }
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    // skipVersionCheck：Upstash 免费档受限用户无 INFO 权限，BullMQ 建连时的
    // 版本探测 info() 会报 NOPERM 并随重连刷屏（08 方案 §4.3-3）
    this.cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, {
      connection: this.connection,
      skipVersionCheck: true,
    });
  }

  /**
   * 注册每日重复清理任务（BullMQ 6 的 job scheduler API：同一 schedulerId 重复
   * upsert 即更新，应用每次重启都调一遍是幂等的，08 方案 §4.3-6）。
   */
  async registerRepeatJobs(): Promise<void> {
    if (!this.cleanupQueue) return;
    await this.cleanupQueue.upsertJobScheduler(
      CLEANUP_JOB_NAME,
      { pattern: CLEANUP_CRON },
      { name: CLEANUP_JOB_NAME, data: {}, opts: { ...JOB_DEFAULTS } },
    );
    this.logger.log(`定时清理任务已注册（cron: ${CLEANUP_CRON}）`);
  }

  /** 启动时注册重复任务；注册失败不阻断应用启动，error 后继续（Redis 暂不可达时由重试兜底） */
  async onModuleInit(): Promise<void> {
    if (!this.cleanupQueue) return;
    try {
      await this.registerRepeatJobs();
    } catch (err) {
      this.logger.error('重复清理任务注册失败，将在下次重启时重试', err as Error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // 顺序见 08 方案 §4.3-7：先停 Worker（在 CleanupProcessor），再关队列与连接
    await this.cleanupQueue?.close();
    await this.connection?.quit();
  }
}
