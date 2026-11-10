/**
 * 工作台（设计稿 S2 及其红线标注）
 *
 * 结构：页头（标题 + 欢迎语 / 右上唯一主按钮「新建资源」）→ 操作按钮行（次按钮）
 * → 「最近资源」卡片（最近 3 条 + 查看全部 + 行内「查看」）。
 * 红线：页头下距 16、区块间距 24、快捷按钮 h32 radius 6（antd 默认即 32/6）、
 * 空态 = 引导第一个操作、加载 = Skeleton（List loading 内建）、失败 = 卡片 Alert + 重试。
 *
 * 统计卡（综合用量 / 存储用量 / AI 调用次数，含 ≥90% 变色规则）依赖订阅与配额后端
 * （设计稿 S7/S8 里程碑，当前后端无对应接口），暂不渲染，接口就绪后补齐。
 * 「上传文件 / 邀请成员 / 查看账单」同理——按设计稿保留位置但禁用，不放死功能。
 */
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, List, Typography } from 'antd';
import { resourceCategoryLabel } from '@saas/shared';
import type { ResourceItem } from '@saas/shared';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/stores/auth';
import { usePermission } from '@/hooks/usePermission';
import { resourceApi } from '@/shared/api/resource';

/** 相对时间：与设计稿「2 小时前更新」口径一致，不引入 dayjs 插件 */
function relativeTime(iso: string): string {
  const diffMin = dayjs().diff(dayjs(iso), 'minute');
  if (diffMin < 1) return '刚刚更新';
  if (diffMin < 60) return `${diffMin} 分钟前更新`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} 小时前更新`;
  if (diffMin < 60 * 24 * 30) return `${Math.floor(diffMin / (60 * 24))} 天前更新`;
  return `${dayjs(iso).format('YYYY-MM-DD')} 更新`;
}

function Dashboard() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const user = useAuthStore((s) => s.user);

  const canWrite = can('resource.write');

  // 最近资源：项目标准取数模式（react-query），失败态交给 isError
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['resources', 'recent'],
    queryFn: () => resourceApi.list({ page: 1, pageSize: 3 }),
  });
  const recent: ResourceItem[] = data?.items ?? [];

  return (
    <div>
      {/* 页头（下距 16） */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            工作台
          </Typography.Title>
          <Typography.Text type="secondary">欢迎回来，{user?.name ?? '用户'}</Typography.Text>
        </div>
        {canWrite && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/app/resources?create=1')}
          >
            新建资源
          </Button>
        )}
      </div>

      {/* 区块间距 24 */}
      <div className="flex flex-col gap-6">
        {/* 操作按钮行（对应功能未上线，禁用占位对齐设计稿；均为次按钮） */}
        <div className="flex gap-4">
          <Button disabled>上传文件</Button>
          <Button disabled>邀请成员</Button>
          <Button disabled>查看账单</Button>
        </div>

        {/* 最近资源 */}
        <Card
          title="最近资源"
          variant="outlined"
          extra={<a onClick={() => navigate('/app/resources')}>查看全部</a>}
        >
          {isError ? (
            <Alert
              type="error"
              showIcon
              message="最近资源加载失败"
              description="网络异常或服务暂不可用，请重试。"
              action={
                <Button size="small" icon={<ReloadOutlined />} onClick={() => void refetch()}>
                  重试
                </Button>
              }
            />
          ) : (
            <List
              loading={isLoading}
              dataSource={recent}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="还没有资源"
                    style={{ padding: '24px 0' }}
                  >
                    {canWrite && (
                      <Button type="primary" onClick={() => navigate('/app/resources?create=1')}>
                        创建第一个资源
                      </Button>
                    )}
                  </Empty>
                ),
              }}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <a key="view" onClick={() => navigate(`/app/resources/${item.id}`)}>
                      查看
                    </a>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Typography.Link onClick={() => navigate(`/app/resources/${item.id}`)}>
                        {item.name}
                      </Typography.Link>
                    }
                    description={
                      <Typography.Text type="secondary">
                        {[
                          item.category ? resourceCategoryLabel(item.category) : null,
                          relativeTime(item.updatedAt),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Typography.Text>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

export default Dashboard;
