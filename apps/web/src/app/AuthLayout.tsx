import { Button, Layout, Space } from "antd";
import { Link, Outlet, useNavigate } from "react-router";
import { TOKEN_KEY } from "./guards/RequireAuth";

const { Header, Content } = Layout;

export function AuthLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    navigate("/login", { replace: true });
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Space size="large">
          <Link to="/app" style={{ color: "#fff" }}>
            Dashboard
          </Link>
          <Link to="/app/resources" style={{ color: "#fff" }}>
            Resources
          </Link>
        </Space>
        <Button onClick={handleLogout}>退出登录</Button>
      </Header>
      <Content style={{ padding: 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
