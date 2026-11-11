import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { MailModule } from '../../common/mail/mail.module.ts';
import { InvitesController } from './invites.controller.ts';
import { MembersController } from './members.controller.ts';
import { MembersService } from './members.service.ts';

/**
 * 成员与邀请模块（05 方案）。
 *
 * 依赖两项：
 *  - `MailModule`：发邀请邮件（失败不抛，链接随响应返回）
 *  - `AuthModule`：复用 `TokenService` 生成/哈希邀请令牌 —— 与验证邮件、
 *    refresh token 用同一套「明文仅在链路中出现、库里只存 sha256」的实现，
 *    避免成员模块自己再造一份哈希口径
 */
@Module({
  imports: [MailModule, AuthModule],
  controllers: [MembersController, InvitesController],
  providers: [MembersService],
})
export class MembersModule {}
