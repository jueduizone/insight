import { useEffect, useState, useMemo } from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  Typography,
  Tag,
  Space,
  Avatar,
  List,
  Spin,
  Badge,
} from "antd";
import { Column } from "@ant-design/plots";
import { UserOutlined, GithubOutlined } from "@ant-design/icons";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { apiFetch } from "@/lib/api";

const { Text } = Typography;

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 12,
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  border: "none",
  height: "100%",
};

interface User {
  ID: number;
  CreatedAt: string;
  email: string;
  username: string;
  avatar: string;
  github: string;
  tags: string[] | null;
  group: string;
  activity_score: number;
}

interface UserListData {
  users: User[];
  total: number;
}

interface ActivityEvent {
  id: number;
  created_at: string;
  name: string;
  type: string;
  platform: string;
}

interface EventsData {
  events: ActivityEvent[];
  total: number;
}

interface StatsData {
  total_users: number;
  new_users_7d: number;
  active_users: number;
  total_events: number;
  total_projects: number;
  total_records: number;
}

interface ScoreBucket {
  range: string;
  count: number;
}

export default function Home() {
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [recentEvents, setRecentEvents] = useState<ActivityEvent[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setStatsLoading(true);
    try {
      const [usersRes, eventsRes, statsRes] = await Promise.all([
        apiFetch<UserListData>("/v1/users?page=1&page_size=500"),
        apiFetch<EventsData>("/v1/events?page=1&page_size=5"),
        apiFetch<StatsData>("/v1/stats"),
      ]);

      if (usersRes.code === 200) {
        setUsers(usersRes.data.users || []);
      }
      if (eventsRes.code === 200) {
        setRecentEvents(eventsRes.data.events || []);
      }
      if (statsRes.code === 200) {
        setStats(statsRes.data);
      }
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }

  // Activity score distribution buckets
  const scoreBuckets: ScoreBucket[] = useMemo(() => {
    const buckets = [
      { range: "0", count: 0 },
      { range: "1-30", count: 0 },
      { range: "31-60", count: 0 },
      { range: "61-100", count: 0 },
    ];
    users.forEach((u) => {
      const s = u.activity_score || 0;
      if (s === 0) buckets[0].count++;
      else if (s <= 30) buckets[1].count++;
      else if (s <= 60) buckets[2].count++;
      else buckets[3].count++;
    });
    return buckets;
  }, [users]);

  // Warning list: activity_score = 0, joined > 30 days ago
  const warningDevs = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return users
      .filter(
        (u) =>
          (u.activity_score || 0) === 0 &&
          new Date(u.CreatedAt).getTime() < thirtyDaysAgo
      )
      .slice(0, 5);
  }, [users]);

  // TOP 10 by activity_score
  const top10 = useMemo(
    () =>
      [...users]
        .filter((u) => (u.activity_score || 0) > 0)
        .sort((a, b) => (b.activity_score || 0) - (a.activity_score || 0))
        .slice(0, 10),
    [users]
  );

  const columnConfig = {
    data: scoreBuckets,
    xField: "range",
    yField: "count",
    color: "#7c3aed",
    label: {
      position: "top" as const,
    },
    xAxis: { title: { text: "活跃度分段" } },
    yAxis: { title: { text: "人数" } },
  };

  const statCards = [
    {
      title: "总开发者数",
      value: stats?.total_users ?? 0,
      color: "#7c3aed",
    },
    {
      title: "本周新增开发者",
      value: stats?.new_users_7d ?? 0,
      color: "#a78bfa",
    },
    {
      title: "活跃开发者",
      value: stats?.active_users ?? 0,
      color: "#6d28d9",
    },
    {
      title: "活动总数",
      value: stats?.total_events ?? 0,
      color: "#5b21b6",
    },
    {
      title: "项目总数",
      value: stats?.total_projects ?? 0,
      color: "#4c1d95",
    },
    {
      title: "Hackathon 参与人次",
      value: stats?.total_records ?? 0,
      color: "#3b0764",
    },
  ];

  return (
    <Layout>
      <div>
        {/* Stat Cards */}
        <Spin spinning={statsLoading}>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {statCards.map((s, i) => (
              <Col xs={24} sm={12} lg={4} key={i}>
                <Card style={CARD_STYLE}>
                  <Statistic
                    title={<Text style={{ fontSize: 13 }}>{s.title}</Text>}
                    value={s.value}
                    valueStyle={{ color: s.color, fontWeight: 700 }}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Spin>

        {/* Middle Row: Chart + Warning + Events */}
        <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
          {/* Left 60%: Activity score distribution */}
          <Col xs={24} lg={14}>
            <Card title="开发者活跃度分布" style={CARD_STYLE}>
              <Spin spinning={statsLoading}>
                <Column {...columnConfig} height={260} />
              </Spin>
            </Card>
          </Col>

          {/* Right 40%: Warning list + Recent events */}
          <Col xs={24} lg={10}>
            <Space direction="vertical" size={20} style={{ width: "100%" }}>
              {/* Warning list */}
              <Card
                title={
                  <Space>
                    <span>预警名单</span>
                    <Badge count={warningDevs.length} color="#f59e0b" />
                  </Space>
                }
                style={{ ...CARD_STYLE, height: "auto" }}
              >
                {warningDevs.length === 0 ? (
                  <Text type="secondary">暂无预警开发者</Text>
                ) : (
                  <List
                    dataSource={warningDevs}
                    renderItem={(dev) => (
                      <List.Item
                        style={{ padding: "8px 0", cursor: "pointer" }}
                        onClick={() => router.push(`/developers/${dev.ID}`)}
                      >
                        <Space style={{ width: "100%", justifyContent: "space-between" }}>
                          <Space size={8}>
                            <Avatar
                              size={28}
                              icon={<UserOutlined />}
                              src={dev.avatar || undefined}
                            />
                            <Text>{dev.username || dev.email}</Text>
                          </Space>
                          <Space direction="vertical" size={0} style={{ alignItems: "flex-end" }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {new Date(dev.CreatedAt).toLocaleDateString("zh-CN")} 加入
                            </Text>
                            <Text style={{ fontSize: 11, color: "#7c3aed" }}>
                              点击查看
                            </Text>
                          </Space>
                        </Space>
                      </List.Item>
                    )}
                  />
                )}
              </Card>

              {/* Recent Events */}
              <Card title="最近活动" style={{ ...CARD_STYLE, height: "auto" }}>
                <Spin spinning={statsLoading}>
                  {recentEvents.length === 0 ? (
                    <div style={{ padding: "16px 0", textAlign: "center" }}>
                      <Text type="secondary">暂无活动</Text>
                    </div>
                  ) : (
                    <List
                      dataSource={recentEvents}
                      renderItem={(ev) => (
                        <List.Item style={{ padding: "10px 0" }}>
                          <div style={{ width: "100%" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: 8,
                              }}
                            >
                              <Text strong style={{ flex: 1 }}>
                                {ev.name}
                              </Text>
                              {ev.type && (
                                <Tag color="purple" style={{ fontSize: 11 }}>
                                  {ev.type}
                                </Tag>
                              )}
                            </div>
                            <Text
                              type="secondary"
                              style={{
                                fontSize: 12,
                                marginTop: 2,
                                display: "block",
                              }}
                            >
                              {ev.platform ? `${ev.platform} · ` : ""}
                              {new Date(ev.created_at).toLocaleDateString("zh-CN")}
                            </Text>
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                </Spin>
              </Card>
            </Space>
          </Col>
        </Row>

        {/* Bottom: Activity TOP 10 */}
        <Card
          title={`活跃度 TOP ${top10.length} 开发者`}
          style={{ ...CARD_STYLE, height: "auto" }}
        >
          <Spin spinning={statsLoading}>
            {top10.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <Text type="secondary">暂无活跃开发者数据</Text>
              </div>
            ) : (
              <Row gutter={[12, 12]}>
                {top10.map((dev, idx) => (
                  <Col xs={24} sm={12} md={8} lg={6} xl={4} key={dev.ID}>
                    <Card
                      size="small"
                      hoverable
                      style={{ cursor: "pointer", borderRadius: 10 }}
                      onClick={() => router.push(`/developers/${dev.ID}`)}
                    >
                      <Space direction="vertical" size={6} style={{ width: "100%" }}>
                        <Space size={10} align="start">
                          <Text
                            strong
                            style={{
                              color: idx < 3 ? "#7c3aed" : "#6b7280",
                              width: 18,
                              flexShrink: 0,
                              fontSize: 13,
                            }}
                          >
                            #{idx + 1}
                          </Text>
                          <Avatar
                            size={32}
                            icon={<UserOutlined />}
                            src={dev.avatar || undefined}
                          />
                          <div style={{ overflow: "hidden" }}>
                            <Text
                              strong
                              ellipsis
                              style={{ display: "block", maxWidth: 80 }}
                            >
                              {dev.username || dev.email || "—"}
                            </Text>
                            <Tag
                              color="purple"
                              style={{ fontSize: 11, marginTop: 2 }}
                            >
                              {dev.activity_score} 分
                            </Tag>
                          </div>
                        </Space>
                        {dev.github && (
                          <a
                            href={`https://github.com/${dev.github}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Tag
                              icon={<GithubOutlined />}
                              color="default"
                              style={{ fontSize: 11 }}
                            >
                              {dev.github}
                            </Tag>
                          </a>
                        )}
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Spin>
        </Card>
      </div>
    </Layout>
  );
}
