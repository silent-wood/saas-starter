/**
 * e2e 专用环境加载。
 *
 * 为什么需要：`src/main.ts` 的第一行是 `import 'dotenv/config'`，但 e2e 直接
 * import `AppModule`，从不经过 main.ts。而 `prisma.service.ts` 在模块顶层就
 * `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`，
 * 于是 DATABASE_URL 为 undefined → 连到 localhost:5432 → ECONNREFUSED，
 * 且 Prisma 的报错 message 是空的，很难定位。
 *
 * 单元测试不受影响：它们把 PRISMA 整个 mock 掉了，不碰真实连接。
 */
import 'dotenv/config';
