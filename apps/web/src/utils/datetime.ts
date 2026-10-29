/**
 * 日期时间统一出口（规范 §21）
 *
 * 铁律：业务代码禁止裸 new Date() / Date.now() 拼逻辑，统一走 dayjs。
 * 插件在模块加载时统一 extend（禁止散落在组件里），main.tsx 引入本文件生效。
 * 与后端的时间传输格式写死 ISO 8601 字符串（见规范 §21）。
 */
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import customParseFormat from "dayjs/plugin/customParseFormat";
import weekday from "dayjs/plugin/weekday";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(customParseFormat); // antd DatePicker 依赖：自定义格式解析
dayjs.extend(weekday); // antd DatePicker 依赖：周计算
dayjs.extend(relativeTime); // 「3 分钟前」相对时间展示
dayjs.locale("zh-cn");

export { dayjs };

/** 常规展示：2026-10-29 10:30 */
export function formatDateTime(value: string | number | Date): string {
  return dayjs(value).format("YYYY-MM-DD HH:mm");
}

/** 纯日期展示：2026-10-29 */
export function formatDate(value: string | number | Date): string {
  return dayjs(value).format("YYYY-MM-DD");
}

/** 相对时间展示：3 分钟前 / 2 天前（空态文案集中见 constants/copy.ts） */
export function formatRelative(value: string | number | Date): string {
  return dayjs(value).fromNow();
}
