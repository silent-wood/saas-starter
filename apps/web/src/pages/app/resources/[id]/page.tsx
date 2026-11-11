/**
 * 资源详情页（07 方案 §3.2）
 *
 * 软删除 / 跨租户的资源后端统一 404 RESOURCE_NOT_FOUND，这里渲染
 * 「不存在或已被删除」空态而不是报错（异常分支 #6 口径）。
 */
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { PageContainer, ProDescriptions } from '@ant-design/pro-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Result, Spin } from 'antd';
import { resourceCategoryLabel } from '@saas/shared';
import type { ResourceItem } from '@saas/shared';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { usePermission } from '@/hooks/usePermission';
import { errorText } from '@/shared/api/errorText';
import { resourceApi } from '@/shared/api/resource';
import { CreateModal } from '../CreateModal';

export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const { modal, message } = App.useApp();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => resourceApi.detail(id as string),
    enabled: Boolean(id),
    retry: false,
  });

  const confirmDelete = (record: ResourceItem) => {
    modal.confirm({
      title: '删除资源',
      content: `确定删除「${record.name}」吗？删除后可在回收站保留 30 天。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await resourceApi.remove(record.id);
          message.success('已移入回收站');
          navigate('/app/resources', { replace: true });
        } catch (err) {
          message.error(errorText(err));
        }
      },
    });
  };

  if (isPending) {
    return (
      <div className="flex justify-center py-24">
        <Spin />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Result
        status="404"
        title="资源不存在或已被删除"
        subTitle="它可能已被删除，或不在当前团队内"
        extra={
          <Button type="primary" onClick={() => navigate('/app/resources')}>
            返回资源列表
          </Button>
        }
      />
    );
  }

  return (
    <PageContainer
      title={data.name}
      extra={
        can('resource.write') && [
          <Button key="edit" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
            编辑
          </Button>,
          <Button key="delete" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(data)}>
            删除
          </Button>,
        ]
      }
    >
      <ProDescriptions<ResourceItem>
        column={2}
        dataSource={data}
        size="large"
        bordered
        columns={[
          {
            title: '分类',
            dataIndex: 'category',
            span: 1,
            render: (_, record) => resourceCategoryLabel(record.category),
          },
          {
            title: '创建人',
            dataIndex: 'createdByName',
            span: 1,
            render: (_, record) => record.createdByName ?? '已注销用户',
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            span: 1,
            render: (_, record) => dayjs(record.createdAt).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '更新时间',
            dataIndex: 'updatedAt',
            span: 1,
            render: (_, record) => dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '描述',
            dataIndex: 'description',
            span: 2,
            render: (_, record) => record.description ?? '-',
          },
        ]}
      />
      <CreateModal
        open={editOpen}
        record={data}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: ['resource', id] });
        }}
      />
    </PageContainer>
  );
}
