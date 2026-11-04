import { Global, Module } from '@nestjs/common';
import { extendedClient, PrismaService } from './prisma.service.js';

/**
 * Prisma 模块（全局）。
 *
 * 本次改造：除了保留 PrismaService（管连接生命周期），还额外提供一个
 * 「已挂租户隔离扩展」的 client，token 叫 PRISMA，业务代码注入它来读写数据。
 *
 * 为什么用 PRISMA token + useFactory，而不是直接 provider: extendedClient？
 *   因为 extendedClient 是一个【值】（$extends 的返回实例），不是可实例化的类。
 *   Nest 的 provider 可以用 { provide, useValue } 提供现成值，这里用 useFactory
 *   是为了将来可能注入 ConfigService 等依赖；当前用 useValue 也完全等价。
 */
export const PRISMA = Symbol('PRISMA'); // 注入 token。用 Symbol 避免与类名/字符串冲突

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: PRISMA, // 业务代码用 @Inject(PRISMA) 拿这个
      useValue: extendedClient, // 直接提供已扩展的实例
    },
  ],
  exports: [PrismaService, PRISMA],
})
export class PrismaModule {}
