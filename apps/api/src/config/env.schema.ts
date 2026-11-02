import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // 迁移专用直连地址（绕开 Neon PgBouncer 池化）；命名与 Prisma 官方 directUrl 惯例一致
  DIRECT_URL: z.url().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  REDIS_URL: z.url().optional(),
  COS_ENDPOINT: z.url().optional(),
  COS_BUCKET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
