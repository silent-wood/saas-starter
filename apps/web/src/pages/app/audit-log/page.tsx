/**
 * 审计日志页（06 方案 §7.3 / F-20）
 *
 * 只读页：没有编辑、没有删除、没有导出（D-11 / D-12）。数据来自
 * `GET /audit-logs`，四个筛选维度（时间范围 / 操作者 / 动作 / 结果）全部下推到后端，
 * 前端不做任何内存过滤 —— 审计表按租户 + 时间建了索引，捞到内存再筛会让
 * 「翻到第 N 页」和「筛选后总数」同时失真。
 *
 * 权限：路由层已按 meta.permission（audit.view）拦截，member 看不到菜单、
 * 直连也会原地渲染 403。所以本页不再写 `can()` 判断 —— 页面能渲染出来就说明有权限，
 * 再判一次只会让「后端收紧了但前端没跟上」这类差异被悄悄掩盖。
 */
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { useQuery } from '@tanstack/react-query';
import { App, Descriptions, Drawer, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { auditActionLabel } from '@saas/shared';
import type { AuditLogItem } from '@saas/shared';
import { ROLE_LABEL } from '@/constants/role';
import { auditApi } from '@/shared/api/audit';
import { errorText } from '@/shared/api/errorText';
import { memberApi } from '@/shared/api/member';
import {
  ACTION_VALUE_ENUM,
  DEFAULT_WINDOW_DAYS,
  EMPTY_TEXT,
  objectTypeLabel,
  RESULT_VALUE_ENUM,
  ROLE_TAG_COLOR,
  TIME_FORMAT,
} from './constants';

/**
 * 对象列的降级顺序（AC-27）：
 *   1. 有 objectName → 名字（v1.2 之后写入的记录都有）
 *   2. objectType='resource' 且有 id → 渲染成资源详情链接
 *   3. 只有 id → 「成员 · 1a2b3c4d」
 *   4. 都没有 → 「—」
 *
 * `objectType` 为 null 时不能拿去索引字典再拼模板，否则会拼出
 * 「undefined · 1a2b3c4d」；所以类型名统一走 objectTypeLabel()，由它返回 null。
 *
 * 链接的已知限制：软删除的资源点进去是 404。审计要如实反映「当时对哪条记录做了什么」，
 * 不能因为目标已经没了就把链接去掉 —— 404 本身就是有用信息。
 */
function renderObject(record: AuditLogItem) {
  const typeLabel = objectTypeLabel(record.objectType);
  if (record.objectName) return record.objectName;
  if (record.objectType === 'resource' && record.objectId) {
    return (
      <Link to={`/app/resources/${record.objectId}`}>
        {`${typeLabel ?? '资源'} · ${record.objectId.slice(0, 8)}`}
      </Link>
    );
  }
  if (record.objectId) return `${typeLabel ?? '对象'} · ${record.objectId.slice(0, 8)}`;
  return '—';
}

export function AuditLogPage() {
  const { message } = App.useApp();

  /**
   * 抽屉的 open 与数据分开存：
   * 关闭动画约 300ms，若在 onClose 里同时把 detail 置 null，内容会先闪成空白再滑出。
   * detail 保留到下次点开被覆盖，代价只是一个对象引用。
   */
  const [detail, setDetail] = useState<AuditLogItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: memberData } = useQuery({ queryKey: ['members'], queryFn: memberApi.list });

  /**
   * 操作者下拉的选项来自 `GET /members`（该接口对全员开放，owner/admin 一定读得到）。
   *
   * 用 useQuery 而不是把这个 select 写成带 `request` 的列：
   * 列的 request 会挤进 ProTable 的 loading 状态（主表刷新时下拉跟着转圈），
   * 而且每次展开搜索区都可能重发一次请求。成员列表在别的页面已经查过，
   * 共用 `['members']` 这个 key 还能直接命中缓存。
   *
   * ⚠️ 这里**只**用来喂下拉的昵称。角色不从这里取 —— 那份数据是「现在」的，
   * 而且 `GET /members` 的 where 排除了 `removed`，恰好漏掉审计最常追查的那批人。
   * 角色改读接口自带的 `record.actorRole`（写入时快照，即「操作当时」的角色）。
   */
  const actorValueEnum = useMemo(() => {
    const map: Record<string, { text: string }> = {};
    for (const member of memberData?.members ?? []) map[member.userId] = { text: member.nickname };
    return map;
  }, [memberData]);

  const openDetail = (record: AuditLogItem) => {
    setDetail(record);
    setDetailOpen(true);
  };

  const columns: ProColumns<AuditLogItem>[] = [
    {
      title: '时间范围',
      dataIndex: 'createdAtRange',
      valueType: 'dateRange',
      hideInTable: true,
      /**
       * 默认最近 30 天（含今天）。与后端 service.list 的默认窗口一致：
       * 前端不传时后端也是 30 天，两处若写岔了，用户会在「选了 30 天却看到 180 天」
       * 或反过来的情形里失去对筛选的信任。
       *
       * 用 dateRange 而不是两个独立输入框：组件本身保证 from <= to，
       * transform 里就不必再判顺序（判了也只是把用户的错输纠正成另一种错）。
       */
      initialValue: [
        dayjs()
          .subtract(DEFAULT_WINDOW_DAYS - 1, 'day')
          .startOf('day'),
        dayjs().endOf('day'),
      ],
      search: {
        transform: (value) => {
          // 用户点「重置」或清空日期后，value 是 undefined 或 [null, null]。
          // 直接 value[0] 会抛 TypeError 把整页打白屏 —— 这是 dateRange 最常见的翻车点。
          if (!Array.isArray(value) || !value[0] || !value[1]) return {};
          return {
            // 起止都取整天边界后转 ISO：后端用 z.iso.datetime 收，认 …Z 与 …+08:00
            from: dayjs(value[0]).startOf('day').toISOString(),
            to: dayjs(value[1]).endOf('day').toISOString(),
          };
        },
      },
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      hideInSearch: true,
      width: 180,
      // 后端固定 createdAt desc, id desc，不给排序入口，避免表头出现点不出效果的箭头
      render: (_, record) => dayjs(record.createdAt).format(TIME_FORMAT),
    },
    {
      title: '操作者',
      /**
       * dataIndex 用 actorUserId 而不是 actorName：
       * 搜索提交的字段名直接等于后端字段名，省掉一个 search.transform。
       * 展示走 render 里的 record.actorName，跟 dataIndex 无关。
       */
      dataIndex: 'actorUserId',
      valueType: 'select',
      valueEnum: actorValueEnum,
      width: 210,
      render: (_, record) => (
        <div className="flex flex-col">
          <div className="flex items-center">
            {/* 账号被删或已移出团队时后端给 null，不能整行留空让人以为是数据缺失 */}
            <span className="text-ink">{record.actorName ?? '已注销用户'}</span>
            {/* 角色来自接口的写入时快照，已移出团队的人也有值（memberships 行保留）。
                本期之前的历史记录没有快照，此时不渲染 Tag —— 空着比猜一个准确 */}
            {record.actorRole && (
              <Tag color={ROLE_TAG_COLOR[record.actorRole] ?? 'default'} className="ml-2">
                {ROLE_LABEL[record.actorRole] ?? record.actorRole}
              </Tag>
            )}
          </div>
          {record.actorEmail && <span className="text-xs text-ink-3">{record.actorEmail}</span>}
        </div>
      ),
    },
    {
      title: '动作',
      dataIndex: 'action',
      valueType: 'select',
      valueEnum: ACTION_VALUE_ENUM,
      width: 200,
      // 走 auditActionLabel：历史动作码在词表里没有时原样返回，不会渲染成 undefined
      render: (_, record) => auditActionLabel(record.action),
    },
    {
      title: '对象',
      // 表格按名字展示，搜索不了（对象可能是成员/资源/邀请三类，做成下拉没有意义）
      dataIndex: 'objectName',
      hideInSearch: true,
      ellipsis: true,
      render: (_, record) => renderObject(record),
    },
    {
      title: '结果',
      dataIndex: 'result',
      valueType: 'select',
      valueEnum: RESULT_VALUE_ENUM,
      width: 100,
      render: (_, record) =>
        record.result === 'success' ? (
          <Tag color="success">成功</Tag>
        ) : (
          // 状态码放 tooltip：塞进 Tag 会让 100px 的列放不下，
          // 且绝大多数成功记录没有这个字段，单独开一列会是满屏的「—」
          <Tooltip title={record.statusCode ? `HTTP ${record.statusCode}` : '未记录状态码'}>
            <Tag color="error">失败</Tag>
          </Tooltip>
        ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      hideInSearch: true,
      width: 150,
      ellipsis: true,
      render: (_, record) => record.ip ?? '—',
    },
    {
      title: '操作',
      valueType: 'option',
      width: 80,
      render: (_, record) => [
        <Typography.Link key="detail" onClick={() => openDetail(record)}>
          详情
        </Typography.Link>,
      ],
    },
  ];

  return (
    <>
      <ProTable<AuditLogItem>
        headerTitle="审计日志"
        // 审计记录没有业务唯一键，rowKey 只能是 id；漏写会让抽屉选中态错行
        rowKey="id"
        columns={columns}
        cardBordered
        search={{ labelWidth: 'auto', span: 8 }}
        options={{ density: false, setting: false, reload: true }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
        locale={{ emptyText: EMPTY_TEXT }}
        request={async (params) => {
          try {
            const res = await auditApi.list({
              page: params.current ?? 1,
              pageSize: params.pageSize ?? 20,
              /**
               * 全部用展开 + truthy 判断，不显式赋 undefined：
               * axios 会丢掉 undefined 的键（后端收不到 = 不限），
               * 但**空串会被传过去**，而 `from=''` 会被 z.iso.datetime 判 422。
               * 这里挡掉空串，等于替用户把「清空筛选」翻译成「不传这个条件」。
               */
              ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
              ...(params.action ? { action: params.action } : {}),
              ...(params.result ? { result: params.result } : {}),
              ...(params.from ? { from: params.from } : {}),
              ...(params.to ? { to: params.to } : {}),
            });
            return { data: res.items, total: res.total, success: true };
          } catch (err) {
            message.error(errorText(err));
            // 失败时返回空数据而不是保留上一次结果：
            // 否则用户会以为「换了个筛选条件还是这些记录」，把接口错误读成数据结论
            return { data: [], total: 0, success: false };
          }
        }}
      />

      <Drawer
        title="审计详情"
        // antd 6 用 size 取代 width，且 size 接受数字（像素），不必退回 styles.wrapper
        size={520}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detail && (
          <Descriptions
            column={1}
            size="small"
            bordered
            items={[
              {
                key: 'createdAt',
                label: '时间',
                children: dayjs(detail.createdAt).format(TIME_FORMAT),
              },
              { key: 'actorName', label: '操作者', children: detail.actorName ?? '已注销用户' },
              {
                key: 'actorRole',
                label: '角色（操作时）',
                // 「操作时」三个字不能省：这是写入时抄下来的快照，不是现查的当前角色。
                // 用户改了角色后这张表不会跟着变 —— 这正是审计该有的行为
                children: detail.actorRole
                  ? (ROLE_LABEL[detail.actorRole] ?? detail.actorRole)
                  : '—',
              },
              { key: 'actorEmail', label: '邮箱', children: detail.actorEmail ?? '—' },
              {
                key: 'actorUserId',
                label: '用户 ID',
                // 表格里不显示，但排查「同一个人两条记录对不上」时要拿完整值去库里查
                children: <Typography.Text copyable>{detail.actorUserId}</Typography.Text>,
              },
              {
                key: 'action',
                label: '动作',
                // 中文给业务看，原始码给排查用：两者都留，比只在文档里查词表快
                children: `${auditActionLabel(detail.action)}（${detail.action}）`,
              },
              {
                key: 'object',
                label: '对象',
                children: (
                  <div className="flex flex-col gap-1">
                    <span>{objectTypeLabel(detail.objectType) ?? '—'}</span>
                    {detail.objectName && <span>{detail.objectName}</span>}
                    {/* 抽屉里显示完整 id（表格里才截断 8 位）：复制出去能直接查库 */}
                    {detail.objectId ? (
                      <Typography.Text copyable>{detail.objectId}</Typography.Text>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'result',
                label: '结果',
                children: detail.result === 'success' ? '成功' : '失败',
              },
              { key: 'statusCode', label: '状态码', children: detail.statusCode ?? '—' },
              {
                key: 'durationMs',
                label: '耗时',
                // 0 是合法值（极快的失败分支），不能写成 detail.durationMs ? ... : '—'
                children: detail.durationMs === null ? '—' : `${detail.durationMs} ms`,
              },
              { key: 'path', label: '请求路径', children: detail.path ?? '—' },
              { key: 'ip', label: 'IP', children: detail.ip ?? '—' },
            ]}
          />
        )}
      </Drawer>
    </>
  );
}

export default AuditLogPage;
