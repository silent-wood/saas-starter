/**
 * `returnTo` 的统一校验与解析。
 *
 * 三处使用：登录页跳转、认证外壳的 Tab 切换、注册页识别受邀注册。**必须同一口径**——
 * 任意一处自己写判断，漏掉后半段就是开放重定向：`//evil.com` 会被浏览器当成
 * 协议相对 URL，直接跳出站外（方案 01 AC-28）。
 */

/**
 * 只接受站内绝对路径。`raw` 为空或不合法时返回 `fallback`（默认工作台）。
 *
 * 注意判断顺序：先判 `/` 再判 `//`，两个条件缺一不可。
 */
export function safeReturnTo(raw: string | null | undefined, fallback = '/app'): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback;
}

/**
 * 从 `returnTo` 里取出邀请令牌：`/join?token=xxx` → `xxx`，其余一律 null。
 *
 * 只认 `/join` 一个路径。别的页面即使带 `token` 参数也不算邀请——否则
 * 「注册页带任意 token 就跳过团队名」会变成一个可以从外部随意构造的开关，
 * 让普通注册静默拿到零团队账号。
 */
export function inviteTokenFrom(returnTo: string | null | undefined): string | null {
  if (!returnTo) return null;

  const [path, search = ''] = returnTo.split('?');
  if (path !== '/join') return null;

  const token = new URLSearchParams(search).get('token');
  return token ? token : null;
}
