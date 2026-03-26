import { useEffect, useState } from "react";
import { Card, Row, Col, Statistic, Space, Typography, Spin } from "antd";
import { Line, Pie, Column } from "@ant-design/plots";
import {
  Users,
  Code,
  Trophy,
  Calendar,
  TrendingUp,
  PieChart,
  Layers,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import Layout from "@/components/Layout";
import styles from "./index.module.css";

const { Title } = Typography;

interface UserListData {
  users: unknown[];
  total: number;
  page: number;
  page_size: number;
}

interface EventsData {
  events: unknown[];
  total: number;
  page: number;
  page_size: number;
}

// Mock trend data (kept as-is per requirement)
const activityChartData = [
  ...([
    { month: "2024-07", developers: 856, projects: 234 },
    { month: "2024-08", developers: 923, projects: 267 },
    { month: "2024-09", developers: 1001, projects: 289 },
    { month: "2024-10", developers: 1089, projects: 312 },
    { month: "2024-11", developers: 1156, projects: 334 },
    { month: "2024-12", developers: 1247, projects: 356 },
  ].map((d) => ({ month: d.month, value: d.developers, category: "开发者" }))),
  ...([
    { month: "2024-07", developers: 856, projects: 234 },
    { month: "2024-08", developers: 923, projects: 267 },
    { month: "2024-09", developers: 1001, projects: 289 },
    { month: "2024-10", developers: 1089, projects: 312 },
    { month: "2024-11", developers: 1156, projects: 334 },
    { month: "2024-12", developers: 1247, projects: 356 },
  ].map((d) => ({ month: d.month, value: d.projects, category: "项目" }))),
];

const activityConfig = {
  data: activityChartData,
  xField: "month",
  yField: "value",
  seriesField: "category",
  color: ["#7c3aed", "#a78bfa"],
  smooth: true,
  legend: {
    position: "top" as const,
  },
};

const projectCategoryData = [
  { type: "DeFi", value: 128 },
  { type: "NFT", value: 89 },
  { type: "GameFi", value: 67 },
  { type: "DAO", value: 45 },
  { type: "基础设施", value: 27 },
];

const pieConfig = {
  data: projectCategoryData,
  angleField: "value",
  colorField: "type",
  color: ["#7c3aed", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"],
  radius: 0.9,
  innerRadius: 0.6,
  legend: {
    position: "bottom" as const,
  },
};

const techStackData = [
  { tech: "Solidity", count: 234 },
  { tech: "Rust", count: 156 },
  { tech: "TypeScript", count: 298 },
  { tech: "React", count: 267 },
  { tech: "Node.js", count: 223 },
];

const columnConfig = {
  data: techStackData,
  xField: "tech",
  yField: "count",
  color: "#7c3aed",
};

export default function Home() {
  const [totalDevelopers, setTotalDevelopers] = useState<number | null>(null);
  const [totalActivities, setTotalActivities] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [usersRes, eventsRes] = await Promise.all([
          apiFetch<UserListData>("/v1/users?page=1&page_size=1"),
          apiFetch<EventsData>("/v1/events?page=1&page_size=1"),
        ]);
        if (usersRes.code === 200) setTotalDevelopers(usersRes.data.total);
        if (eventsRes.code === 200) setTotalActivities(eventsRes.data.total);
      } catch {
        // stats unavailable
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, []);

  const stats = [
    {
      title: "开发者总数",
      value: totalDevelopers ?? 0,
      icon: <Users className={styles.statIcon} />,
      suffix: "+",
    },
    {
      title: "活动总数",
      value: totalActivities ?? 0,
      icon: <Calendar className={styles.statIcon} />,
      suffix: "",
    },
    {
      title: "黑客松活动",
      value: 24,
      icon: <Trophy className={styles.statIcon} />,
      suffix: "",
    },
    {
      title: "链上项目",
      value: 356,
      icon: <Code className={styles.statIcon} />,
      suffix: "+",
    },
  ];

  return (
    <Layout>
      <div className={styles.container} style={{ padding: 0 }}>
        {/* Stats */}
        <div className={styles.statsSection}>
          <Spin spinning={statsLoading}>
            <Row gutter={[24, 24]}>
              {stats.map((stat, index) => (
                <Col xs={24} sm={12} lg={6} key={index}>
                  <Card className={styles.statCard} variant="filled">
                    <div className={styles.statIconWrapper}>{stat.icon}</div>
                    <Statistic
                      title={stat.title}
                      value={stat.value}
                      suffix={stat.suffix}
                      styles={{ value: { color: "#7c3aed", fontWeight: 600 } }}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          </Spin>
        </div>

        {/* Charts */}
        <div className={styles.chartsSection}>
          <Title level={2} className={styles.sectionTitle}>
            <TrendingUp className={styles.titleIcon} />
            数据概览
          </Title>
          <Row gutter={[24, 24]}>
            <Col xs={24} xl={16}>
              <Card
                title={
                  <Space>
                    <TrendingUp size={18} color="#7c3aed" />
                    <span>开发者活跃度趋势</span>
                  </Space>
                }
                className={styles.chartCard}
                variant="borderless"
              >
                <Line {...activityConfig} height={320} />
              </Card>
            </Col>

            <Col xs={24} xl={8}>
              <Card
                title={
                  <Space>
                    <PieChart size={18} color="#7c3aed" />
                    <span>项目分类分布</span>
                  </Space>
                }
                className={styles.chartCard}
                variant="borderless"
              >
                <Pie {...pieConfig} height={320} />
              </Card>
            </Col>

            <Col xs={24}>
              <Card
                title={
                  <Space>
                    <Layers size={18} color="#7c3aed" />
                    <span>技术栈使用分布</span>
                  </Space>
                }
                className={styles.chartCard}
                variant="borderless"
              >
                <Column {...columnConfig} height={280} />
              </Card>
            </Col>
          </Row>
        </div>
      </div>
    </Layout>
  );
}
