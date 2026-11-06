// ─────────────────────────────────────────────────────────────
// 统一响应包裹（与后端 TransformInterceptor / HttpExceptionFilter 一致）
// ─────────────────────────────────────────────────────────────

/**
 * 成功响应包裹，由后端 `TransformInterceptor` 统一套上，接口实现里不要自己拼。
 * 形如 `{ success: true, data, message: "OK", timestamp: 1730000000000 }`。
 */
export interface ApiSuccess<T> {
  /** 恒为 true；判断成败用它，不要用 HTTP 状态码 */
  success: true;
  /** 业务数据，结构与上面各 `*Result` schema 对应 */
  data: T;
  /** 提示语，成功时通常为 `OK` */
  message: string;
  /** 服务端时间戳（毫秒），用于排查时对齐日志 */
  timestamp: number;
}

/**
 * 失败响应包裹，由后端 `HttpExceptionFilter` 统一产出。
 * 形如 `{ success: false, error: { code, message, details }, timestamp }`。
 *
 * 前端取错误码的**正确路径是 `response.data.error.code`**，不是 `response.data.code`
 * —— 后者永远取不到，是联调期最常见的"所有错误都显示未知错误"的原因。
 */
export interface ApiFailure {
  /** 恒为 false */
  success: false;
  error: {
    /** 业务错误码，取值见 `ERROR_CODES`（如 `EMAIL_TAKEN` / `TOKEN_INVALID`） */
    code: string;
    /** 面向用户的可读消息，前端可直接展示，也可按 code 换成自己的文案 */
    message: string;
    /** 附加信息：字段校验错误时是逐字段的错误列表；生产环境不透出 */
    details?: unknown;
  };
}
