/**
 * 占位页：菜单已上线、功能未开发的页面统一渲染。
 * 只展示菜单名称与「建设中」提示，替代禁用菜单项的死链（设计稿 S2 菜单 8 项全出）。
 * 对应功能落地时，直接把该目录的 page.tsx 换成真实页面即可，meta.ts 不用动。
 */
import { ProCard } from '@ant-design/pro-components';
import { Typography } from 'antd';
import { COLOR } from '@/theme/tokens';

export interface PlaceholderPageProps {
  /** 页面标题（即菜单名称） */
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <ProCard bordered className="min-h-[400px]">
      <div className="flex min-h-[360px] flex-col items-center justify-center">
        <Typography.Title level={3} style={{ marginBottom: 8, color: COLOR.ink }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary" style={{ color: COLOR.ink3 }}>
          功能建设中，敬请期待
        </Typography.Text>
      </div>
    </ProCard>
  );
}

export default PlaceholderPage;
