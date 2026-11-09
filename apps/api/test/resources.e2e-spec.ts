import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import bcrypt from 'bcrypt';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/setup-app.js';
import { extendedClient as prisma } from './../src/prisma/prisma.service.js';

/**
 * 资源 CRUD 与回收站的端到端用例。
 *
 * 覆盖 07 方案 §5.2 里最关键的几条链路：主流程、422 校验、member 越权、
 * 跨租户隔离、软删除→回收站→恢复。未覆盖的（空 PATCH、超窗恢复、分页边界）
 * 已在 resources.service.spec.ts 里用 mock 覆盖，e2e 只补「需要真实 HTTP + 真实
 * 租户扩展」才有意义的场景，避免每条都连库跑一遍拖慢 CI。
 *
 * 数据清理策略：本文件自建自清，不依赖预置 fixture。afterAll 按创建顺序反向删
 * （资源 → refreshToken → 租户 → 用户），漏一步就会因外键报 P2003 而残留数据。
 */
describe('资源 CRUD 与回收站 (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let memberToken: string;
  let adminTenantId: string;
  let memberTenantId: string;
  const userIds: string[] = [];
  const tenantIds: string[] = [];

  /** 造「用户 + 租户 + 成员关系」，返回直签的 access token */
  async function seedActor(role: 'owner' | 'admin' | 'member', tag: string) {
    const user = await prisma.user.create({
      data: {
        email: `${tag}@e2e.local`,
        nickname: tag,
        // 成本因子降到 4：e2e 不校验密码，只要列非空
        passwordHash: await bcrypt.hash('x', 4),
        emailVerifiedAt: new Date(),
      },
    });
    const tenant = await prisma.tenant.create({ data: { name: tag, ownerId: user.id } });
    await prisma.membership.create({
      data: { tenantId: tenant.id, userId: user.id, role },
    });
    userIds.push(user.id);
    tenantIds.push(tenant.id);

    const token = app.get(JwtService).sign({ sub: user.id, type: 'access' });
    return { token, tenantId: tenant.id, userId: user.id };
  }

  beforeAll(async () => {
    // 不用 Nest 的 createTestingModule([AppModule]) 简写，而是拿到 moduleRef 再
    // 手动 setupApp：全局管道、前缀、异常过滤器都在 setupApp 里装配，
    // 跳过它等于测了个和线上配置不一样的 app（422 会被测成 400）。
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = setupApp(moduleRef.createNestApplication());
    await app.init();

    const admin = await seedActor('admin', 'e2e-admin');
    adminToken = admin.token;
    adminTenantId = admin.tenantId;

    const member = await seedActor('member', 'e2e-member');
    memberToken = member.token;
    memberTenantId = member.tenantId;
  });

  afterAll(async () => {
    // 资源有 FK 指向 users，必须先清资源再删用户
    await prisma.resource.deleteMany({ where: { createdBy: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    // 审计表没有外键（用户/租户删了记录仍保留是它的设计），所以这里不会级联，
    // 必须按 tenantId 主动清：否则每跑一次 e2e 就往 audit_logs 里留一批垃圾行
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('新建 → 列表可见 → 详情 200', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/resources')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', adminTenantId)
      .send({ name: '需求清单', category: '文档', description: '季度汇总' })
      .expect(201);

    const id = created.body.data.id as string;

    const list = await request(app.getHttpServer())
      .get('/api/v1/resources?page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', adminTenantId)
      .expect(200);

    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0]).toMatchObject({ id, createdByName: 'e2e-admin' });

    await request(app.getHttpServer())
      .get(`/api/v1/resources/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', adminTenantId)
      .expect(200);
  });

  it('缺 category → 422 VALIDATION_FAILED', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/resources')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', adminTenantId)
      .send({ name: '没分类' })
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('VALIDATION_FAILED'));
  });

  it('member 写接口 → 403 ROLE_DENIED', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/resources')
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Tenant-Id', memberTenantId)
      .send({ name: '越权写入', category: '文档' })
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe('ROLE_DENIED'));

    await request(app.getHttpServer())
      .get('/api/v1/trash')
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Tenant-Id', memberTenantId)
      .expect(403);
  });

  it('跨租户访问他人资源 → 404 而不是 403', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/resources')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', adminTenantId)
      .send({ name: 'A 租户资源', category: '文档' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/resources/${created.body.data.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Tenant-Id', memberTenantId)
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe('RESOURCE_NOT_FOUND'));
  });

  it('删除 → 回收站可见 → 恢复 → 列表复现', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/resources')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Tenant-Id', adminTenantId)
      .send({ name: '待删除', category: '文档' })
      .expect(201);

    const id = created.body.data.id as string;
    const auth = { Authorization: `Bearer ${adminToken}`, 'X-Tenant-Id': adminTenantId };

    await request(app.getHttpServer()).delete(`/api/v1/resources/${id}`).set(auth).expect(200);

    const trash = await request(app.getHttpServer()).get('/api/v1/trash').set(auth).expect(200);
    expect(trash.body.data.items.map((i: { id: string }) => i.id)).toContain(id);

    await request(app.getHttpServer()).post(`/api/v1/trash/${id}/restore`).set(auth).expect(200);

    await request(app.getHttpServer()).get(`/api/v1/resources/${id}`).set(auth).expect(200);
  });
});
