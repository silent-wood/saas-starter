import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';
import { envSchema } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // 把 configuration 工厂挂进来，ConfigService 才能取到 nodeEnv / port / corsOrigins
      load: [configuration],
      validationSchema: envSchema,
      validationOptions: {},
    }),
    HealthModule,
  ],
})
export class AppModule {}
