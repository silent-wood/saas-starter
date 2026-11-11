/**
 * 业务错误码 → 用户文案映射（07 方案 §3.3）
 *
 * 表单校验失败（VALIDATION_FAILED）不走这里：字段级错误按 details.path 回填，
 * 由表单组件自行处理；这里兜的是「无字段信息」的分支。
 */
import { ERROR_CODES } from '@saas/shared';
import type { ApiError } from './client';

const ERROR_TEXT: Record<string, string> = {
  [ERROR_CODES.ROLE_DENIED]: '当前角色无权执行该操作',
  [ERROR_CODES.RESOURCE_NOT_FOUND]: '资源不存在或已被删除',
  [ERROR_CODES.TENANT_MISMATCH]: '无权访问该租户，请重新选择',
  [ERROR_CODES.INTERNAL_ERROR]: '服务异常，请稍后重试',
};

/** 兜底文案：未知错误统一口径，不把原始 message 直出给用户 */
const FALLBACK_TEXT = '服务异常，请稍后重试';

/**
 * 把拦截器归一的 ApiError 转成展示文案。
 * 恢复场景的 404 语义不同（超 30 天窗口），调用方用 restoreErrorText 特判。
 */
export function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in (err as ApiError)) {
    const apiErr = err as ApiError;
    if (typeof apiErr.code === 'string') {
      return ERROR_TEXT[apiErr.code] ?? apiErr.message ?? FALLBACK_TEXT;
    }
  }
  return FALLBACK_TEXT;
}

/** 恢复失败 404 的专属文案（07 方案异常分支 #7） */
export const RESTORE_EXPIRED_TEXT = '该资源已超过 30 天可恢复期';
