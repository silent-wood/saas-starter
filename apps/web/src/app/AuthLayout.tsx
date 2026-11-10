/**
 * 登录后整体布局（设计稿 S2 工作台：左侧白色侧边栏 + 白色顶栏横带）
 *
 * ProLayout（layout=side）落地。side 模式下 ProLayout 不渲染顶栏（源码
 * layout === 'side' 直接 return null），顶栏在 ProLayout children 内自绘：
 * - 侧栏：logo 图片 + 「SaaS Starter」标题（与菜单同宽 208，高度 56 与顶栏对齐）
 * - 顶栏：左侧面包屑「首页 / 当前页」，右侧搜索框 / 通知铃铛（红点）/ 头像下拉；
 *   位于内容区内、占满侧栏以外宽度，sticky 滚动常驻；showTopbar=false 可关闭
 * 菜单按权限过滤——member 无「回收站」入口（trash.manage 限 admin+，后端同样拦截）。
 * 成员管理 / AI 助手 / 订阅支付 / 邀请中心 / 设置为占位页（PlaceholderPage），
 * 对应功能落地时替换路由元素即可。
 */
import {
  AppstoreOutlined,
  BellOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  LogoutOutlined,
  PayCircleOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { ProLayout } from '@ant-design/pro-components';
import type { MenuDataItem } from '@ant-design/pro-components';
import { Avatar, Badge, Breadcrumb, Dropdown, Input, Space, Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router';
import logoUrl from '@/assets/imgs/logo.png';
import { useLogout } from '@/hooks/useLogout';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth';
import { resourceApi } from '@/shared/api/resource';
import { COLOR } from '@/theme/tokens';
import { useTenantRouting } from './useTenantRouting';

/**
 * 设计稿 S2 的菜单清单；成员/AI/订阅/邀请/设置暂为占位页（PlaceholderPage）。
 *
 * 子路由约定（与 router.tsx 的嵌套结构同源）：
 * - 有子页面的菜单用 children 描述（如资源列表 → 资源详情 :id）；
 * - 子项 hideInMenu: true 表示「路由存在但侧栏不展示」（动态详情页不进菜单）；
 *   有可见子项时 ProLayout 渲染为可展开 submenu，全隐藏时剔除 children 保持平铺。
 */
const BASE_MENU: MenuDataItem[] = [
  { path: '/app', name: '工作台', icon: <AppstoreOutlined /> },
  {
    path: '/app/resources',
    name: '资源列表',
    icon: <DatabaseOutlined />,
    children: [{ path: '/app/resources/:id', name: '资源详情', hideInMenu: true }],
  },
  { path: '/app/trash', name: '回收站', icon: <DeleteOutlined /> },
  { path: '/app/members', name: '成员管理', icon: <TeamOutlined /> },
  { path: '/app/ai', name: 'AI 助手', icon: <RobotOutlined /> },
  { path: '/app/billing', name: '订阅支付', icon: <PayCircleOutlined /> },
  { path: '/app/invite', name: '邀请中心', icon: <UserAddOutlined /> },
  { path: '/app/settings', name: '设置', icon: <SettingOutlined /> },
];

export interface AuthLayoutProps {
  /** 是否渲染自绘顶栏（面包屑 / 搜索 / 用户）。全屏类页面可传 false；默认 true */
  showTopBar?: boolean;
}

export function AuthLayout({ showTopBar = true }: AuthLayoutProps) {
  /**
   * 多租户落点判断放在布局层而不是页面层：
   * 它是「进入工作台之后」的前置条件，所有 /app 下的页面都该受同一套规则约束。
   * 单租户会自动选定并静默通过，多租户且当前选择失效时才跳 /select-tenant。
   */
  useTenantRouting();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = usePermission();
  const user = useAuthStore((s) => s.user);
  const [keyword, setKeyword] = useState('');
  // 受控折叠：收起时 logo 区只留 logo，展开才带「SaaS Starter」文字
  const [collapsed, setCollapsed] = useState(false);

  const menuData: MenuDataItem[] = useMemo(() => {
    // 回收站按权限过滤；其余保持顺序原样输出
    const visible = BASE_MENU.filter((item) => item.path !== '/app/trash' || can('trash.manage'));
    // 子菜单展示控制：有可见子项 → 交给 ProLayout 渲染 submenu；
    // 全部 hideInMenu → 剔除 children，保持平铺（否则会渲染出空 submenu）
    return visible.map((item) => {
      if (!item.children) return item;
      const shown = item.children.filter((c) => !c.hideInMenu);
      return shown.length > 0 ? { ...item, children: shown } : { ...item, children: undefined };
    });
  }, [can]);

  // 高亮归属：先按子路由模式匹配（/app/resources/:id → 归属「资源列表」），
  // 再按顶级路径匹配（/app 精确匹配，其余允许子路径归属父菜单）。
  // 面包屑名与菜单名共用同一匹配结果，保证两者永远一致。
  const matched = (() => {
    for (const item of BASE_MENU) {
      // MenuDataItem.path 可选，缺 path 的子项（纯分组）不参与匹配
      const child = (item.children ?? []).find((c) =>
        c.path ? matchPath(c.path, location.pathname) : null,
      );
      if (child) return item;
    }
    return BASE_MENU.find((item) =>
      item.path
        ? matchPath({ path: item.path, end: item.path === '/app' }, location.pathname)
        : null,
    );
  })();
  const selectedPath = matched?.path ?? '/app';
  const currentName = matched?.name ?? '工作台';

  // 详情页面包屑按设计稿 S4 为两级「资源列表 / {资源名}」（无「首页」）；
  // 复用详情页的 react-query 缓存（同 key 去重），不发额外请求
  const detailId = /^\/app\/resources\/([^/]+)$/.exec(location.pathname)?.[1];
  const { data: detailData } = useQuery({
    queryKey: ['resource', detailId],
    queryFn: () => resourceApi.detail(detailId as string),
    enabled: Boolean(detailId),
    retry: false,
    staleTime: 30_000,
  });

  const breadcrumbItems = detailId
    ? [
        { title: <a onClick={() => navigate('/app/resources')}>资源列表</a> },
        { title: detailData?.name ?? '资源详情' },
      ]
    : [{ title: '首页' }, { title: currentName }];

  const submitSearch = () => {
    const q = keyword.trim();
    navigate(q ? `/app/resources?keyword=${encodeURIComponent(q)}` : '/app/resources');
    setKeyword('');
  };

  /**
   * 顶栏自绘（ProLayout children 内 sticky）：side 布局下 ProLayout 源码直接
   * `if (layout === 'side') return null` 不渲染顶栏——headerRender /
   * headerContentRender / actionsRender 均为死代码，actions 会被塞进侧栏。
   * 因此顶栏作为 ProLayout children 的首个元素自绘：
   * - 位于内容区内，天然让出侧栏宽度、占满剩余位置（收起时随内容区扩展）；
   * - 高度 56px 与侧栏 logo 区（global.css 钉成 56px）拼成一条连续横带；
   * - showTopBar=false 可整体关闭（如某些页面需要全屏画布时）。
   */
  const TopBar = showTopBar && (
    <header
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between bg-surface px-6"
      style={{ borderBottom: `1px solid ${COLOR.split}` }}
    >
      <Breadcrumb items={breadcrumbItems} className="leading-[inherit]" />
      <Space size={12} align="center">
        <Input
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={submitSearch}
          prefix={<SearchOutlined style={{ color: COLOR.ink3 }} />}
          placeholder="搜索资源、成员…"
          style={{ width: 240, borderRadius: 8 }}
        />
        <Tooltip title="通知中心即将上线">
          <Badge dot color={COLOR.danger} style={{ width: 7, height: 7 }}>
            <span className="flex h-8 w-8 items-center justify-center">
              <BellOutlined style={{ fontSize: 16, color: COLOR.ink2 }} />
            </span>
          </Badge>
        </Tooltip>
        <Dropdown
          menu={{
            items: [
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: '退出登录',
                onClick: () => void logout(),
              },
            ],
          }}
        >
          <Avatar
            src={user?.avatarUrl ?? undefined}
            size={32}
            style={{ backgroundColor: COLOR.primary, color: COLOR.surface, cursor: 'pointer' }}
          >
            {user?.name?.[0] ?? '?'}
          </Avatar>
        </Dropdown>
      </Space>
    </header>
  );

  return (
    <ProLayout
      layout="side"
      collapsed={collapsed}
      onCollapse={setCollapsed}
      title={collapsed ? ' ' : 'SaaS Starter'}
      logo={<img src={logoUrl} width={28} height={28} alt="SaaS Starter" className="rounded-md" />}
      siderWidth={208}
      route={{ path: '/app', routes: menuData }}
      location={{ pathname: selectedPath }}
      menuItemRender={(item, dom) => (
        <div onClick={() => item.path && navigate(item.path)}>{dom}</div>
      )}
      /**
       * 受控单选：ProLayout 内部 getMatchMenu(fullKeys=true) 会把所有前缀
       * 命中的菜单（/app 与 /app/resources 等）同时设为选中，嵌套路由下
       * 「工作台」永远陪跑高亮。menuProps 在 BaseMenu 中最后展开，覆盖
       * 内置 selectedKeys，由上面的 matchPath 逻辑给出唯一选中项。
       */
      menuProps={{ selectedKeys: [selectedPath] }}
      token={{
        // 设计稿 S2 红线：侧栏 208、选中项 #F0F5FF 底（左侧主色竖条见
        // global.css ::before）+ 文字主色；未选中文字 #595959。
        // pageContainer padding 归零：.ant-pro-layout-content 会继承它做
        // paddingBlock/Inline，导致 children 里的顶栏被顶下来、无法与侧栏
        // logo 区（56px 横带）对齐。内容 24px 内边距改由 Outlet 包裹层承担。
        sider: {
          colorMenuBackground: COLOR.surface,
          colorBgMenuItemSelected: COLOR.primaryBg,
          colorTextMenuSelected: COLOR.primary,
          colorTextMenu: COLOR.ink2,
          colorTextMenuItemHover: COLOR.ink,
          colorMenuItemDivider: COLOR.split,
        },
        pageContainer: {
          colorBgPageContainer: COLOR.layout,
          paddingBlockPageContainerContent: 0,
          paddingInlinePageContainerContent: 0,
        },
      }}
    >
      {TopBar}
      <div className="flex-1 p-6">
        <Outlet />
      </div>
    </ProLayout>
  );
}
