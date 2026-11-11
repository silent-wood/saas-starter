import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type MemberItem,
  type MemberListResult,
  type UpdateMemberRoleInput,
  updateMemberRoleInputSchema,
} from '@saas/shared';
import { Audit } from '../../common/decorators/audit.decorator.ts';
import { Roles } from '../../common/decorators/roles.decorator.ts';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.ts';
import { actorFrom } from './actor.ts';
import { MembersService } from './members.service.ts';

/**
 * 成员管理 HTTP 入口（05 方案 §4.1）。
 *
 * 角色口径：
 *  - `GET /members` **不标 @Roles**：member 也能看团队通讯录（只读），
 *    前端按 `can()` 隐藏按钮；真正的写拦截在下面五个接口上。
 *  - 写接口统一 `@Roles('owner','admin')`；「admin 只能操作 member」「不能操作 owner」
 *    这类对象级规则在 service 里判，返回 403/409，不在这里表达（06 方案 §1.3）。
 */
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest): Promise<MemberListResult> {
    return this.membersService.list(actorFrom(req));
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  @Audit(AUDIT_ACTIONS.MEMBER_ROLE_CHANGE)
  updateRole(
    @Param('id') id: string,
    @Body({ schema: updateMemberRoleInputSchema }) body: UpdateMemberRoleInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<MemberItem> {
    return this.membersService.updateRole(id, body, actorFrom(req));
  }

  @Post(':id/disable')
  @Roles('owner', 'admin')
  @Audit(AUDIT_ACTIONS.MEMBER_DISABLE)
  disable(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<MemberItem> {
    // 禁用是状态位而非删除：对方仍占席位、数据保留，管理员可随时 enable 回来
    return this.membersService.setStatus(id, 'disabled', actorFrom(req));
  }

  @Post(':id/enable')
  @Roles('owner', 'admin')
  @Audit(AUDIT_ACTIONS.MEMBER_ENABLE)
  enable(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<MemberItem> {
    return this.membersService.setStatus(id, 'active', actorFrom(req));
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @Audit(AUDIT_ACTIONS.MEMBER_REMOVE)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ id: string }> {
    // 不物理删除：memberships 行留着，`joined_at` / `invited_by` 是成员变更的追溯依据
    return this.membersService.remove(id, actorFrom(req));
  }

  @Post(':id/transfer-owner')
  @Roles('owner')
  // 只有 owner 能转让 —— 这是唯一一个比「admin 可管理成员」更紧的操作
  @Audit(AUDIT_ACTIONS.MEMBER_TRANSFER_OWNER)
  transferOwner(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ tenantId: string; ownerId: string }> {
    return this.membersService.transferOwner(id, actorFrom(req));
  }
}
