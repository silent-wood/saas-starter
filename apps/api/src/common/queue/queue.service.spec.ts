import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service.ts';

const m = vi.hoisted(() => ({
  upsert: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  queueCtor: vi.fn(),
  redisCtor: vi.fn(),
}));

vi.mock('bullmq', () => {
  class Queue {
    upsertJobScheduler = m.upsert;
    close = m.close;
    constructor(name: string, opts: unknown) {
      m.queueCtor(name, opts);
    }
  }
  return { Queue };
});

vi.mock('ioredis', () => {
  class Redis {
    quit = m.quit;
    constructor(url: string, opts: unknown) {
      m.redisCtor(url, opts);
    }
  }
  return { Redis, default: Redis };
});

function configOf(url: string | null): ConfigService {
  return {
    get: (key: string) => (key === 'redis.url' ? url : undefined),
  } as unknown as ConfigService;
}

describe('QueueService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('无 REDIS_URL：降级模式，不建连接、注册与销毁全部空转（AC-01、AC-10）', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const service = new QueueService(configOf(null));

    expect(service.enabled).toBe(false);
    expect(service.connection).toBeNull();
    expect(m.redisCtor).not.toHaveBeenCalled();
    expect(m.queueCtor).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('队列降级'));

    // 注册 / 销毁在降级模式下安全空转，不抛错
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await expect(service.registerRepeatJobs()).resolves.toBeUndefined();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.quit).not.toHaveBeenCalled();
  });

  it('有 REDIS_URL：按 maxRetriesPerRequest:null 建连接，注册每日重复任务（AC-02、AC-11）', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const service = new QueueService(configOf('rediss://default:pass@example.upstash.io:6379'));

    expect(service.enabled).toBe(true);
    expect(m.redisCtor).toHaveBeenCalledExactlyOnceWith(
      'rediss://default:pass@example.upstash.io:6379',
      { maxRetriesPerRequest: null },
    );
    expect(m.queueCtor).toHaveBeenCalledExactlyOnceWith('cleanup', {
      connection: service.connection,
      skipVersionCheck: true,
    });

    await service.onModuleInit();
    expect(m.upsert).toHaveBeenCalledExactlyOnceWith(
      'daily-cleanup',
      { pattern: '0 3 * * *' },
      {
        name: 'daily-cleanup',
        data: {},
        opts: expect.objectContaining({
          attempts: 3,
          removeOnComplete: { count: 7 },
          removeOnFail: { count: 50 },
        }),
      },
    );
  });

  it('重复任务注册失败只记 error，不阻断启动（§4.4 降级语义）', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    m.upsert.mockRejectedValueOnce(new Error('redis unreachable'));
    const service = new QueueService(configOf('rediss://default:pass@example.upstash.io:6379'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('注册失败'), expect.any(Error));
  });

  it('优雅关闭：先关队列再断开连接（§4.3-7）', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const service = new QueueService(configOf('rediss://default:pass@example.upstash.io:6379'));

    await service.onModuleDestroy();
    expect(m.close).toHaveBeenCalledTimes(1);
    expect(m.quit).toHaveBeenCalledTimes(1);
    expect(m.close.mock.invocationCallOrder[0]).toBeLessThan(m.quit.mock.invocationCallOrder[0]);
  });
});
