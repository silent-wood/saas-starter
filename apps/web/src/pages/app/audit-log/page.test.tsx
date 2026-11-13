/**
 * 审计日志页测试（06 方案 F-23 / §7.3 验收口径）
 *
 * 覆盖五条：渲染（动作中文化 / 操作者昵称 / 结果 Tag）、失败记录的状态码、
 * 注销用户的降级、对象列的三级降级、空态文案。另加一条「首屏请求参数」，
 * 因为时间范围的 transform 是最容易写错又最难肉眼发现的一处。
 *
 * ProTable 的 request 是异步的，一律用 findBy* / waitFor，不要 getBy*。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp } from 'antd';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditLogItem, MemberItem } from '@saas/shared';
import { auditApi } from '@/shared/api/audit';
import { memberApi } from '@/shared/api/member';
import { AuditLogPage } from './page';

vi.mock('@/shared/api/audit', () => ({ auditApi: { list: vi.fn() } }));
vi.mock('@/shared/api/member', () => ({ memberApi: { list: vi.fn() } }));

/** 一条审计记录。用 Partial 覆盖构造差异，避免每处写 15 个字段 */
const log = (over: Partial<AuditLogItem> = {}): AuditLogItem => ({
  id: 'a1',
  action: 'member.remove',
  objectType: 'member',
  objectId: 'm_1234567890',
  objectName: '张三',
  actorUserId: 'u1',
  actorName: '李顺',
  actorEmail: 'lishun@example.com',
  // 写入时快照的角色，由接口吐出（不是前端从成员列表推的）
  actorRole: 'owner',
  result: 'success',
  ip: '203.0.113.7',
  path: '/api/v1/members/m_1234567890',
  statusCode: null,
  durationMs: 12,
  createdAt: '2026-11-13T02:00:00.000Z',
  ...over,
});

const mockList = (items: AuditLogItem[]) =>
  vi.mocked(auditApi.list).mockResolvedValue({
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
  });

/** 一行成员。角色 Tag 的数据源是 GET /members，不是审计接口本身 */
const member = (over: Partial<MemberItem> = {}): MemberItem => ({
  id: 'm_1',
  userId: 'u1',
  nickname: '李顺',
  email: 'lishun@example.com',
  avatarUrl: null,
  role: 'owner',
  status: 'active',
  joinedAt: '2026-01-01T00:00:00.000Z',
  isSelf: false,
  ...over,
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AntdApp>
          <AuditLogPage />
        </AntdApp>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.mocked(auditApi.list).mockReset();
    vi.mocked(memberApi.list).mockReset();
    // 操作者下拉的数据源，缺了它页面不会崩（有 `?.` 兜底），但 valueEnum 会是空对象
    vi.mocked(memberApi.list).mockResolvedValue({ members: [], invites: [] });
  });

  it('动作显示中文而不是动作码，操作者显示昵称', async () => {
    mockList([
      log({ id: 'a1' }),
      log({ id: 'a2', action: 'resource.create', objectType: 'resource', objectName: '需求文档' }),
      log({ id: 'a3', action: 'member.role_change' }),
    ]);
    renderPage();

    // 关键：页面上不该出现 member.remove 这种原始码（词表漏一条就会露出来）
    expect(await screen.findByText('移除成员')).toBeInTheDocument();
    expect(screen.getByText('创建资源')).toBeInTheDocument();
    expect(screen.getByText('修改成员角色')).toBeInTheDocument();
    expect(screen.queryByText('member.remove')).not.toBeInTheDocument();
    // 三行都带昵称，用 getAll 而不是 getBy
    expect(screen.getAllByText('李顺')).toHaveLength(3);
  });

  it('失败记录显示失败 Tag，hover 后能看到状态码', async () => {
    mockList([log({ result: 'failed', statusCode: 409 })]);
    renderPage();

    const failTag = await screen.findByText('失败');
    expect(failTag).toBeInTheDocument();
    // 状态码不占列宽，挂在 Tooltip 上；未 hover 时不在 DOM 里
    fireEvent.mouseEnter(failTag);
    expect(await screen.findByText('HTTP 409')).toBeInTheDocument();
  });

  it('操作者已注销时显示「已注销用户」而不是空白行', async () => {
    mockList([log({ actorName: null, actorEmail: null })]);
    renderPage();
    expect(await screen.findByText('已注销用户')).toBeInTheDocument();
  });

  it('对象列按「名字 → 类型 · id → —」三级降级', async () => {
    mockList([
      // 有名字：直接显示名字
      log({ id: 'a1', objectName: '张三' }),
      // 只有 id：类型中文名 + 前 8 位
      log({ id: 'a2', objectName: null, objectType: 'member', objectId: 'm_1234567890' }),
      // 都没有（v1.2 之前的历史记录）：显示破折号，不能拼出「undefined · 」
      log({ id: 'a3', objectName: null, objectType: null, objectId: null }),
    ]);
    renderPage();

    expect(await screen.findByText('张三')).toBeInTheDocument();
    expect(screen.getByText('成员 · m_123456')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  /**
   * 角色 Tag 的三条用例共同锁住一件事：**角色只来自接口的 actorRole**。
   * 一旦有人改成「用 actorUserId 回成员列表查」，第二条和第三条会同时变红。
   */
  describe('操作者角色（写入时快照）', () => {
    it('三档角色各自渲染成中文 Tag，且不依赖成员列表接口', async () => {
      // beforeEach 里 members 是空数组：若角色还从 GET /members 推，这里一个 Tag 都出不来
      mockList([
        log({ id: 'a1', actorUserId: 'u1', actorName: '李顺', actorRole: 'owner' }),
        log({ id: 'a2', actorUserId: 'u2', actorName: '王五', actorRole: 'admin' }),
        log({ id: 'a3', actorUserId: 'u3', actorName: '赵六', actorRole: 'member' }),
      ]);
      renderPage();

      // 角色来自 ROLE_LABEL，不是原始枚举值
      expect(await screen.findByText('Owner')).toBeInTheDocument();
      expect(screen.getByText('管理员')).toBeInTheDocument();
      expect(screen.getByText('成员')).toBeInTheDocument();
    });

    it('快照与成员列表现值冲突时以快照为准（记录写的是操作当时的角色）', async () => {
      vi.mocked(memberApi.list).mockResolvedValue({
        // 这个人现在已经是 owner
        members: [member({ userId: 'u1', nickname: '李顺', role: 'owner' })],
        invites: [],
      });
      // 但那条记录发生时他只是 member
      mockList([log({ actorUserId: 'u1', actorRole: 'member' })]);
      renderPage();

      expect(await screen.findByText('成员')).toBeInTheDocument();
      // 关键：显示「现在」的角色等于篡改历史，owner 不该出现在这一行
      expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    });

    it('没有快照（本期之前的历史记录）→ 不渲染 Tag，也不回退去问成员列表', async () => {
      vi.mocked(memberApi.list).mockResolvedValue({
        members: [member({ userId: 'u1', nickname: '李顺', role: 'owner' })],
        invites: [],
      });
      mockList([log({ actorUserId: 'u1', actorRole: null })]);
      renderPage();

      expect(await screen.findByText('李顺')).toBeInTheDocument();
      // 空着比猜一个准确：不能用「现在」的角色补「当时」的空
      expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    });
  });
  it('空结果集显示专用空态文案', async () => {
    mockList([]);
    renderPage();
    expect(await screen.findByText('当前筛选条件下没有审计记录')).toBeInTheDocument();
  });

  it('首屏请求带默认 30 天窗口与分页参数', async () => {
    mockList([log()]);
    renderPage();

    await waitFor(() => expect(auditApi.list).toHaveBeenCalled());
    const params = vi.mocked(auditApi.list).mock.calls[0]![0];
    expect(params).toMatchObject({ page: 1, pageSize: 20 });
    // transform 生效的证明：没传 from/to 时后端自己也有默认窗口，但前端必须显式传，
    // 否则用户改了时间范围再重置，两端窗口会悄悄不一致
    expect(params.from).toBeTruthy();
    expect(params.to).toBeTruthy();
    expect(new Date(params.from!).toString()).not.toBe('Invalid Date');
  });
});
