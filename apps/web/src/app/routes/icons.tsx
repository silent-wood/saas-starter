/**
 * 菜单图标表：meta.ts 里存的是 `icon: 'database'` 这类字符串键，到这里才落成组件。
 *
 * 这样做有两个原因：
 * 1. meta.ts 用 eager glob 同步进主包，若里面直接写 JSX，每个 meta 都会拉起
 *    @ant-design/icons 的导入语句，元信息也就不再是可序列化的纯数据；
 * 2. 图标名收敛成联合类型（IconName），meta 里拼错直接编译报错。
 */
import {
  AppstoreOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  PayCircleOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { IconName } from './types';

export const ICONS: Record<IconName, ReactNode> = {
  appstore: <AppstoreOutlined />,
  database: <DatabaseOutlined />,
  delete: <DeleteOutlined />,
  team: <TeamOutlined />,
  robot: <RobotOutlined />,
  pay: <PayCircleOutlined />,
  setting: <SettingOutlined />,
};
