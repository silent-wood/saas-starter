import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ERROR_CODES } from '@saas/shared';
import type { Request, Response } from 'express';

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.SUBSCRIPTION_STATE_INVALID,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ERROR_CODES.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: ERROR_CODES.RATE_LIMITED,
  [HttpStatus.INTERNAL_SERVER_ERROR]: ERROR_CODES.INTERNAL_ERROR,
};

function normalizeError(exception: unknown): NormalizedError {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'object' && payload !== null) {
      const obj = payload as Record<string, unknown>;
      const code =
        typeof obj.code === 'string'
          ? obj.code
          : (STATUS_TO_CODE[status] ?? ERROR_CODES.VALIDATION_FAILED);
      const message = typeof obj.message === 'string' ? obj.message : exception.message;
      const details = obj.details;
      return { status, code, message, details };
    }

    return {
      status,
      code: STATUS_TO_CODE[status] ?? ERROR_CODES.VALIDATION_FAILED,
      message: typeof payload === 'string' ? payload : exception.message,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Internal server error',
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, code, message, details } = normalizeError(exception);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${status} ${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      success: false,
      error: {
        code,
        message,
        details: process.env.NODE_ENV === 'production' ? undefined : details,
      },
      timestamp: Date.now(),
    });
  }
}
