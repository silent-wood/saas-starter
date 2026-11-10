/**
 * 顶栏用户菜单：头像 + 用户名作为触发器，下拉里放团队切换与退出登录
 *
 * 结构：
 * - 触发器：头像 + 用户名（过长省略），团队不进顶栏
 * - 一级下拉：当前团队（名称 + 角色），多租户时作为二级菜单入口，悬停展开全部团队
 *   （`popupStyle` 限高 300px，超出滚动）；下面接退出登录
 * - 二级菜单在屏幕右侧空间不足时由 rc-menu 自动翻转到左侧，顶栏右上角不需要额外配置
 *
 * 团队名过长时在标题里左右往复滚动读全名（`TenantName`）。
 *
 * 单租户也渲染团队项：多数用户注册后只有一个团队，若按「>1 才显示」处理，
 * 下拉里永远看不到自己在哪个团队。此时降级为不可点的展示项（无二级、无切换）。
 */
import { CheckOutlined, LogoutOutlined, TeamOutlined } from '@ant-design/icons';
import { App, Avatar, Dropdown, type MenuProps } from 'antd';
import { useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ROLE_LABEL } from '@/constants/role';
import { useLogout } from '@/hooks/useLogout';
import { tenantLanding, useSwitchTenant } from '@/hooks/useSwitchTenant';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';
import { COLOR } from '@/theme/tokens';

/** 二级面板高度上限，超出滚动 */
const POPUP_MAX_HEIGHT = 300;
/** 团队名标题的可视宽度，超出则悬停滚动 */
const TENANT_NAME_WIDTH = 140;

/**
 * 团队名：超出可视宽度时悬停左右往复滚动，读全名。
 *
 * 位移量由 `scrollWidth - clientWidth` 实测后写入 CSS 变量，不在 CSS 里写死宽度。
 * 测量放在事件里而不是 effect：effect 内 setState 会被
 * react-hooks/set-state-in-effect 拦截，这里本来就是事件驱动的。
 */
function TenantName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setShift(Math.max(0, el.scrollWidth - el.clientWidth));
  };

  return (
    <span
      ref={ref}
      onMouseEnter={measure}
      onMouseLeave={() => setShift(0)}
      className="inline-block overflow-hidden whitespace-nowrap align-bottom"
      style={
        {
          maxWidth: TENANT_NAME_WIDTH,
          '--tenant-shift': `-${shift}px`,
        } as CSSProperties
      }
    >
      <span className={shift > 0 ? 'tenant-name-scroll' : undefined}>{name}</span>
    </span>
  );
}

export function UserMenu() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useLogout();
  const switchTenant = useSwitchTenant();

  const user = useAuthStore((s) => s.user);
  const tenants = useTenantStore((s) => s.tenants);
  const tenantsLoaded = useTenantStore((s) => s.tenantsLoaded);
  const currentTenantId = useTenantStore((s) => s.currentTenantId);

  const currentTenant = tenants.find((t) => t.id === currentTenantId);
  // 只要拿到当前团队就展示。单租户不隐藏 —— 见文件头注释
  const showTeam = tenantsLoaded && Boolean(currentTenant);
  const multiTenant = tenants.length > 1;

  const handleSwitch = async (id: string, name: string) => {
    if (id === currentTenantId) return;
    await switchTenant(id);
    message.success(`已切换到「${name}」`);
    // 动态段（资源详情）退回菜单归属页；静态路径原地不动，无权限由路由守卫兜住
    const landing = tenantLanding(location.pathname);
    if (landing) navigate(landing, { replace: true });
  };

  /** 团队项的两种形态：多租户为二级菜单入口，单租户为纯展示（不可切换） */
  const teamEntry: MenuProps['items'] = !currentTenant
    ? []
    : multiTenant
      ? [
          {
            key: 'tenant-switch',
            icon: <TeamOutlined />,
            label: <TenantName name={currentTenant.name} />,
            // 团队多时二级面板内部滚动，不顶出屏幕
            popupStyle: { maxHeight: POPUP_MAX_HEIGHT, overflowY: 'auto' as const },
            children: tenants.map((tenant) => {
              const active = tenant.id === currentTenantId;
              return {
                key: tenant.id,
                // 用 hidden 而不是三元返回 null：占住 icon 槽位，所有条目文字左对齐一致
                icon: (
                  <CheckOutlined
                    style={{ color: COLOR.primary, visibility: active ? 'visible' : 'hidden' }}
                  />
                ),
                label: (
                  <div
                    className="flex items-center justify-between gap-6"
                    style={{ minWidth: 150 }}
                  >
                    <span className="truncate">{tenant.name}</span>
                    <span style={{ color: COLOR.ink3, fontSize: 12 }}>
                      {ROLE_LABEL[tenant.role] ?? tenant.role}
                    </span>
                  </div>
                ),
                onClick: () => void handleSwitch(tenant.id, tenant.name),
              };
            }),
          },
        ]
      : [
          {
            key: 'tenant-current',
            icon: <TeamOutlined />,
            // 无 onClick：只有一个团队，点它不产生任何语义，仅告知所在团队
            label: (
              <div className="flex items-center justify-between gap-6" style={{ minWidth: 150 }}>
                <TenantName name={currentTenant.name} />
                <span style={{ color: COLOR.ink3, fontSize: 12 }}>
                  {ROLE_LABEL[currentTenant.role] ?? currentTenant.role}
                </span>
              </div>
            ),
          },
        ];

  const items: MenuProps['items'] = [
    ...(showTeam ? [...teamEntry, { type: 'divider' as const }] : []),
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => void logout(),
    },
  ];

  return (
    <Dropdown placement="bottomRight" menu={{ items, style: { minWidth: 200 } }}>
      <button
        type="button"
        className="flex h-8 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1.5 hover:bg-primary-bg"
      >
        <Avatar
          src={user?.avatarUrl ?? undefined}
          size={28}
          style={{ backgroundColor: COLOR.primary, color: COLOR.surface, flexShrink: 0 }}
        >
          {user?.name?.[0] ?? '?'}
        </Avatar>
        <span
          className="max-w-[100px] truncate text-sm leading-[22px]"
          style={{ color: COLOR.ink2 }}
        >
          {user?.name}
        </span>
      </button>
    </Dropdown>
  );
}
