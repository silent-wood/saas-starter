/**
 * 404 页面（规范 §18 错误态）
 *
 * 路由兜底：router.tsx 以 path="*" 匹配所有未定义路径，必须置于路由表末尾。
 * 职责单一——展示状态与出口，不发起任何数据请求。
 */
import { Button, Result } from "antd";
import { useNavigate } from "react-router";
import { COPY } from "@/constants/copy";
import { NOT_FOUND_COPY } from "./constants";

/** 404 页面：展示"页面不存在"并提供返回首页出口 */
export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      title={NOT_FOUND_COPY.title}
      subTitle={NOT_FOUND_COPY.desc}
      extra={[
        <Button key="home" type="primary" onClick={() => navigate("/app")}>
          {COPY.common.backHome}
        </Button>,
      ]}
    />
  );
}
