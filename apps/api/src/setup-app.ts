import {
  HttpStatus,
  INestApplication,
  StandardSchemaValidationPipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ERROR_CODES } from '@saas/shared';
import cookieParser from 'cookie-parser';
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
  // 解析 Cookie 到 req.cookies。refresh token 走 httpOnly cookie，
  // 没有这行，/auth/refresh 和 /auth/logout 里读到的 req.cookies 永远是 undefined。
  // 不传 secret：refresh token 本身是随机串 + 服务端存 SHA-256，
  // 不做 cookie 签名（多一层签名会让轮转时的比对逻辑变复杂，且没有安全收益）
  app.use(cookieParser());
  // Zod schema 校验（schema 来自 @saas/shared，与前端同源）
  // 校验失败统一抛 422 + VALIDATION_FAILED，并在 message 里带上具体字段错误，
  // 否则默认是 400 + 英文「Bad Request Exception」，前端拿不到「哪个字段错了」
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: (issues) => {
        // issues 是 Standard Schema 的校验结果数组，每项含 path（哪个字段）与 message（为什么错）
        const details = issues.map((issue) => ({
          path: issue.path?.map(String).join('.') ?? '',
          message: issue.message,
        }));
        return new UnprocessableEntityException({
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '请求参数校验失败',
          details,
        });
      },
    }),
  );

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
