import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Spin } from 'antd';
import { useAuthStore } from '@/stores/auth';
import { ensureSession } from '@/app/session';

/**
 * 受保护路由守卫，同时承担「启动时会话恢复」的职责。
 *
 * 之所以把关卡放在这里而不是应用根部：公开页（登录 / 注册 / 找回密码…）不该为了
 * 判断登录态先发一次必然 401 的 refresh。只有真正需要登录的路径才值得探测。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    void ensureSession();
  }, []);

  if (status === 'booting') {
    // 恢复结果未知前不能直接 Navigate 到 /login：那就是「刷新 /app 闪一下登录页」
    return <Spin tip="正在恢复登录状态……" fullscreen />;
  }

  if (status !== 'authenticated') return <Navigate to="/login" replace />;

  return <>{children}</>;
}
