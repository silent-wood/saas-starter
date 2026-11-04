import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { PRISMA } from '../../prisma/prisma.module.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      // HealthController 构造器注入了扩展 client（PRISMA token，/health/db 要查库），
      // 单测不连库 → 用 mock 顶掉，只验证控制器自身逻辑。
      // token 是 Symbol，必须 provide: PRISMA，与 controller 里的 @Inject(PRISMA) 对齐
      providers: [
        {
          provide: PRISMA,
          useValue: { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('应返回 status=ok', () => {
    expect(controller.check()).toMatchObject({
      status: 'ok',
    });
  });

  it('uptime 应为非负数字', () => {
    const { uptime } = controller.check();
    expect(typeof uptime).toBe('number');
    expect(uptime).toBeGreaterThanOrEqual(0);
  });

  it('timestamp 应为 ISO 字符串', () => {
    const { timestamp } = controller.check();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
  });

  it('checkDb 应返回 ok 与延迟毫秒数', async () => {
    const result = await controller.checkDb();
    expect(result.status).toBe('ok');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
