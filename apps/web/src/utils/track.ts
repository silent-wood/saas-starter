/**
 * 埋点单点入口（规范 §25）
 *
 * 约定：所有埋点必须经 track() 上报，禁止在组件里散写上报请求。
 * 当前为空实现（无上报通道）；接入 Sentry / 后端日志接口后只改此文件。
 */
// TODO(lishun): 接入真实上报通道（Sentry 或后端日志接口）后替换空实现
export function track(event: string, payload?: Record<string, unknown>): void {
  // 空实现：上报通道未就绪。接入后示例：
  // void fetch("/api/v1/telemetry", { method: "POST", body: JSON.stringify({ event, payload }) });
  void event;
  void payload;
}
