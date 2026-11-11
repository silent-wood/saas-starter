import { Module } from '@nestjs/common';
import { MailService } from './mail.service.ts';

/**
 * 邮件通道模块。
 *
 * 为什么从 `modules/auth` 提到 `common/`：05 的邀请邮件与 01 的验证/重置邮件
 * 是同一个通道、同一套 Resend 配置与 devMode 兜底逻辑，放在 auth 里会让
 * `MembersModule` 反向 import 认证模块 —— 模块边界变成「谁能发信取决于谁先存在」。
 * M3 的通知中心在这层之上加模板与偏好，不再搬第二次。
 *
 * 不做 @Global：只有真正发信的模块才 import 它，避免「随便哪个 service 都能发邮件」
 * 这种隐式依赖扩散。
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
