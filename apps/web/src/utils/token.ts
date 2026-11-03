/**
 * 登录令牌存取（规范 §19：演示期存前端，接真实后端后评估 httpOnly cookie）
 *
 * 「记住我」的两个落点：
 * - 勾选 → localStorage（关浏览器仍在，下次免登录）
 * - 不勾选 → sessionStorage（关闭标签页即失效）
 *
 * 读取时两者都查、清除时两者都清：否则会残留一份旧 token，
 * 出现「已登出但仍能进 /app」这类难查的问题。
 */
export const TOKEN_KEY = 'token';

/** 读取当前登录令牌（持久态优先） */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

/** 写入登录令牌，remember 决定持久化位置 */
export function setToken(token: string, remember: boolean): void {
  clearToken();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, token);
}

/** 清除登录令牌（两个存储都清） */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}
