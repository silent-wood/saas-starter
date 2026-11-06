import { Button, Layout, Space } from 'antd';
import { Link, Outlet } from 'react-router';
import { useLogout } from '@/hooks/useLogout';
import { useTenantRouting } from './useTenantRouting';

const { Header, Content } = Layout;

export function AuthLayout() {
  /**
   * 多租户落点判断放在布局层而不是页面层：
   * 它是「进入工作台之后」的前置条件，所有 /app 下的页面都该受同一套规则约束。
   * 单租户会自动选定并静默通过，多租户且当前选择失效时才跳 /select-tenant。
   */
  useTenantRouting();
  const logout = useLogout();

  return (
    <Layout className="min-h-screen!">
      <Header className="flex items-center justify-between">
        <Space size="large">
          <Link to="/app" className="text-white">
            Dashboard
          </Link>
          <Link to="/app/resources" className="text-white">
            Resources
          </Link>
        </Space>
        <Button onClick={() => void logout()}>退出登录</Button>
      </Header>
      <Content className="p-6">
        <Outlet />
      </Content>
    </Layout>
  );
}
