import { INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';

/**
 * 全局装配：前缀、校验、统一响应 / 统一错误、安全头、CORS、Swagger。
 *
 * 抽成独立函数的原因：`src/main.ts` 与 `test/` 下的 e2e 必须装出**同一个**应用，
 * 否则 e2e 测的是「没装配过的应用」，测不出前缀与统一响应体是否真的生效。
 */
export function setupApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  // Zod schema 校验（schema 来自 @saas/shared，与前端同源）
  app.useGlobalPipes(new StandardSchemaValidationPipe());

  // 统一响应 / 统一错误
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // NestJS 12 内置安全头（等价 Helmet 默认集）
  app.useSecurityHeaders();

  app.enableCors({
    origin: config.getOrThrow<string[]>('corsOrigins'),
    credentials: true, // refresh token 走 httpOnly cookie，必须开
  });

  // Swagger：仅非生产开放
  if (config.get<string>('nodeEnv') !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('SaaS Starter API')
        .setDescription('SaaS Starter 后端 API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    // useGlobalPrefix: true → 文档与业务接口同前缀，统一挂在 /api/v1/docs
    SwaggerModule.setup('docs', app, doc, { useGlobalPrefix: true });
  }

  return app;
}
