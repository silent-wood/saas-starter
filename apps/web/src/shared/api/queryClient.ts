/**
 * 全局唯一的 QueryClient 实例。
 *
 * 为什么不直接放在 `app/main.tsx` 里：`shared/api/client.ts` 的响应拦截器需要在
 * 「租户上下文失效」（403 TENANT_MISMATCH）时主动清缓存，那是请求层唯一能确定
 * 事件发生的地方。实例放在模块里，两边 import 同一份；写在 main.tsx 里就只能靠
 * 层层透传或全局变量，前者污染组件签名，后者等于没有类型。
 *
 * 依赖方向：本文件不依赖任何业务模块，`main.tsx` 与 `client.ts` 都指向它，不构成环。
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1, // Retry failed requests once
      refetchOnWindowFocus: false, // Disable refetching on window focus
    },
  },
});
