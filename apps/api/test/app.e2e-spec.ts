import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/setup-app.js';

describe('全局装配 (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // 与 main.ts 走同一套装配，保证 e2e 测到的就是线上形态
    app = setupApp(moduleFixture.createNestApplication());
    await app.init();
  });

  it('GET /api/v1/health 应返回 200 与统一响应包装', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          data: { status: 'ok' },
          message: 'OK',
        });
        expect(typeof body.data.uptime).toBe('number');
        expect(typeof body.data.timestamp).toBe('string');
        expect(typeof body.timestamp).toBe('number');
      });
  });

  it('未定义的路由应返回 404 与统一错误体（错误码为字符串）', () => {
    return request(app.getHttpServer())
      .get('/api/v1/not-exist')
      .expect(404)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: false,
          error: { code: 'NOT_FOUND' },
        });
        expect(typeof body.error.message).toBe('string');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
