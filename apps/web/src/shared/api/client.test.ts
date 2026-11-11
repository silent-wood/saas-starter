/**
 * 请求层对「租户上下文失效」的兜底。
 *
 * 这里的场景在真实环境里只有一个触发源：owner/admin 把成员移出团队后，
 * 该成员浏览器里残留的 `currentTenantId` 会让所有业务请求返回 403 TENANT_MISMATCH。
 * 如果请求层不处理，用户会卡在「满屏报错、头像下拉里还显示那个团队、点它没反应」
 * 的状态里 —— 因为失效的 id 恰好就是「当前项」。
 *
 * 用自定义 adapter 顶掉真实网络：能精确控制返回体，也不依赖后端。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { useTenantStore } from '@/stores/tenant';
import { api, raw } from './client';
import { queryClient } from './queryClient';

const originalAdapter = raw.defaults.adapter;

/**
 * 让下一次请求固定返回指定状态码与响应体。
 *
 * 自定义 adapter 必须自己 reject —— axios 内置的 validateStatus 是 xhr adapter
 * 调 settle 时做的，不走内置 adapter 就得手动抛 AxiosError，否则 4xx 会被当成
 * 成功响应放过去，拦截器根本收不到。
 */
function replyWith(status: number, body: unknown) {
  raw.defaults.adapter = async (config) => {
    throw new AxiosError('Request failed', String(status), config, null, {
      data: body,
      status,
      statusText: '',
      headers: {},
      config,
    });
  };
}

const MISMATCH_BODY = {
  success: false,
  error: { code: 'TENANT_MISMATCH', message: '无权访问该租户' },
};

describe('client 对 TENANT_MISMATCH 的兜底', () => {
  beforeEach(() => {
    queryClient.clear();
    useTenantStore.setState({
      tenants: [
        { id: 't_1', name: '星河科技', role: 'owner', status: 'active', lastActiveAt: null },
        { id: 't_2', name: '远山设计', role: 'member', status: 'active', lastActiveAt: null },
      ],
      currentTenantId: 't_1',
      tenantsLoaded: true,
      removedNotice: false,
    });
  });

  afterEach(() => {
    raw.defaults.adapter = originalAdapter;
  });

  it('清掉失效的 currentTenantId，并置「被移出」提示位', async () => {
    replyWith(403, MISMATCH_BODY);

    await expect(api.get('/resources')).rejects.toMatchObject({ code: 'TENANT_MISMATCH' });

    expect(useTenantStore.getState().currentTenantId).toBeNull();
    expect(useTenantStore.getState().removedNotice).toBe(true);
  });

  it("连 ['tenants'] 一起清缓存，否则落点层会拿旧列表把用户选回已失效团队", async () => {
    queryClient.setQueryData(['resource', 'r_1'], { id: 'r_1', name: '旧租户的资源' });
    queryClient.setQueryData(['tenants'], { items: [] });
    replyWith(403, MISMATCH_BODY);

    await expect(api.get('/resources')).rejects.toMatchObject({ code: 'TENANT_MISMATCH' });

    expect(queryClient.getQueryData(['resource', 'r_1'])).toBeUndefined();
    expect(queryClient.getQueryData(['tenants'])).toBeUndefined();
  });

  it('没有租户上下文时的 403 不算「被移出」（0 个团队访问 /app 也是这个错误）', async () => {
    useTenantStore.setState({ currentTenantId: null, tenants: [], tenantsLoaded: true });
    replyWith(403, MISMATCH_BODY);

    await expect(api.get('/resources')).rejects.toMatchObject({ code: 'TENANT_MISMATCH' });

    // 置位会弹出「你已不在该团队中」的错误提示，而这批用户从来没有过团队
    expect(useTenantStore.getState().removedNotice).toBe(false);
  });
});
