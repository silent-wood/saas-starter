import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { PRISMA } from '../../prisma/prisma.module.ts';
import { ResourcesService } from './resources.service.ts';

describe('ResourcesService', () => {
  let service: ResourcesService;
  let resource: {
    findMany: Mock;
    count: Mock;
    findFirst: Mock;
    create: Mock;
    update: Mock;
    delete: Mock;
  };

  const row = {
    id: 'r1',
    name: '需求清单',
    description: null,
    category: '文档',
    createdBy: 'u1',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-02T00:00:00Z'),
    creator: { nickname: '小李' },
    deletedAt: null,
    deletedBy: null,
    deleter: null,
  };

  beforeEach(async () => {
    resource = {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ResourcesService, { provide: PRISMA, useValue: { resource } }],
    }).compile();

    service = moduleRef.get(ResourcesService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('列表：分页下推为 skip/take，total 取自 count', async () => {
    resource.count.mockResolvedValue(42);
    resource.findMany.mockResolvedValue([]);

    const res = await service.list({ page: 2, pageSize: 10 });

    expect(resource.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(res).toEqual({ items: [], total: 42, page: 2, pageSize: 10 });
  });

  it('列表：q 转大小写不敏感 contains，且排除软删', async () => {
    resource.count.mockResolvedValue(0);
    resource.findMany.mockResolvedValue([]);

    await service.list({ page: 1, pageSize: 20, q: 'abc' });

    expect(resource.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      name: { contains: 'abc', mode: 'insensitive' },
    });
  });

  it('详情：查不到抛 404 RESOURCE_NOT_FOUND', async () => {
    resource.findFirst.mockResolvedValue(null);

    const err = await service.detail('r1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).getResponse()).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('空 PATCH：不调用 update，回读当前记录', async () => {
    resource.findFirst.mockResolvedValue(row);

    const res = await service.update('r1', {});

    expect(resource.update).not.toHaveBeenCalled();
    expect(res).toMatchObject({ id: 'r1', createdByName: '小李' });
  });

  it('软删除：写 deletedAt 与 deletedBy，不是只写 updatedAt', async () => {
    resource.findFirst.mockResolvedValue(row);
    resource.update.mockResolvedValue({ ...row, deletedAt: new Date(), deletedBy: 'u1' });

    await service.softDelete('r1', 'u1');

    expect(resource.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { deletedAt: expect.any(Date), deletedBy: 'u1' },
    });
  });

  it('软删除：查不到（已删或跨租户）→ 404 且不写库', async () => {
    resource.findFirst.mockResolvedValue(null);

    await expect(service.softDelete('r1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    expect(resource.update).not.toHaveBeenCalled();
  });

  it('更新：where 必须带 deletedAt: null，回收站里的资源不可写', async () => {
    resource.findFirst.mockResolvedValue(null);

    await expect(service.update('r1', { name: '改' })).rejects.toBeInstanceOf(NotFoundException);
    expect(resource.findFirst).toHaveBeenCalledWith({
      where: { id: 'r1', deletedAt: null },
    });
  });

  it('回收站：窗口为「当前时间 - 30 天」', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
    resource.count.mockResolvedValue(0);
    resource.findMany.mockResolvedValue([]);

    await service.listTrash({ page: 1, pageSize: 20 });

    expect(resource.findMany.mock.calls[0][0].where.deletedAt).toEqual({
      gt: new Date('2026-10-10T00:00:00Z'),
    });
  });

  it('恢复超窗：查不到 → 404 且不写库', async () => {
    resource.findFirst.mockResolvedValue(null);

    await expect(service.restore('r1')).rejects.toBeInstanceOf(NotFoundException);
    expect(resource.update).not.toHaveBeenCalled();
  });

  it('彻底删除：先 findFirst 再 delete', async () => {
    resource.findFirst.mockResolvedValue(row);

    await service.purge('r1');

    expect(resource.findFirst).toHaveBeenCalledBefore(resource.delete);
    expect(resource.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('彻底删除：不存在时不调用 delete', async () => {
    resource.findFirst.mockResolvedValue(null);

    await expect(service.purge('r1')).rejects.toBeInstanceOf(NotFoundException);
    expect(resource.delete).not.toHaveBeenCalled();
  });
});
