import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ResourcesService } from './resources.service.ts';
import {
  AUDIT_ACTIONS,
  ResourceItem,
  type ResourceQuery,
  resourceQuerySchema,
  type TrashListResult,
} from '@saas/shared';
import { Audit } from '../../common/decorators/audit.decorator.ts';
import { Roles } from '../../common/decorators/roles.decorator.ts';

/**
 * 回收站。路由前缀 /api/v1/trash，与资源路由分属不同资源集合：
 * 资源的 DELETE 是「移进来」，这里的 DELETE 才是「彻底删掉」。
 *
 * ⚠️ @Controller('trash') 里的 'trash' 不能省。写成空 @Controller() 会挂到
 * 全局前缀根路径上，DELETE /api/v1/:id 与资源的删除路由撞车，表现为
 * 「删资源却把行物理删了」——这类错误 tsc 和 lint 都发现不了，只能靠路由自测。
 *
 * 权限：整组类级 @Roles('owner','admin')。回收站涉及不可恢复的操作，
 * member 连列表都看不到（07 方案 D-01）。RolesGuard 读的是方法优先、类兜底，
 * 所以这里标一次即对三个方法生效，不必每个方法重复。
 */
@Roles('owner', 'admin')
@Controller('trash')
export class TrashController {
  constructor(private readonly resources: ResourcesService) {}

  /**
   * GET /api/v1/trash —— 回收站列表，仅 30 天窗口内的行。
   * 不标 @Audit：读操作不进审计表，否则列表刷新会刷出大量无意义记录。
   */
  @Get()
  list(@Query({ schema: resourceQuerySchema }) query: ResourceQuery): Promise<TrashListResult> {
    // 复用资源的 query 契约：分页 + q + category 的语义在两侧一致，
    // 前端可以共用同一个筛选组件，也少维护一份 schema。
    return this.resources.listTrash(query);
  }

  /**
   * POST /api/v1/trash/:id/restore —— 从回收站恢复。
   * 用 POST 而不是 PATCH：这不是「部分更新字段」，而是触发一个状态迁移动作，
   * 路径语义上更像命令；且 id 之后还有 /restore 段，PATCH 反而不好读。
   */
  // 恢复不是「创建资源」，语义上是把既有行的状态改回来，因此显式 200；
  // 不写的话 Nest 对 POST 默认返回 201，与 07 方案 §3.2 不一致
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @Audit(AUDIT_ACTIONS.RESOURCE_RESTORE)
  restore(@Param('id') id: string): Promise<ResourceItem> {
    // 失败分支：不存在 / 跨租户 / 已超 30 天窗口，统一 404 RESOURCE_NOT_FOUND。
    // 超窗的行其实还在表里（等清理任务），但对用户来说已经等于没了，
    // 这里不区分「过期」和「不存在」，避免暴露删除时间。
    return this.resources.restore(id);
  }

  /** DELETE /api/v1/trash/:id —— 物理删除，不可恢复，故必须留审计 */
  @Delete(':id')
  @Audit(AUDIT_ACTIONS.RESOURCE_PURGE)
  purge(@Param('id') id: string): Promise<{ id: string }> {
    // 只删回收站内的行：service 会用 deletedAt > cutoff 收窄，
    // 传一条正常资源的 id 进来同样是 404，绕不过软删除保护
    return this.resources.purge(id);
  }
}
