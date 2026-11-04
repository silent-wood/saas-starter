import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES } from '@saas/shared';

/** 与 service 里写 expiresAt 的 15 分钟必须同源，所以提成常量 */
const VERIFY_TOKEN_TTL_MINUTES = 15;
/** 重置密码令牌有效期，与 AuthService 里 RESET_TOKEN_TTL 的 30 分钟同源 */
const RESET_TOKEN_TTL_MINUTES = 30;

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
}
