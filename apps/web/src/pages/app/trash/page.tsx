/**
 * 回收站页（07 方案 §2.2 / §3.2）
 *
 * 只展示 30 天窗口内的记录（后端保证）；「剩余天数」由前端用
 * deletedAt + 30 天现算，剩余 < 7 天标橙。
 * 恢复 / 彻底删除对 member 完全隐藏（trash.manage 限 admin+）。
 */
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Tag } from 'antd';
import { ERROR_CODES } from '@saas/shared';
import type { TrashItem } from '@saas/shared';
import dayjs from 'dayjs';
import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { errorText, RESTORE_EXPIRED_TEXT } from '@/shared/api/errorText';
import { resourceApi } from '@/shared/api/resource';

/** 剩余可恢复天数：deletedAt + 30 天与当前时刻的差值，向上取整 */
function remainingDays(deletedAt: string): number {
  const ms = dayjs(deletedAt).add(30, 'day').diff(dayjs());
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

const isNotFound = (err: unknown) =>
  (err as { code?: string } | undefined)?.code === ERROR_CODES.RESOURCE_NOT_FOUND;

export function TrashPage() {
  const actionRef = useRef<ActionType>(null);
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const queryClient = useQueryClient();

  const reloadAll = () => {
    actionRef.current?.reload();
    queryClient.invalidateQueries({ queryKey: ['resources'] });
  };

  /** 恢复：不弹确认。失败（含并发已删 / 超窗 404）统一刷新列表再提示 */
  const handleRestore = async (record: TrashItem) => {
    try {
      await resourceApi.restore(record.id);
      message.success(`「${record.name}」已恢复`);
    } catch (err) {
      message.error(isNotFound(err) ? RESTORE_EXPIRED_TEXT : errorText(err));
    } finally {
      reloadAll();
    }
  };

  /** 彻底删除：红字确认，明确不可恢复 */
  const confirmPurge = (record: TrashItem) => {
    modal.confirm({
      title: '彻底删除',
      content: `彻底删除后无法恢复。确定永久删除「${record.name}」吗？`,
      okText: '彻底删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await resourceApi.purge(record.id);
          message.success('已彻底删除');
        } catch (err) {
          message.error(errorText(err));
        } finally {
          reloadAll();
        }
      },
    });
  };

  const columns: ProColumns<TrashItem>[] = [
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
      hideInSearch: true,
    },
    {
      title: '分类',
      dataIndex: 'category',
      ellipsis: true,
      hideInSearch: true,
      render: (_, record) => record.category ?? '-',
    },
    {
      title: '删除人',
      dataIndex: 'deletedByName',
      hideInSearch: true,
      render: (_, record) => record.deletedByName ?? '系统',
    },
    {
      title: '删除时间',
      dataIndex: 'deletedAt',
      hideInSearch: true,
      render: (_, record) => dayjs(record.deletedAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '剩余天数',
      dataIndex: 'remaining',
      hideInSearch: true,
      render: (_, record) => {
        const days = remainingDays(record.deletedAt);
        const text = days === 0 ? '不足 1 天' : `${days} 天`;
        return days < 7 ? <Tag color="orange">{text}</Tag> : <span>{text}</span>;
      },
    },
    {
      title: '操作',
      valueType: 'option',
      render: (_, record) => [
        <a key="restore" onClick={() => void handleRestore(record)}>
          恢复
        </a>,
        <a key="purge" style={{ color: '#ff4d4f' }} onClick={() => confirmPurge(record)}>
          彻底删除
        </a>,
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Alert type="warning" showIcon message="回收站内的资源保留 30 天，超期后不可恢复" />
      <ProTable<TrashItem>
        headerTitle="回收站"
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        cardBordered
        search={false}
        request={async (params) => {
          try {
            const res = await resourceApi.trashList({
              page: params.current ?? 1,
              pageSize: params.pageSize ?? 20,
            });
            return { data: res.items, total: res.total, success: true };
          } catch (err) {
            message.error(errorText(err));
            return { data: [], total: 0, success: false };
          }
        }}
        options={{ density: false, setting: false, reload: true }}
        toolBarRender={() => [
          <Button key="back" onClick={() => navigate('/app/resources')}>
            返回资源列表
          </Button>,
        ]}
      />
    </div>
  );
}

export default TrashPage;
