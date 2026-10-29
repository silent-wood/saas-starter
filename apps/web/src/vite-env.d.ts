/// <reference types="vite/client" />

// 环境变量类型声明（规范 §17）
// 新增 VITE_ 变量时必须同步两处：.env.example（示例值）+ 此接口（类型），
// 否则 import.meta.env.XXX 推断为 any，且 tsc 无法拦截拼写错误
interface ImportMetaEnv {
  /** API 基础地址（含版本前缀），如 http://localhost:3000/api/v1 */
  readonly VITE_API_BASE_URL: string;
  /** 请求超时时间（毫秒） */
  readonly VITE_API_TIMEOUT_MS: string;
  /** 应用标题（document.title / 登录页展示） */
  readonly VITE_APP_TITLE: string;
}

interface Meta {
  readonly env: ImportMetaEnv;
}
