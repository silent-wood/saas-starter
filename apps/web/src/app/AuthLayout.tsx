import { Button, Layout, Space } from 'antd';
import { Link, Outlet, useNavigate } from 'react-router';
import { clearToken } from '@/utils/token';

const { Header, Content } = Layout;

export function AuthLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

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
        <Button onClick={handleLogout}>退出登录</Button>
      </Header>
      <Content className="p-6">
        <Outlet />
      </Content>
    </Layout>
  );
}
