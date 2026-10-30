import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';

export interface HealthPayload {
  status: string;
  uptime: number;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthPayload {
    // 只返回 data —— 统一响应包装由步骤 4 的 TransformInterceptor 完成。
    // Controller 不要自己拼 { success, data, message, timestamp }，否则会被包两层。
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
