/**
 * 会话恢复（启动时用 refresh cookie 换 access token）
 *
 * 为什么不在应用启动时无条件恢复：refresh cookie 是 httpOnly 的，JS 读不到，
 * 未登录用户打开登录页时那次 refresh 必然 401。代价不只是服务端多一次无效请求，
 * 还包括首屏要多等一个网络往返才能渲染表单、控制台常驻一条红色 401。
 *
 * 所以改成**按需**：只有 RequireAuth 这类确实需要登录态的路由才调用 ensureSession()，
 * 公开页（登录 / 注册 / 找回 / 重置 / 验证邮箱）完全不碰网络。
 */
import { authApi } from '@/shared/api/auth';
import { refreshAccessToken } from '@/shared/api/client';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';

/**
 * 模块级 Promise 去重。
 *
 * 两个必要性：
 * 1. StrictMode 下 effect 会执行两次，不加锁就是两次 refresh —— 轮转式 refresh 下
 *    后一次会拿已被吊销的旧 cookie 失败，还会把前一次刚换到的 token 一并吊销。
 * 2. 未来多个守卫同时挂载（如 /app 与 /select-tenant 嵌套）也只探一次。
 */
let restoring: Promise<void> | null = null;

async function restoreSession(): Promise<void> {
  try {
    await refreshAccessToken();
    const { user } = await authApi.me();
    const token = useAuthStore.getState().accessToken;
    // refresh 成功但 store 里没 token，说明状态被别处清过，按未登录处理
    if (!token) throw new Error('missing token');
    useAuthStore.getState().setSession(token, user);
  } catch {
    // 没有有效 refresh cookie（首次访问 / 过期 / 被吊销）：静默按未登录处理，不打扰用户
    useAuthStore.getState().clear();
    useTenantStore.getState().clear();
  }
}

/**
 * 恢复登录态；已得出结论时直接返回，不会重复请求。
 *
 * 返回值总是 resolved —— 失败已在内部消化成 `status: 'anonymous'`，
 * 调用方无需 try/catch，判断 store 里的 status 即可。
 */
export function ensureSession(): Promise<void> {
  if (restoring) return restoring;
  // 已经有结论（authenticated / anonymous）就不再打扰后端
  if (useAuthStore.getState().status !== 'booting') return Promise.resolve();

  restoring = restoreSession().finally(() => {
    restoring = null;
  });
  return restoring;
}
