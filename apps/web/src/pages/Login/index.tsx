import { Button, Form, Input } from 'antd';
import { Navigate, useNavigate } from 'react-router';
import { TOKEN_KEY } from '@/app/guards/RequireAuth';
import { COPY } from '@/constants/copy';

export default function Login() {
  const navigate = useNavigate();
  const token = localStorage.getItem(TOKEN_KEY);

  // 已登录则直接进首页，避免重复登录
  if (token) {
    return <Navigate to="/app" replace />;
  }

  const onFinish = () => {
    // 仅做 localStorage 模拟：写入一个假 token，不做任何校验
    localStorage.setItem(TOKEN_KEY, `mock-token-${Date.now()}`);
    navigate('/app', { replace: true });
  };

  return (
    <div style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1 style={{ marginBottom: 16 }}>{COPY.auth.loginTitle}</h1>
      <Form onFinish={onFinish} layout="vertical">
        <Form.Item name="email" label={COPY.auth.email}>
          <Input placeholder="you@example.com" />
        </Form.Item>
        <Form.Item name="password" label={COPY.auth.password}>
          <Input.Password placeholder="password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block>
          {COPY.auth.loginAction}
        </Button>
      </Form>
    </div>
  );
}
