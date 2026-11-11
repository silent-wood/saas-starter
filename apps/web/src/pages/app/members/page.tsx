/**
 * 成员管理页（05 方案 §3.2）
 *
 * 一屏两块：**成员**（active / disabled）与**待接受的邀请**（pending），
 * 数据由 `GET /members` 一次返回，不用两次请求拼装。
 *
 * 权限口径：页面本身对全员开放（member 也能看通讯录），写操作按钮按 `can()` 渲染；
 * 真正的拦截在后端。「谁能操作谁」还有第二层对象级规则（admin 只能动 member、
 * 不能动 owner、不能动自己），前端用 `canOperate` 镜像同一套规则，
 * 让没有权限的行直接置灰，而不是点了才报 403。
 */
import { PlusOutlined } from '@ant-design/icons';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { App, Button, Popconfirm, Select, Tag, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import type { InviteItem, MemberItem } from '@saas/shared';
import { ROLE_LABEL } from '@/constants/role';
import { usePermission } from '@/hooks/usePermission';
import { errorText } from '@/shared/api/errorText';
import { memberApi } from '@/shared/api/member';
import { InviteModal } from './InviteModal';

export function MembersPage() {
  const { can, role } = usePermission();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  // 成员与邀请一起变（接受邀请后两边都要少/多一行），所以共用一个 queryKey
  const { data, isLoading } = useQuery({ queryKey: ['members'], queryFn: memberApi.list });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['members'] });

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      message.success(success);
      await refresh();
    } catch (err) {
      message.error(errorText(err));
    }
  };

  /**
   * 对象级规则的前端镜像（与 service 的 assertOperable 一一对应）：
   * 1. 自己那一行：不能改角色 / 禁用 / 移除（也不能转给自己）
   * 2. 目标是 owner：只能走转让，普通操作一律不给
   * 3. admin 只能操作 member，admin 之间不能互降
   */
  const canOperate = (record: MemberItem): boolean => {
    if (record.isSelf || record.role === 'owner') return false;
    if (role !== 'owner' && record.role === 'admin') return false;
    return true;
  };

  const transferOwner = (record: MemberItem) => {
    modal.confirm({
      title: '转让所有权',
      content: `转让后你将降为管理员，「${record.nickname}」成为团队所有者，可以管理成员与删除团队。确定转让吗？`,
      okText: '确认转让',
      onOk: () => run(() => memberApi.transferOwner(record.id), '已转让所有权'),
    });
  };

  const memberColumns: ProColumns<MemberItem>[] = [
    {
      title: '成员',
      dataIndex: 'nickname',
      render: (_, record) => (
        <div className="flex flex-col">
          <span className="text-ink">
            {record.nickname}
            {record.isSelf && (
              <Tag className="ml-2" color="blue">
                我
              </Tag>
            )}
          </span>
          <span className="text-xs text-ink-3">{record.email}</span>
        </div>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 150,
      render: (_, record) =>
        // owner 只有一位且只能通过转让变更，不给下拉：否则会出现「点了才发现 409」
        record.role === 'owner' ? (
          <Tag color="gold">Owner</Tag>
        ) : (
          <Select
            size="small"
            value={record.role}
            disabled={!can('member.role_change') || !canOperate(record)}
            style={{ width: 110 }}
            options={[
              { value: 'admin', label: ROLE_LABEL.admin },
              { value: 'member', label: ROLE_LABEL.member },
            ]}
            onChange={(next) =>
              void run(() => memberApi.updateRole(record.id, { role: next }), '角色已更新')
            }
          />
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (_, record) =>
        record.status === 'active' ? <Tag color="green">正常</Tag> : <Tag>已禁用</Tag>,
    },
    {
      title: '加入时间',
      dataIndex: 'joinedAt',
      width: 170,
      render: (_, record) => dayjs(record.joinedAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 190,
      render: (_, record) => {
        const editable = canOperate(record);
        return [
          record.status === 'active' ? (
            <Typography.Link
              key="disable"
              disabled={!can('member.disable') || !editable}
              onClick={() => void run(() => memberApi.disable(record.id), '已禁用该成员')}
            >
              禁用
            </Typography.Link>
          ) : (
            <Typography.Link
              key="enable"
              disabled={!can('member.disable') || !editable}
              onClick={() => void run(() => memberApi.enable(record.id), '已启用该成员')}
            >
              启用
            </Typography.Link>
          ),
          // 禁用是「停用但保留」，移除是「请出团队」——后者会立刻失去访问权限，
          // 文案必须说清后果，且可再次邀请
          <Popconfirm
            key="remove"
            title="移除成员"
            description={`「${record.nickname}」将立即失去该团队的访问权限，可再次邀请加入。确定移除吗？`}
            okText="移除"
            okButtonProps={{ danger: true }}
            disabled={!can('member.remove') || !editable}
            onConfirm={() => run(() => memberApi.remove(record.id), '已移除该成员')}
          >
            <Typography.Link type="danger" disabled={!can('member.remove') || !editable}>
              移除
            </Typography.Link>
          </Popconfirm>,
          can('member.transfer_owner') && record.status === 'active' && editable ? (
            <Typography.Link key="transfer" onClick={() => transferOwner(record)}>
              转让
            </Typography.Link>
          ) : null,
        ];
      },
    },
  ];

  const inviteColumns: ProColumns<InviteItem>[] = [
    { title: '邮箱', dataIndex: 'email' },
    {
      title: '角色',
      dataIndex: 'role',
      width: 110,
      render: (_, record) => ROLE_LABEL[record.role] ?? record.role,
    },
    { title: '邀请人', dataIndex: 'invitedByName', width: 120 },
    {
      title: '有效期',
      dataIndex: 'expiresAt',
      width: 170,
      render: (_, record) => (
        <span className={record.expired ? 'text-red-500' : undefined}>
          {record.expired ? '已过期' : dayjs(record.expiresAt).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
    {
      title: '操作',
      valueType: 'option',
      width: 140,
      render: (_, record) => [
        // 重发会轮换 token：旧链接立即失效，这是刻意的（同时只有一枚有效邀请）
        <Typography.Link
          key="resend"
          disabled={!can('member.invite')}
          onClick={() => {
            void (async () => {
              try {
                const next = await memberApi.resendInvite(record.id);
                message.success('已重发邀请，旧链接已失效');
                message.info(`新链接：${next.joinUrl}`);
                await refresh();
              } catch (err) {
                message.error(errorText(err));
              }
            })();
          }}
        >
          重发
        </Typography.Link>,
        <Popconfirm
          key="revoke"
          title="撤销邀请"
          description="撤销后对方手上的链接立即失效。"
          okText="撤销"
          okButtonProps={{ danger: true }}
          disabled={!can('member.invite')}
          onConfirm={() => run(() => memberApi.revokeInvite(record.id), '已撤销邀请')}
        >
          <Typography.Link type="danger" disabled={!can('member.invite')}>
            撤销
          </Typography.Link>
        </Popconfirm>,
      ],
    },
  ];

  const members = data?.members ?? [];
  const invites = data?.invites ?? [];

  return (
    <>
      <ProTable<MemberItem>
        headerTitle="成员"
        rowKey="id"
        columns={memberColumns}
        dataSource={members}
        loading={isLoading}
        search={false}
        options={false}
        pagination={members.length > 10 ? { pageSize: 10 } : false}
        toolBarRender={() =>
          can('member.invite')
            ? [
                <Button
                  key="invite"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setInviteOpen(true)}
                >
                  邀请成员
                </Button>,
              ]
            : []
        }
      />

      {/* 没有待接受邀请时整块不渲染：空表头只会让人以为哪里出错了 */}
      {invites.length > 0 && (
        <div className="mt-4">
          <ProTable<InviteItem>
            headerTitle="待接受的邀请"
            rowKey="id"
            columns={inviteColumns}
            dataSource={invites}
            search={false}
            options={false}
            pagination={false}
          />
        </div>
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={() => void refresh()}
      />
    </>
  );
}

export default MembersPage;
