/**
 * 404 页面私有文案（规范 §24：页面私有文案放 pages/<Name>/constants.ts）
 *
 * 说明：状态码数字由 antd Result 的 status="404" 图标承载，标题用业务文案，
 * 避免页面上同时出现图标数字与标题两份 "404"。
 */
export const NOT_FOUND_COPY = {
  title: "页面不存在",
  desc: "你访问的页面可能已被删除或地址有误，请检查地址或返回首页继续操作。",
} as const;
