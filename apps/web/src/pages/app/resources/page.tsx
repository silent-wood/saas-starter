/**
 * 资源列表页（07 方案 §2.1 / §3.2）
 *
 * ProTable 内置搜索表单产出 name/category 参数：name 列经 search.transform
 * 映射为契约的 `q`；分页参数 current/pageSize 映射为 page/pageSize。
 * 权限口径：member 不渲染「新建」按钮，操作列只剩「查看」——前端隐藏只是
 * 体验优化，真正的拦截在后端（AC-06 / AC-15）。
 */
import { PlusOutlined } from '@ant-design/icons';
import { ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { App, Button, Empty, Typography } from 'antd';
import { RESOURCE_CATEGORY_OPTIONS } from '@saas/shared';
import type { ResourceItem } from '@saas/shared';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { usePermission } from '@/hooks/usePermission';
import { errorText } from '@/shared/api/errorText';
import { resourceApi } from '@/shared/api/resource';
import { CreateModal } from './CreateModal';

/**
 * 分类列同时承担三件事：单元格渲染、搜索表单项、筛选参数取值。
 * 交给 ProTable 的 `valueEnum` 一处声明，避免「列表显示中文、筛选发中文」的不一致
 * （筛选必须发码，后端按 `resources.category` 等值匹配）。
 */
const CATEGORY_VALUE_ENUM = Object.fromEntries(
  RESOURCE_CATEGORY_OPTIONS.map((option) => [option.value, { text: option.label }]),
);

export function ResourceListPage() {
  const actionRef = useRef<ActionType>(null);
  const navigate = useNavigate();
  const { can } = usePermission();
  const { modal, message } = App.useApp();
  const canWrite = can('resource.write');
  const [searchParams, setSearchParams] = useSearchParams();
  // 外部入口（工作台「新建资源」）带 ?create=1 直达：初始即打开新建弹窗
  const [modalOpen, setModalOpen] = useState(() => canWrite && searchParams.get('create') === '1');
  const [editing, setEditing] = useState<ResourceItem | null>(null);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  // 消费完 create 参数即清除，避免刷新/返回时重复弹窗
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 顶栏全局搜索带来的初始关键词（?keyword=xx），经 params 注入 request
  const initialKeyword = searchParams.get('keyword') ?? undefined;

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
          actionRef.current?.reload();
        } catch (err) {
          message.error(errorText(err));
        }
      },
    });
  };

  const columns: ProColumns<ResourceItem>[] = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (_, record) => (
        <Typography.Link onClick={() => navigate(`/app/resources/${record.id}`)}>
          {record.name}
        </Typography.Link>
      ),
      search: { transform: (value: string) => ({ q: value }) },
    },
    {
      title: '分类',
      dataIndex: 'category',
      // valueEnum 让搜索表单变成下拉、单元格自动取中文，且筛选值发的是码
      valueType: 'select',
      valueEnum: CATEGORY_VALUE_ENUM,
      width: 110,
      ellipsis: true,
    },
    {
      title: '创建人',
      dataIndex: 'createdByName',
      hideInSearch: true,
      render: (_, record) => record.createdByName ?? '已注销用户',
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      hideInSearch: true,
      render: (_, record) => dayjs(record.updatedAt).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      valueType: 'option',
      render: (_, record) => [
        <a key="view" onClick={() => navigate(`/app/resources/${record.id}`)}>
          查看
        </a>,
        ...(canWrite
          ? [
              <a
                key="edit"
                onClick={() => {
                  setEditing(record);
                  setModalOpen(true);
                }}
              >
                编辑
              </a>,
              <a key="delete" style={{ color: '#ff4d4f' }} onClick={() => confirmDelete(record)}>
                删除
              </a>,
            ]
          : []),
      ],
    },
  ];

  return (
    <>
      <ProTable<ResourceItem>
        headerTitle="资源列表"
        rowKey="id"
        actionRef={actionRef}
        columns={columns}
        cardBordered
        params={{ keyword: initialKeyword }}
        request={async (params) => {
          try {
            const res = await resourceApi.list({
              page: params.current ?? 1,
              pageSize: params.pageSize ?? 20,
              // keyword：顶栏全局搜索；q：ProTable 内置搜索表单
              q: (params as { q?: string }).q ?? (params as { keyword?: string }).keyword,
              category: params.category,
            });
            return { data: res.items, total: res.total, success: true };
          } catch (err) {
            message.error(errorText(err));
            return { data: [], total: 0, success: false };
          }
        }}
        toolBarRender={() =>
          canWrite
            ? [
                <Button key="create" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  新建资源
                </Button>,
              ]
            : []
        }
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有资源"
              style={{ padding: '32px 0' }}
            >
              {canWrite && (
                <Button type="primary" onClick={openCreate}>
                  创建第一个资源
                </Button>
              )}
            </Empty>
          ),
        }}
        options={{ density: false, setting: false, reload: true }}
      />
      <CreateModal
        open={modalOpen}
        record={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          actionRef.current?.reload();
        }}
      />
    </>
  );
}

export default ResourceListPage;
