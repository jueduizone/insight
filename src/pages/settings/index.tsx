import { Typography } from "antd";
import Layout from "@/components/Layout";

const { Title, Text } = Typography;

export default function SettingsPage() {
  return (
    <Layout>
      <Title level={4}>设置</Title>
      <Text type="secondary">系统设置功能开发中…</Text>
    </Layout>
  );
}
