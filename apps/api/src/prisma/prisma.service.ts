import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { tenantScopedExtension } from './tenant.extension.ts';

/**
 * Prisma 7 里 PrismaClient 是「构造器类」，$extends 是实例方法，不能 PrismaClient.$extends(...)。
 * 必须先 new 一个裸实例（带 adapter），再在实例上挂扩展。扩展后的实例才是业务代码真正要用的 client。
 *
 * $extends 会返回一个【类型不同】的新 client（带扩展能力的类型），
 * 而 `extends PrismaClient` 得到的类本身不含 $extends 之后的类型信息。
 * 所以这里单独导出「已扩展实例」与它的类型，业务代码注入时用它标注。
 */
const baseClient = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
  }),
});

export const extendedClient = baseClient.$extends(tenantScopedExtension());
export type ExtendedPrismaClient = typeof extendedClient;

/**
 * 生命周期管理服务。
 *
 * 注意：这里【不再】继承 PrismaClient，而是持有一个已扩展的 client 并管理它的连接。
 * 原因：$extends 后的实例才带租户隔离能力；若再单独 new 一个裸 PrismaClient，
 * 会出现「两个实例、两个连接池」——既浪费连接，又可能各连各的、隔离逻辑旁路。
 * 所以全局只有一个连接池，生命周期统一挂在 extendedClient 上。
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  constructor() {}

  async onModuleInit() {
    // extendedClient 由 $extends 返回，底层连接池与 baseClient 共享；
    // 这里用 $connect 显式预热连接，fail-fast 暴露配置错误
    await extendedClient.$connect();
  }

  async onModuleDestroy() {
    await extendedClient.$disconnect();
  }
}
