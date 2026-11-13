import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import {
  type AcceptInviteInput,
  type AcceptInviteResult,
  acceptInviteInputSchema,
  AUDIT_ACTIONS,
  type CreateInviteInput,
  type CreateInviteResult,
  createInviteInputSchema,
  type InvitePreview,
} from '@saas/shared';
import { Audit } from '../../common/decorators/audit.decorator.ts';
import { Roles } from '../../common/decorators/roles.decorator.ts';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator.ts';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.ts';
import { actorFrom } from './actor.ts';
import { MembersService } from './members.service.ts';

/**
 * 邀请 HTTP 入口。
 *
 * 两类接口混在同一 controller 里，鉴权口径完全不同，改的时候别混：
 *  - **管理侧**（`POST /`、`POST /:id/resend`、`DELETE /:id`）：在租户内操作，
 *    需要 `X-Tenant-Id` + `@Roles('owner','admin')`，审计标 `member.invite`。
 *  - **接受侧**（`GET /:token`、`POST /accept`）：`@SkipTenant()`，因为调用时
 *    用户还没有该租户的上下文（这正是「加入」这个动作本身）。**不能标 @Roles** ——
 *    `@SkipTenant` 下 `req.userRole` 恒为 undefined，RBAC 会一律拒绝（fail-closed）。
 *
 * 路由顺序：`accept` 放在 `:id/resend` 之前只是习惯，两者段数不同不会互相吃掉；
 * 真正要注意的是将来若加 `GET /invites`（列表），必须写在 `GET /:token` 之前。
 */
@Controller('invites')
export class InvitesController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  @Roles('owner', 'admin')
  @Audit(AUDIT_ACTIONS.MEMBER_INVITE, { objectType: 'invite' })
  create(
    @Body({ schema: createInviteInputSchema }) body: CreateInviteInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<CreateInviteResult> {
    // 201：产生了新资源。joinUrl 里的明文 token 只在此响应出现一次
    return this.membersService.invite(body, actorFrom(req));
  }

  @Post('accept')
  @SkipTenant()
  accept(
    @Body({ schema: acceptInviteInputSchema }) body: AcceptInviteInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<AcceptInviteResult> {
    // token 走 body 而不是路径：路径会进 access log 与审计 detail.path（06 方案 AC-11）
    return this.membersService.acceptInvite(body.token, req.user.sub);
  }

  @Get(':token')
  @SkipTenant()
  preview(@Param('token') token: string): Promise<InvitePreview> {
    return this.membersService.previewInvite(token);
  }

  @Post(':id/resend')
  @Roles('owner', 'admin')
  @Audit(AUDIT_ACTIONS.MEMBER_INVITE, { objectType: 'invite', objectIdParam: 'id' })
  resend(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<CreateInviteResult> {
    // 重发会轮换 token：旧链接立即失效，避免「两枚都能用的邀请」同时在外流传
    return this.membersService.resendInvite(id, actorFrom(req));
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @Audit(AUDIT_ACTIONS.MEMBER_INVITE, { objectType: 'invite', objectIdParam: 'id' })
  revoke(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ id: string }> {
    return this.membersService.revokeInvite(id, actorFrom(req));
  }
}
