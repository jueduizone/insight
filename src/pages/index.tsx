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
} from "antd";
import { Pie } from "@ant-design/plots";
import { UserOutlined } from "@ant-design/icons";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { apiFetch } from "@/lib/api";

const { Text } = Typography;

const WEB3_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiIxIiwiaXNzIjoid2ViM2luc2lnaHRzLmFwcCIsImV4cCI6MTc5MzA2NDA4OSwidHlwZSI6ImFkbWluIiwiZXh0cmEiOnsiY2xhaW1zIjp7ImFsbG93ZWRfcm9sZXMiOlsidXNlciIsImFkbWluIl0sImRlZmF1bHRfcm9sZSI6InVzZXIiLCJ1c2VyX2lkIjoiMSJ9fX0.Rl39YXUbdrM-0V_fLbdgSLdpL3QxUWyPXdGSl_S6Y3Q";

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
  tags: string[] | null;
  group: string;
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

interface ProjectsData {
  projects: unknown[];
  total: number;
}

interface Web3Actor {
  rank: number;
  login: string;
  score: number;
}

interface GroupCount {
  type: string;
  value: number;
}

export default function Home() {
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [totalDevs, setTotalDevs] = useState(0);
  const [totalActivities, setTotalActivities] = useState(0);
  const [totalProjects, setTotalProjects] = useState(0);
  const [recentEvents, setRecentEvents] = useState<ActivityEvent[]>([]);
  const [topActors, setTopActors] = useState<Web3Actor[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [web3Loading, setWeb3Loading] = useState(true);

  useEffect(() => {
    fetchAll();
    fetchWeb3();
  }, []);

  async function fetchAll() {
    setStatsLoading(true);
    try {
      const [usersRes, eventsRes, projectsRes] = await Promise.all([
        apiFetch<UserListData>("/v1/users?page=1&page_size=500"),
        apiFetch<EventsData>("/v1/events?page=1&page_size=5"),
        apiFetch<ProjectsData>("/v1/projects?page=1&page_size=1"),
      ]);

      if (usersRes.code === 200) {
        setUsers(usersRes.data.users || []);
        setTotalDevs(usersRes.data.total);
      }
      if (eventsRes.code === 200) {
        setRecentEvents(eventsRes.data.events || []);
        setTotalActivities(eventsRes.data.total);
      }
      if (projectsRes.code === 200) {
        setTotalProjects(projectsRes.data.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }

  async function fetchWeb3() {
    setWeb3Loading(true);
    try {
      const res = await fetch(
        "https://api.web3insight.ai/v1/actors/top?eco_name=Monad",
        { headers: { Authorization: `Bearer ${WEB3_TOKEN}` } }
      );
      if (res.ok) {
        const data = (await res.json()) as unknown;
        let actors: Web3Actor[] = [];
        if (Array.isArray(data)) {
          actors = data as Web3Actor[];
        } else if (data && typeof data === "object") {
          const obj = data as Record<string, unknown>;
          if (Array.isArray(obj["data"])) {
            actors = obj["data"] as Web3Actor[];
          } else if (Array.isArray(obj["actors"])) {
            actors = obj["actors"] as Web3Actor[];
          }
        }
        setTopActors(actors.slice(0, 5));
      }
    } catch {
      // ignore network errors for external API
    } finally {
      setWeb3Loading(false);
    }
  }

  // Group distribution for pie chart
  const groupData: GroupCount[] = useMemo(() => {
    const map: Record<string, number> = {};
    users.forEach((u) => {
      const g = u.group || "未分组";
      map[g] = (map[g] || 0) + 1;
    });
    return Object.entries(map).map(([type, value]) => ({ type, value }));
  }, [users]);

  // Latest 10 developers sorted by CreatedAt desc
  const latestDevs = useMemo(
    () =>
      [...users]
        .sort(
          (a, b) =>
            new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime()
        )
        .slice(0, 10),
    [users]
  );

  const pieConfig = {
    data: groupData.length > 0 ? groupData : [{ type: "暂无数据", value: 1 }],
    angleField: "value" as const,
    colorField: "type" as const,
    radius: 0.9,
    innerRadius: 0.6,
    label: false as const,
    legend: { position: "bottom" as const },
    color: ["#7c3aed", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe", "#8b5cf6"],
  };

  const statCards = [
    {
      title: "总开发者数",
      value: totalDevs,
      color: "#7c3aed",
    },
    {
      title: "本周活跃",
      value: 0,
      color: "#a78bfa",
      note: "待 GitHub 采集后自动更新",
    },
    {
      title: "活动总数",
      value: totalActivities,
      color: "#6d28d9",
    },
    {
      title: "项目总数",
      value: totalProjects,
      color: "#5b21b6",
    },
  ];

  return (
    <Layout>
      <div>
        {/* Stat Cards */}
        <Spin spinning={statsLoading}>
          <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
            {statCards.map((s, i) => (
              <Col xs={24} sm={12} lg={6} key={i}>
                <Card style={CARD_STYLE}>
                  <Statistic
                    title={
                      <Space direction="vertical" size={0}>
                        <Text style={{ fontSize: 14 }}>{s.title}</Text>
                        {s.note && (
                          <Text
                            type="secondary"
                            style={{ fontSize: 11, fontWeight: 400 }}
                          >
                            {s.note}
                          </Text>
                        )}
                      </Space>
                    }
                    value={s.value}
                    valueStyle={{ color: s.color, fontWeight: 700 }}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Spin>

        {/* Middle Row: Pie + Events + Web3 */}
        <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
          {/* Group Distribution Pie */}
          <Col xs={24} lg={14}>
            <Card title="开发者分组分布" style={CARD_STYLE}>
              <Spin spinning={statsLoading}>
                {groupData.length > 0 ? (
                  <Pie {...pieConfig} height={300} />
                ) : (
                  <div style={{ textAlign: "center", padding: "60px 0" }}>
                    <Text type="secondary">暂无分组数据</Text>
                  </div>
                )}
              </Spin>
            </Card>
          </Col>

          {/* Right column: recent events + web3 */}
          <Col xs={24} lg={10}>
            <Space direction="vertical" size={20} style={{ width: "100%" }}>
              {/* Recent Events */}
              <Card
                title="最近活动"
                style={{ ...CARD_STYLE, height: "auto" }}
              >
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
                              {new Date(ev.created_at).toLocaleDateString(
                                "zh-CN"
                              )}
                            </Text>
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                </Spin>
              </Card>

              {/* Web3Insight TOP 5 */}
              <Card
                title={
                  <Space>
                    <span>🏆 生态 TOP 开发者</span>
                    <Text
                      type="secondary"
                      style={{ fontSize: 12, fontWeight: 400 }}
                    >
                      Monad · Web3Insight
                    </Text>
                  </Space>
                }
                style={{ ...CARD_STYLE, height: "auto" }}
              >
                <Spin spinning={web3Loading}>
                  {!web3Loading && topActors.length === 0 ? (
                    <div style={{ padding: "16px 0", textAlign: "center" }}>
                      <Text type="secondary">暂无数据</Text>
                    </div>
                  ) : (
                    <List
                      dataSource={topActors}
                      renderItem={(actor) => (
                        <List.Item style={{ padding: "8px 0" }}>
                          <Space
                            style={{
                              width: "100%",
                              justifyContent: "space-between",
                            }}
                          >
                            <Space size={10}>
                              <Text
                                strong
                                style={{
                                  color:
                                    actor.rank <= 3 ? "#7c3aed" : "#6b7280",
                                  width: 20,
                                  display: "inline-block",
                                  textAlign: "center",
                                }}
                              >
                                {actor.rank}
                              </Text>
                              <a
                                href={`https://github.com/${actor.login}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {actor.login}
                              </a>
                            </Space>
                            <Tag color="purple">
                              {typeof actor.score === "number"
                                ? actor.score.toFixed(1)
                                : String(actor.score)}
                            </Tag>
                          </Space>
                        </List.Item>
                      )}
                    />
                  )}
                </Spin>
              </Card>
            </Space>
          </Col>
        </Row>

        {/* Latest Developers */}
        <Card
          title={`最新加入的开发者（最近 ${latestDevs.length} 位）`}
          style={{ ...CARD_STYLE, height: "auto" }}
        >
          <Spin spinning={statsLoading}>
            {latestDevs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <Text type="secondary">暂无开发者数据</Text>
              </div>
            ) : (
              <Row gutter={[12, 12]}>
                {latestDevs.map((dev) => (
                  <Col xs={24} sm={12} md={8} lg={6} xl={4} key={dev.ID}>
                    <Card
                      size="small"
                      hoverable
                      style={{ cursor: "pointer", borderRadius: 10 }}
                      onClick={() => router.push(`/developers/${dev.ID}`)}
                    >
                      <Space
                        direction="vertical"
                        size={6}
                        style={{ width: "100%" }}
                      >
                        <Space size={10}>
                          <Avatar
                            size={36}
                            icon={<UserOutlined />}
                            src={dev.avatar || undefined}
                          />
                          <div style={{ overflow: "hidden", flex: 1 }}>
                            <Text
                              strong
                              ellipsis
                              style={{ display: "block", maxWidth: 100 }}
                            >
                              {dev.username || dev.email || "—"}
                            </Text>
                            {dev.group && (
                              <Tag
                                color="blue"
                                style={{ fontSize: 11, marginTop: 2 }}
                              >
                                {dev.group}
                              </Tag>
                            )}
                          </div>
                        </Space>
                        {(dev.tags?.length ?? 0) > 0 && (
                          <Space wrap size={4}>
                            {dev.tags!.slice(0, 2).map((t) => (
                              <Tag
                                key={t}
                                color="purple"
                                style={{ fontSize: 11 }}
                              >
                                {t}
                              </Tag>
                            ))}
                            {dev.tags!.length > 2 && (
                              <Text
                                type="secondary"
                                style={{ fontSize: 11 }}
                              >
                                +{dev.tags!.length - 2}
                              </Text>
                            )}
                          </Space>
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
