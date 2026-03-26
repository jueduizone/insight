import { Typography } from "antd";
import Layout from "@/components/Layout";

const { Title, Text } = Typography;

export default function ActivitiesPage() {
  return (
    <Layout>
      <Title level={4}>活动管理</Title>
      <Text type="secondary">活动管理功能开发中…</Text>
    </Layout>
  );
}
