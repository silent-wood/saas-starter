import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
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
});
