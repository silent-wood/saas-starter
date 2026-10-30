/**
 * 403 页面（规范 §18 错误态）
 *
 * 语义：当前账号已登录，但无权访问目标资源。
 * 触发方式：接口返回 403 时由页面级逻辑跳转过来——规范 §18 明确 403 属
 * 页面级处理，不做全局拦截跳转（全局跳转会丢失"从哪来"的上下文）。
 */
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router';
import { COPY } from '@/constants/copy';
import { FORBIDDEN_COPY } from './constants';

/** 403 页面：展示权限不足并提供返回出口 */
export default function Forbidden() {
  const navigate = useNavigate();

  return (
    <Result
      status="403"
      title={FORBIDDEN_COPY.title}
      subTitle={FORBIDDEN_COPY.desc}
      extra={[
        <Button key="home" type="primary" onClick={() => navigate('/app')}>
          {COPY.common.backHome}
        </Button>,
        <Button key="back" onClick={() => navigate(-1)}>
          {FORBIDDEN_COPY.goBack}
        </Button>,
      ]}
    />
  );
}
