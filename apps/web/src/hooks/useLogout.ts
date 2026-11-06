import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/shared/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';

/**
 * 退出登录（AuthLayout 顶栏与「选择团队」页共用）
 *
 * 顺序很重要：先 revoke 服务端 refresh token，再清本地。
 * 但接口失败也必须完成本地登出——否则用户会卡在一个「token 已失效、页面还以为在线」的死状态，
 * 只能手动清 storage 才能出来。所以 catch 里不能 return，只能吞掉错误继续往下走。
 */
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async () => {
    try {
      await authApi.logout();
    } catch {
      // 服务端可能已经把 refresh 吊销了（或 cookie 已过期），这里不影响本地登出
    }
    useAuthStore.getState().clear();
    useTenantStore.getState().clear();
    queryClient.clear();
    navigate('/login', { replace: true });
  };
}
