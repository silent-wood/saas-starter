import { create } from 'zustand';
import type { AuthUser } from '@saas/shared';

/** booting 必须是初始值：否则首帧被判成 anonymous，刷新页面会闪一下登录页 */
type AuthStatus = 'booting' | 'authenticated' | 'anonymous';

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  setSession: (token: string, user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  setBooted: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: 'booting',
  setSession: (accessToken, user) => set({ accessToken, user, status: 'authenticated' }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setBooted: () => set({ status: 'anonymous' }),
  clear: () => set({ accessToken: null, user: null, status: 'anonymous' }),
}));
