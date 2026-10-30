/**
 * 路由级错误边界（规范 §18）
 *
 * 使用位置：router.tsx 中包裹每个懒加载路由——单个页面崩溃只白屏该页，
 * 不影响全局布局与导航。fallback 用 antd Result 提供重试入口。
 *
 * 注意：React 19 下 class 组件仅允许用于 ErrorBoundary（规范 §6）。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Result, Button } from 'antd';
import { track } from '@/utils/track';
import { COPY } from '@/constants/copy';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 用于错误上报时区分是哪个页面崩了 */
  scene?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 上报到监控通道（当前为空实现，接入 Sentry 后自动生效）
    track('error_boundary_catch', {
      scene: this.props.scene,
      message: error.message,
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  render() {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title={COPY.error.pageCrashTitle}
          subTitle={COPY.error.pageCrashDesc}
          extra={[
            <Button key="retry" type="primary" onClick={() => this.setState({ error: null })}>
              {COPY.common.retry}
            </Button>,
            <Button key="home" onClick={() => window.location.assign('/app')}>
              {COPY.common.backHome}
            </Button>,
          ]}
        />
      );
    }
    return this.props.children;
  }
}
