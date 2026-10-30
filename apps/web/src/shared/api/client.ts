/**
 * axios 统一实例（规范 §9 / §18）
 *
 * 所有请求必须走此实例，禁止裸 fetch / 裸 axios：
 * - 请求拦截：自动注入 Authorization 头（token 读取统一走 TOKEN_KEY）
 * - 响应拦截：错误归一为 ApiError { code, message, httpStatus }，UI 层只消费归一结果
 *   - 401 → 清 token 跳登录（拦截器内处理，页面无需感知）
 *   - 其余 → 抛 ApiError，由调用方决定 message 提示还是表单字段错误
 */
import axios from 'axios';
import { TOKEN_KEY } from '@/app/guards/RequireAuth';

/** 归一后的错误结构：UI 层唯一消费的错误形态 */
export interface ApiError {
  /** 后端业务码（无后端约定时为 httpStatus） */
  code: number | string;
  /** 面向用户的可读消息 */
  message: string;
  /** HTTP 状态码；网络层错误（无响应）为 0 */
  httpStatus: number;
}

/** 与后端约定的响应包裹结构（接真实后端时按实际调整） */
interface ApiResponse<T = unknown> {
  code: number | string;
  message: string;
  data: T;
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 10000,
});

// 请求拦截：注入 token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：错误归一
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // 用 window.location 跳转而非 router 实例，避免与 router.tsx 循环依赖
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.replace('/login');
      return Promise.reject(toApiError(error, { code: 401, message: '登录已过期，请重新登录' }));
    }
    return Promise.reject(toApiError(error));
  },
);

/** 把任意抛出的错误归一为 ApiError */
function toApiError(error: unknown, overrides?: Partial<ApiError>): ApiError {
  if (axios.isAxiosError<ApiResponse>(error)) {
    const httpStatus = error.response?.status ?? 0;
    return {
      code: error.response?.data?.code ?? httpStatus,
      // 优先用后端 message，其次 axios 错误描述；网络层错误给用户可读文案
      message:
        error.response?.data?.message ??
        (httpStatus === 0 ? '网络不稳定，请稍后重试' : error.message || '请求失败，请稍后重试'),
      httpStatus,
      ...overrides,
    };
  }
  return {
    code: 'UNKNOWN',
    message: '未知错误，请稍后重试',
    httpStatus: 0,
    ...overrides,
  };
}

/** 类型守卫：判断异常是否为归一后的 ApiError */
export function isApiError(e: unknown): e is ApiError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e && 'httpStatus' in e;
}
