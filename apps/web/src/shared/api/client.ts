/**
 * axios 统一实例（规范 §9 / §18）
 *
 * 所有请求必须走此实例，禁止裸 fetch / 裸 axios：
 * - 请求拦截：自动注入 Authorization 头（token 读取统一走 TOKEN_KEY）
 * - 响应拦截：错误归一为 ApiError { code, message, httpStatus }，UI 层只消费归一结果
 *   - 401 → 清 token 跳登录（拦截器内处理，页面无需感知）
 *   - 其余 → 抛 ApiError，由调用方决定 message 提示还是表单字段错误
 */
import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';

/** 后端统一成功体（TransformInterceptor 产出） */
export interface ApiEnvelope<T> {
  success: true;
  data: T;
  message: string;
  timestamp: number;
}

/** 422的字段级错误 */
export interface FieldError {
  path: string;
  message: string;
}

/** 后端统一错误体（HttpExceptionFilter 产出）*/
interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: FieldError[];
  };
}

/** 归一后的错误结构：UI 层唯一消费的错误形态 */
export interface ApiError {
  /** 后端业务码（无后端约定时为 httpStatus） */
  code: number | string;
  /** 面向用户的可读消息 */
  message: string;
  /** HTTP 状态码；网络层错误（无响应）为 0 */
  httpStatus: number;
  /** 错误详情 */
  details?: FieldError[];
}

export const raw = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 10000,
  // refresh 走 HttpOnly cookie,跨端口必须显示允许携带
  withCredentials: true,
});

/** 后端标了 @SkipTenant,不需要页不该带X-Tenant-Id */
const TENANT_FREE = [/^\/auth\//, /^\/tenants/];
/**这几个接口的401，不能再出发 refresh，否则死循环 */
const NO_RETRY = ['/auth/login', '/auth/refresh', '/auth/logout'];

// 请求拦截：注入 token
raw.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const tenantId = useTenantStore.getState().currentTenantId;
  const url = config.url ?? '';
  if (tenantId && !TENANT_FREE.some((re) => re.test(url))) {
    config.headers['X-Tenant-Id'] = tenantId;
  }
  return config;
});

/**
 * refresh
 * 轮转式 refresh 下并发调用是致命的，后两次会拿已吊销的旧token失败
 * 并把第一次刚换到的新token一并吊销。用模块级Promise加锁
 */
let refreshing: Promise<string> | null = null;

/**
 * 刷新 access token。
 *
 * 注意 `refreshing` 必须**接住**这个 Promise 本身：如果只写 `raw.post(...).then(...)`
 * 而不赋值，锁永远是空的，并发请求会各刷各的，轮转式 refresh 下后到的那次会拿
 * 已经被吊销的旧 token 失败，还会把前一次刚换到的新 token 一并吊销。
 */
export function refreshAccessToken(): Promise<string> {
  if (refreshing) return refreshing;
  refreshing = raw
    .post<ApiEnvelope<{ accessToken: string }>>('/auth/refresh')
    .then((res) => {
      const token = res.data.data.accessToken;
      useAuthStore.getState().setAccessToken(token);
      return token;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// 响应拦截：错误归一
raw.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;
    const url = config?.url ?? '';
    const shouldRetry =
      error.response?.status === 401 &&
      config &&
      !config._retry &&
      !NO_RETRY.some((p) => url.startsWith(p));
    if (shouldRetry) {
      config._retry = true;
      try {
        const token = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        return raw.request(config);
      } catch {
        // refresh 也失败：会话没了，清理干净再回登录页
        useAuthStore.getState().clear();
        useTenantStore.getState().clear();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.replace('/login');
        }
        throw toApiError(error);
      }
    }
    // 其余一律归一后抛出。这里必须 throw：拦截器若直接返回 undefined，
    // Promise 会变成 resolved，调用方的 catch 收不到，页面会把失败当成功往下渲染。
    throw toApiError(error);
  },
);

/** 把任意抛出的错误归一为 ApiError */
function toApiError(error: unknown): ApiError {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return {
      code: 'UNKNOWN',
      message: '未知错误，请稍后重试',
      httpStatus: 0,
    };
  }
  const httpStatus = error.response?.status ?? 0;
  const body = error.response?.data?.error;
  return {
    code: body?.code ?? String(httpStatus || 'NETWORK_ERROR'),
    // 优先用后端 message，其次 axios 错误描述；网络层错误给用户可读文案
    message:
      body?.message ?? (httpStatus === 0 ? '网络不稳定，请稍后重试' : '请求失败，请稍后重试'),
    httpStatus,
    details: body?.details,
  };
}

/**
 * 统一请求入口：解包 `{ success, data, message, timestamp }`，只把 `data` 交给调用方。
 *
 * 调用方拿到的是业务数据本身，不是 AxiosResponse —— 否则每个调用点都要写 `.data.data`，
 * 一处写错就是「页面显示 [object Object]」这种低级线上问题。
 */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await raw.request<ApiEnvelope<T>>(config);
  return res.data.data;
}

export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'GET', url }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'POST', url, data }),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'PATCH', url, data }),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: 'DELETE', url }),
};
