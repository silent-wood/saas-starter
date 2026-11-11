import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES } from '@saas/shared';

/** 与 service 里写 expiresAt 的 15 分钟必须同源，所以提成常量 */
const VERIFY_TOKEN_TTL_MINUTES = 15;
/** 重置密码令牌有效期，与 AuthService 里 RESET_TOKEN_TTL 的 30 分钟同源 */
const RESET_TOKEN_TTL_MINUTES = 30;
/** 邀请链接有效期，与 MembersService 的 INVITE_TTL_MS 的 7 天同源 */
const INVITE_TTL_DAYS = 7;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly resend: Resend | null;

  constructor(private readonly config: ConfigService) {
    this.resend = this.config.getOrThrow<boolean>('mail.devMode')
      ? null
      : new Resend(this.config.getOrThrow<string>('mail.apiKey'));
  }

  async sendVerifyEmail(to: string, token: string): Promise<void> {
    // 链接指向前端页面而不是 API：用户点开后由前端取 query 里的 token 再调接口，
    // 这样链接不会因为 API 换域名而失效
    const url = `${this.config.getOrThrow<string>('appWebUrl')}/verify-email?token=${token}`;

    if (!this.resend) {
      // 本地 Resend 域名未验证，真发也会被拒。直接把链接打到终端，复制即可点开
      this.logger.warn(
        `[MAIL_DEV_MODE] 未发送邮件，验证链接（${VERIFY_TOKEN_TTL_MINUTES} 分钟内有效）：${url}`,
      );
      return;
    }
    const { error } = await this.resend.emails.send({
      from: this.config.getOrThrow<string>('mail.from'),
      to,
      subject: '请验证你的邮箱',
      html:
        `<p>点击下面的链接完成注册（${VERIFY_TOKEN_TTL_MINUTES} 分钟内有效）：</p>` +
        `<p><a href="${url}">${url}</a></p>`,
    });

    if (error) {
      // 账号已经建好（事务已提交），这里失败不回滚：
      // 用户重新提交注册会走「覆盖密码 + 重发」，比让账号卡在无邮件状态更容易自助恢复
      this.logger.error(`验证邮件发送失败 to=${to}：${error.name} ${error.message}`);
      throw new InternalServerErrorException({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: '验证邮件发送失败，请稍后重试',
      });
    }
  }

  async sendResetPasswordEmail(to: string, token: string): Promise<void> {
    // 与验证链接同理：指向前端页面而不是 API，前端取 query 里的 token 再调接口
    const url = `${this.config.getOrThrow<string>('appWebUrl')}/reset-password?token=${token}`;

    if (!this.resend) {
      this.logger.warn(
        `[MAIL_DEV_MODE] 未发送邮件，重置密码链接（${RESET_TOKEN_TTL_MINUTES} 分钟内有效）：${url}`,
      );
      return;
    }
    const { error } = await this.resend.emails.send({
      from: this.config.getOrThrow<string>('mail.from'),
      to,
      subject: '重置你的密码',
      html:
        `<p>点击下面的链接重置密码（${RESET_TOKEN_TTL_MINUTES} 分钟内有效）：</p>` +
        `<p><a href="${url}">${url}</a></p>`,
    });

    if (error) {
      // 与验证邮件同构：令牌已落库（事务已提交），这里失败不回滚，
      // 用户重新申请即可（forgot-password 每次申请都生成新 token，旧的自然失效）
      this.logger.error(`重置密码邮件发送失败 to=${to}：${error.name} ${error.message}`);
      throw new InternalServerErrorException({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: '重置邮件发送失败，请稍后重试',
      });
    }
  }

  /**
   * 发送邀请邮件。
   *
   * 与上面两个方法的关键差异：**失败不抛异常**。
   * 邀请行已经落库，接口要把 `joinUrl` 返回给管理员去复制转发（05 方案 AC-17）；
   * 这里的 5xx 会让前端以为"邀请没建成功"，管理员重试一次又轮换掉 token，
   * 反而把手上那条有效链接作废。所以只记日志，送达责任交给可复制的链接。
   */
  async sendInviteEmail(
    to: string,
    invite: { tenantName: string; inviterName: string; joinUrl: string },
  ): Promise<void> {
    if (!this.resend) {
      // devMode（本地 Resend 域名未验证，真发会被拒）：链接直接打终端，复制即可点开
      this.logger.warn(
        `[MAIL_DEV_MODE] 未发送邀请邮件，加入链接（${INVITE_TTL_DAYS} 天内有效）：${invite.joinUrl} → ${to}`,
      );
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.config.getOrThrow<string>('mail.from'),
      to,
      subject: `${invite.inviterName} 邀请你加入「${invite.tenantName}」`,
      html:
        `<p>${invite.inviterName} 邀请你加入团队「${invite.tenantName}」。</p>` +
        `<p>点击下面的链接接受邀请（${INVITE_TTL_DAYS} 天内有效）：</p>` +
        `<p><a href="${invite.joinUrl}">${invite.joinUrl}</a></p>` +
        `<p>如果这不是你预期的邀请，忽略本邮件即可。</p>`,
    });

    if (error) {
      // 不抛：见方法注释。管理员界面会同时展示可复制的链接
      this.logger.error(
        `邀请邮件发送失败 to=${to} tenant=${invite.tenantName}：${error.name} ${error.message}`,
      );
    }
  }
}
