// ⚠️ 必须是第一条 import，不能挪到下面。
//
// 原因：prisma.service.ts 在【模块顶层】就执行 new PrismaClient() 并读取
// process.env.DATABASE_URL。ESM 的 import 按依赖图深度优先求值，app.module.js
// 会连带求值 prisma.service.js —— 此时本文件后面的语句都还没执行。
// ConfigModule.forRoot() 加载 .env 发生在 Nest DI 阶段，更晚，救不了这个时机。
//
// 后果：没有这行时 `node dist/main.js`（start:prod）读到的 DATABASE_URL 是 undefined，
// Prisma 连到 localhost 默认端口，所有查库请求 500。而 `nest start` 看不出问题，
// 因为 Nest CLI 自己加载了 .env 并让子进程继承 —— 典型的「dev 正常、上线即挂」。
// 生产环境用真实环境变量时，dotenv 不会覆盖已存在的值，行为不变。
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);

  await app.listen(app.get(ConfigService).getOrThrow<number>('port'));
}

await bootstrap();
