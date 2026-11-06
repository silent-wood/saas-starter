import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';

/** refresh / 邮件令牌统一 32 字节随机数 （hex 后 64 字符，与库里 VarChar(64)对齐） */
const OPAQUE_TOKEN_BYTES = 32;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** 生成不可猜测的随机令牌，明文只出现在邮件链接 或者 响应 cookie里，不会落库 */
  createOpaqueToken(): string {
    return randomBytes(OPAQUE_TOKEN_BYTES).toString('hex');
  }
  /**
   * SHA-256 hex。用哈希而不是加密；校验时只需比对哈希，服务端无需保留可还原的原值
   * 库被读走也无法直接冒用令牌
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * 签发 access token。载荷只有 { sub, type}
   * 不放email / nickname 这类可变信息 - 令牌签发后无法修改
   * 写进去的东西会一直停留在签发那一刻，用户改了昵称就对不上
   */
  signAccessToken(userId: string): Promise<string> {
    return this.jwt.signAsync({
      sub: userId,
      type: 'access',
    });
  }

  /** refresh 的过期时刻。落库 expires_at 与 cookie maxAge 都从这里取，避免两处各算一次算出偏差 */
  refreshExpiresAt(now = new Date()): Date {
    return new Date(now.getTime() + this.refreshTtlMs());
  }

  refreshTtlMs(): number {
    return this.config.getOrThrow<number>('jwt.refreshTtlDays') * MS_PER_DAY;
  }
}
