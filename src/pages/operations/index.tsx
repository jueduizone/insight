import { Typography } from "antd";
import Layout from "@/components/Layout";

const { Title, Text } = Typography;

export default function OperationsPage() {
  return (
    <Layout>
      <Title level={4}>运营记录</Title>
      <Text type="secondary">运营记录功能开发中…</Text>
    </Layout>
  );
}
