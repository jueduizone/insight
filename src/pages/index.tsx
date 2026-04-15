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
  Button,
  Modal,
  Progress,
  Table,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { Column, Line } from "@ant-design/plots";
import { UserOutlined, GithubOutlined, FileTextOutlined } from "@ant-design/icons";
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
  id?: number;
  ID?: number;
  created_at?: string;
  CreatedAt?: string;
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
  web3insight_count?: number;
  has_github_count?: number;
  has_profile_count?: number;
}

interface ScoreBucket {
  range: string;
  count: number;
}

interface EventFunnelItem {
  event_id: number;
  event_name: string;
  event_type: string;
  platform: string;
  count: number;
}

interface DailyTrend {
  date: string;
  count: number;
}

interface WeeklyReportData {
  period: { start: string; end: string; days: number };
  summary: {
    total_users: number;
    new_users: number;
    active_users: number;
    total_events: number;
    total_records: number;
  };
  event_funnel: EventFunnelItem[];
  retention: { period: string; total: number; active: number; rate: number }[];
  contact_coverage: {
    github_count: number;
    twitter_count: number;
    telegram_count: number;
    total_users: number;
    github_pct: number;
    twitter_pct: number;
    telegram_pct: number;
  };
  activity_distribution: ScoreBucket[];
  new_users_trend: DailyTrend[];
}

export default function Home() {
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [recentEvents, setRecentEvents] = useState<ActivityEvent[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Generate report modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setStatsLoading(true);
    try {
      const [usersRes, eventsRes, statsRes, reportRes] = await Promise.all([
        apiFetch<UserListData>("/v1/users?page=1&page_size=500"),
        apiFetch<EventsData>("/v1/events?page=1&page_size=5"),
        apiFetch<StatsData>("/v1/stats"),
        apiFetch<WeeklyReportData>("/v1/reports/weekly"),
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
      if (reportRes.code === 200) {
        setWeeklyReport(reportRes.data);
      }
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }

  async function handleGenerateReport() {
    setReportLoading(true);
    setReportContent("");
    setReportOpen(true);
    try {
      const res = await apiFetch<{ report: string }>("/v1/reports/generate");
      if (res.code === 200) {
        setReportContent(res.data.report);
      } else {
        message.error(res.message || "生成失败");
        setReportOpen(false);
      }
    } catch {
      message.error("生成失败");
      setReportOpen(false);
    } finally {
      setReportLoading(false);
    }
  }

  // Activity score distribution buckets (client-side fallback)
  const scoreBuckets: ScoreBucket[] = useMemo(() => {
    if (weeklyReport?.activity_distribution?.length) {
      return weeklyReport.activity_distribution;
    }
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
  }, [users, weeklyReport]);

  // Warning list: activity_score = 0, joined > 30 days ago
  const warningDevs = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return users
      .filter(
        (u) =>
          (u.activity_score || 0) === 0 &&
          new Date(u.CreatedAt ?? u.created_at ?? 0).getTime() < thirtyDaysAgo
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

  const lineConfig = {
    data: weeklyReport?.new_users_trend ?? [],
    xField: "date",
    yField: "count",
    color: "#7c3aed",
    point: { size: 3, shape: "circle" },
    smooth: true,
  };

  const statCards = [
    {
      title: "总开发者数",
      value: stats?.total_users ?? 0,
      color: "#a78bfa",
    },
    {
      title: "新增开发者（近30天）",
      value: stats?.new_users_7d ?? 0,
      color: "#a78bfa",
    },
    // 活跃开发者暂时隐藏，定义待明确
    {
      title: "活动总数",
      value: stats?.total_events ?? 0,
      color: "#a78bfa",
    },
    {
      title: "项目总数",
      value: stats?.total_projects ?? 0,
      color: "#a78bfa",
    },
    {
      title: "Hackathon 参与人次",
      value: stats?.total_records ?? 0,
      color: "#a78bfa",
    },
  ];

  const funnelColumns: ColumnsType<EventFunnelItem> = [
    {
      title: "活动名称",
      dataIndex: "event_name",
      key: "event_name",
      render: (name: string) => <Text strong>{name || "—"}</Text>,
    },
    {
      title: "类型",
      dataIndex: "event_type",
      key: "event_type",
      render: (type: string) =>
        type ? (
          <Tag color="purple" style={{ fontSize: 11 }}>
            {type}
          </Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "平台",
      dataIndex: "platform",
      key: "platform",
      render: (platform: string) => platform || <Text type="secondary">—</Text>,
    },
    {
      title: "参与人数",
      dataIndex: "count",
      key: "count",
      sorter: (a: EventFunnelItem, b: EventFunnelItem) => a.count - b.count,
      render: (count: number) => (
        <Text strong style={{ color: "#7c3aed" }}>
          {count}
        </Text>
      ),
    },
  ];

  const coverage = weeklyReport?.contact_coverage;

  return (
    <Layout>
      <div>
        {/* Page header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <Text strong style={{ fontSize: 18 }}>
            运营看板
          </Text>
          <Button
            type="primary"
            icon={<FileTextOutlined />}
            style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
            onClick={handleGenerateReport}
          >
            生成周报
          </Button>
        </div>

        {/* Stat Cards */}
        <Spin spinning={statsLoading}>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {statCards.map((s, i) => (
              <Col xs={24} sm={12} md={8} lg={6} xl={5} key={i}>
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

        {/* New users trend + Contact coverage */}
        <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
          <Col xs={24} lg={16} style={{ display: "none" }}>
            <Card title="新增开发者趋势（最近30天）" style={CARD_STYLE}>
              <Spin spinning={statsLoading}>
                {(weeklyReport?.new_users_trend?.length ?? 0) === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <Text type="secondary">暂无趋势数据</Text>
                  </div>
                ) : (
                  <Line {...lineConfig} height={200} />
                )}
              </Spin>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title="联系方式覆盖率" style={CARD_STYLE}>
              <Spin spinning={statsLoading}>
                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text>GitHub</Text>
                      <Text strong>{coverage?.github_pct?.toFixed(1) ?? "0.0"}%</Text>
                    </div>
                    <Progress
                      percent={Math.round(coverage?.github_pct ?? 0)}
                      strokeColor="#7c3aed"
                      showInfo={false}
                    />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text>Twitter</Text>
                      <Text strong>{coverage?.twitter_pct?.toFixed(1) ?? "0.0"}%</Text>
                    </div>
                    <Progress
                      percent={Math.round(coverage?.twitter_pct ?? 0)}
                      strokeColor="#a78bfa"
                      showInfo={false}
                    />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text>Telegram / 微信</Text>
                      <Text strong>{coverage?.telegram_pct?.toFixed(1) ?? "0.0"}%</Text>
                    </div>
                    <Progress
                      percent={Math.round(coverage?.telegram_pct ?? 0)}
                      strokeColor="#6d28d9"
                      showInfo={false}
                    />
                  </div>
                  <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12, marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>数据同步进度</Text>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 12 }}>🐙 GitHub 关联</Text>
                        <Text strong style={{ fontSize: 12 }}>
                          {stats?.has_github_count ?? 0} / {stats?.total_users ?? 0}
                        </Text>
                      </div>
                      <Progress
                        percent={stats?.total_users ? Math.round(((stats.has_github_count ?? 0) / stats.total_users) * 100) : 0}
                        strokeColor="#238636"
                        showInfo={false}
                        size="small"
                      />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 12 }}>🔍 Web3Insight 数据</Text>
                        <Text strong style={{ fontSize: 12 }}>
                          {stats?.web3insight_count ?? 0} / {stats?.total_users ?? 0}
                        </Text>
                      </div>
                      <Progress
                        percent={stats?.total_users ? Math.round(((stats.web3insight_count ?? 0) / stats.total_users) * 100) : 0}
                        strokeColor="#7c3aed"
                        showInfo={false}
                        size="small"
                      />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 12 }}>🤖 AI 画像生成</Text>
                        <Text strong style={{ fontSize: 12 }}>
                          {stats?.has_profile_count ?? 0} / {stats?.total_users ?? 0}
                        </Text>
                      </div>
                      <Progress
                        percent={stats?.total_users ? Math.round(((stats.has_profile_count ?? 0) / stats.total_users) * 100) : 0}
                        strokeColor="#f59e0b"
                        showInfo={false}
                        size="small"
                      />
                    </div>
                  </div>
                </Space>
              </Spin>
            </Card>
          </Col>
        </Row>

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
                              {new Date(dev.CreatedAt ?? dev.created_at ?? 0).toLocaleDateString("zh-CN")} 加入
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

        {/* Event Funnel Table */}
        <Card
          title="活动效果（参与人数）"
          style={{ ...CARD_STYLE, height: "auto", marginBottom: 24 }}
        >
          <Spin spinning={statsLoading}>
            <Table<EventFunnelItem>
              columns={funnelColumns}
              dataSource={weeklyReport?.event_funnel ?? []}
              rowKey="event_id"
              size="small"
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Spin>
        </Card>

        {/* Bottom: Talent TOP 10 */}
        <Card
          title="潜力开发者榜"
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
                  <Col xs={12} sm={8} md={6} lg={4} xl={4} key={dev.id || dev.ID}>
                    <Card
                      size="small"
                      hoverable
                      style={{ cursor: "pointer", borderRadius: 10 }}
                      onClick={() => router.push(`/developers/${dev.id || dev.ID}`)}
                    >
                      <Space direction="vertical" size={4} style={{ width: "100%" }}>
                        <Space size={8} align="center">
                          <Text strong style={{ color: idx < 3 ? "#7c3aed" : "#9ca3af", width: 20, flexShrink: 0, fontSize: 12 }}>
                            #{idx + 1}
                          </Text>
                          <Avatar size={28} icon={<UserOutlined />} src={dev.avatar || undefined} />
                          <Text strong ellipsis style={{ maxWidth: 90, fontSize: 13 }}>
                            {dev.username || dev.email || "—"}
                          </Text>
                        </Space>
                        <Space size={4} wrap>
                          <Tag color="purple" style={{ fontSize: 11, margin: 0 }}>
                            {dev.activity_score} 分
                          </Tag>
                          {dev.github && (
                            <a
                              href={dev.github.startsWith("http") ? dev.github : `https://github.com/${dev.github}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Tag icon={<GithubOutlined />} color="default" style={{ fontSize: 11, margin: 0, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {(dev.github.replace(/^https?:\/\/(www\.)?github\.com\//, "")).slice(0, 12)}{(dev.github.replace(/^https?:\/\/(www\.)?github\.com\//, "")).length > 12 ? "…" : ""}
                              </Tag>
                            </a>
                          )}
                        </Space>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Spin>
        </Card>
      </div>

      {/* Generate Report Modal */}
      <Modal
        title="AI 周报"
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        footer={[
          <Button
            key="copy"
            disabled={!reportContent}
            onClick={() => {
              navigator.clipboard.writeText(reportContent);
              message.success("已复制到剪贴板");
            }}
          >
            复制
          </Button>,
          <Button key="close" type="primary" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={() => setReportOpen(false)}>
            关闭
          </Button>,
        ]}
        width={600}
      >
        {reportLoading ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <Spin tip="AI 生成中..." />
          </div>
        ) : (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "inherit",
              lineHeight: 1.8,
              margin: 0,
            }}
          >
            {reportContent}
          </pre>
        )}
      </Modal>
    </Layout>
  );
}
