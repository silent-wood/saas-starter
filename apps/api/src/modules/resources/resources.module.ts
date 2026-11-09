import { Module } from '@nestjs/common';
import { ResourcesController } from './resources.controller.ts';
import { TrashController } from './trash.controller.ts';
import { ResourcesService } from './resources.service.ts';

/**
 * 资源域。两个控制器挂同一个 service：
 *   - ResourcesController → /api/v1/resources（CRUD + 软删除）
 *   - TrashController     → /api/v1/trash（回收站列表 / 恢复 / 彻底删除）
 * 拆两个控制器而不是塞一个，是因为权限粒度不同：回收站整组只对 owner/admin 开放
 * （类级 @Roles 一次搞定），而资源列表 member 也要能读。
 *
 * 这里不 import PrismaModule：它是 @Global 模块，PRISMA provider 全局可见。
 * 反过来，若在多个模块里重复 imports，会各自实例化一次 PrismaClient，
 * 连接池数量翻倍且扩展注册互相覆盖。
 */
@Module({
  controllers: [ResourcesController, TrashController],
  providers: [ResourcesService],
})
export class ResourcesModule {}
