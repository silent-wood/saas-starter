import { describe, expect, it } from 'vitest';
import { inviteTokenFrom, safeReturnTo } from './returnTo';

/**
 * 这两个函数是登录跳转与受邀注册的共同入口，一个错就是安全漏洞或功能失效，
 * 所以边界值全部钉死。
 */
describe('safeReturnTo', () => {
  it('保留站内绝对路径（含 query）', () => {
    expect(safeReturnTo('/app/resources')).toBe('/app/resources');
    expect(safeReturnTo('/join?token=abc')).toBe('/join?token=abc');
  });

  it('缺省或空串回落到工作台', () => {
    expect(safeReturnTo(null)).toBe('/app');
    expect(safeReturnTo(undefined)).toBe('/app');
    expect(safeReturnTo('')).toBe('/app');
  });

  it('协议相对地址必须被拦下（否则是开放重定向）', () => {
    expect(safeReturnTo('//evil.com')).toBe('/app');
    expect(safeReturnTo('//evil.com/join?token=x')).toBe('/app');
  });

  it('绝对 URL 与相对路径都拒绝', () => {
    expect(safeReturnTo('https://evil.com')).toBe('/app');
    expect(safeReturnTo('app/resources')).toBe('/app');
  });

  it('fallback 可替换：注册页用空串表示「不带 returnTo 回登录页」', () => {
    expect(safeReturnTo('//evil.com', '')).toBe('');
    expect(safeReturnTo('/app', '')).toBe('/app');
  });
});

describe('inviteTokenFrom', () => {
  it('从 /join 的 returnTo 里取出令牌', () => {
    expect(inviteTokenFrom('/join?token=abc123')).toBe('abc123');
    // 额外参数不影响
    expect(inviteTokenFrom('/join?from=mail&token=abc123')).toBe('abc123');
  });

  it('非 /join 路径一律不认——否则 token 会变成一个可外部构造的开关', () => {
    expect(inviteTokenFrom('/app/resources?token=abc')).toBeNull();
    expect(inviteTokenFrom('/joinx?token=abc')).toBeNull();
    expect(inviteTokenFrom('/join/extra?token=abc')).toBeNull();
  });

  it('没有 token 或 token 为空时返回 null', () => {
    expect(inviteTokenFrom('/join')).toBeNull();
    expect(inviteTokenFrom('/join?token=')).toBeNull();
    expect(inviteTokenFrom(null)).toBeNull();
    expect(inviteTokenFrom('')).toBeNull();
  });

  it('协议相对地址不会被当成邀请', () => {
    expect(inviteTokenFrom('//evil.com/join?token=abc')).toBeNull();
  });
});
