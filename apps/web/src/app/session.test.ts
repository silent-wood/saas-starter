import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ensureSession` 的三个不变量：
 * 1. 已有结论（登录 / 未登录）时不再请求刷新接口
 * 2. 并发调用只探测一次（StrictMode 双执行、多个守卫同时挂载）
 * 3. 刷新失败静默回落为未登录，不向调用方抛错
 */
const refreshMock = vi.fn();
const meMock = vi.fn();

vi.mock('@/shared/api/client', () => ({
  refreshAccessToken: () => refreshMock() as Promise<string>,
}));
vi.mock('@/shared/api/auth', () => ({
  authApi: { me: () => meMock() },
}));

/** 每次重置模块图，让 session.ts 的模块级锁与 zustand store 都回到初始态 */
async function setup() {
  vi.resetModules();
  const { useAuthStore } = await import('@/stores/auth');
  const { ensureSession } = await import('@/app/session');
  return { useAuthStore, ensureSession };
}

const USER = {
  id: 'usr_1',
  email: 'me@example.com',
  name: '李顺',
  emailVerified: true,
  avatarUrl: null,
};

describe('ensureSession', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    meMock.mockReset();
  });

  it('已有结论时不请求 refresh', async () => {
    const { useAuthStore, ensureSession } = await setup();
    useAuthStore.getState().clear(); // status → anonymous

    await ensureSession();

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('并发调用只探测一次 refresh', async () => {
    const { useAuthStore, ensureSession } = await setup();
    refreshMock.mockImplementation(async () => {
      useAuthStore.getState().setAccessToken('at_1');
      return 'at_1';
    });
    meMock.mockResolvedValue({ user: USER });

    // 模拟 StrictMode 下 effect 执行两次
    await Promise.all([ensureSession(), ensureSession()]);

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().accessToken).toBe('at_1');
  });

  it('refresh 失败时静默回落为未登录', async () => {
    const { useAuthStore, ensureSession } = await setup();
    refreshMock.mockRejectedValue(new Error('401'));

    await expect(ensureSession()).resolves.toBeUndefined();

    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(meMock).not.toHaveBeenCalled();
  });
});
