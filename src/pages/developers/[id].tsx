import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  Row,
  Col,
  Card,
  Avatar,
  Tag,
  Space,
  Typography,
  Button,
  Spin,
  Timeline,
  List,
  Form,
  Input,
  Modal,
  Tooltip,
  Divider,
  Badge,
  message,
} from "antd";
import {
  ArrowLeftOutlined,
  GithubOutlined,
  UserOutlined,
  PlusOutlined,
  SyncOutlined,
  TwitterOutlined,
  WalletOutlined,
  WechatOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import Layout from "@/components/Layout";
import { apiFetch } from "@/lib/api";

// parseProjects: 统一解析 existing_projects 字段（与列表页共用同一逻辑）
// 按逗号/顿号/换行分割，过滤噪声词（无/没有/暂无/none/n/a 等）
const NOISE_WORDS = ["无", "没有", "暂无", "现场组队", "待定", "none", "n/a", "no", "nope", "null", "-", "—"];
function parseProjects(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || s.length < 2) return false;
      const lower = s.toLowerCase();
      return !NOISE_WORDS.some((n) => lower === n || lower === n.toLowerCase());
    });
}

const { Title, Text, Paragraph } = Typography;

interface UserDetail {
  id?: number;
  ID?: number;
  created_at?: string;
  CreatedAt?: string;
  first_joined_at?: string;
  email: string;
  username: string;
  intro: string;
  avatar: string;
  github: string;
  twitter: string;
  wechat?: string;
  telegram?: string;
  existing_projects?: string;
  projects_raw?: string;
  projects_cleaned?: boolean;
  wallet_address: string;
  web3insight_id: string;
  tags: string[] | null;
  group: string;
  github_stats: string | null;
  twitter_stats: string | null;
  notes: string;
  role: string;
  activity_score: number;
}

interface GithubStats {
  // Web3Insight fields
  total_commits?: number;
  active_repos?: number | string[];
  languages?: string[];
  weekly_activity?: number;
  score?: number;
  rank?: number;
  eco_contributions?: number;
  // GitHub worker fields
  login?: string;
  name?: string;
  location?: string;
  bio?: string;
  company?: string;
  public_repos?: number;
  followers?: number;
  following?: number;
  total_commits_7d?: number;
  total_commits_30d?: number;
  last_active_at?: string;
  fetched_at?: string;
  // OpenDevData fields
  monad_commits?: number;
  is_chinese_dev?: boolean;
}

interface ActivityEvent {
  id: number;
  name: string;
  type: string;
  platform: string;
  start_date: string;
}

interface ActivityRecord {
  id: number;
  event_id: number;
  award: string;
  role: string;
  status: string;
  extra_data?: Record<string, string> | string;
  event?: ActivityEvent;
}

interface OperationLog {
  id: number;
  created_at: string;
  content: string;
  admin?: { username: string; email: string };
}

interface Project {
  ID: number;
  name: string;
  github: string;
  award_level: string;
  score: number;
  members: string;
}

interface ProjectListData {
  projects: Project[];
  total: number;
}

function parseGithubStats(raw: string | null): GithubStats | null {
  if (!raw) return null;
  try {
    const decoded = atob(raw);
    return JSON.parse(decoded) as GithubStats;
  } catch {
    try {
      return JSON.parse(raw) as GithubStats;
    } catch {
      return null;
    }
  }
}

function scoreColor(score: number): string {
  if (score === 0) return "default";
  if (score <= 30) return "orange";
  if (score <= 60) return "blue";
  return "green";
}

export default function DeveloperDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  const [syncing, setSyncing] = useState(false);
  const [generatingProfile, setGeneratingProfile] = useState(false);

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logForm] = Form.useForm();

  useEffect(() => {
    if (!id) return;
    const uid = Array.isArray(id) ? id[0] : id;
    fetchUser(uid);
    fetchActivity(uid);
    fetchLogs(uid);
  }, [id]);

  async function fetchUser(uid: string) {
    setLoading(true);
    try {
      const res = await apiFetch<UserDetail>(`/v1/users/${uid}`);
      if (res.code === 200) {
        setUser(res.data);
        fetchProjects(res.data);
      } else message.error(res.message || "获取用户信息失败");
    } catch {
      message.error("获取用户信息失败");
    } finally {
      setLoading(false);
    }
  }

  async function fetchProjects(u: UserDetail) {
    try {
      const res = await apiFetch<ProjectListData>(
        "/v1/projects?page=1&page_size=100"
      );
      if (res.code === 200) {
        const all = res.data.projects || [];
        const matched = all.filter((p) => {
          const m = p.members || "";
          if (u.github && m.toLowerCase().includes(u.github.toLowerCase()))
            return true;
          if (
            u.username &&
            m.toLowerCase().includes(u.username.toLowerCase())
          )
            return true;
          return false;
        });
        setProjects(matched);
      }
    } catch {
      // ignore
    }
  }

  async function fetchActivity(uid: string) {
    setActivityLoading(true);
    try {
      const res = await apiFetch<ActivityRecord[]>(`/v1/users/${uid}/activity`);
      if (res.code === 200) setActivity(res.data || []);
    } catch {
      // ignore
    } finally {
      setActivityLoading(false);
    }
  }

  async function fetchLogs(uid: string) {
    setLogsLoading(true);
    try {
      const res = await apiFetch<OperationLog[]>(
        `/v1/operation-logs?target_type=user&target_id=${uid}`
      );
      if (res.code === 200) setLogs(res.data || []);
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
    }
  }

  const handleSyncWeb3Insight = async () => {
    if (!id) return;
    const uid = Array.isArray(id) ? id[0] : id;
    setSyncing(true);
    try {
      const res = await apiFetch(`/v1/users/${uid}/sync-web3insight`, {
        method: "POST",
      });
      if (res.code === 200) {
        message.success("Web3Insight 数据同步成功");
        fetchUser(uid);
      } else {
        message.error(res.message || "同步失败");
      }
    } catch {
      message.error("同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddLog = async (values: { content: string }) => {
    if (!id) return;
    setLogSubmitting(true);
    const uid = Array.isArray(id) ? id[0] : id;
    try {
      const res = await apiFetch("/v1/operation-logs", {
        method: "POST",
        body: JSON.stringify({
          target_type: "user",
          target_id: Number(uid),
          content: values.content,
        }),
      });
      if (res.code === 200 || res.code === 201) {
        message.success("运营记录已添加");
        setLogModalOpen(false);
        logForm.resetFields();
        fetchLogs(uid);
      } else {
        message.error(res.message || "添加失败");
      }
    } catch {
      message.error("添加失败");
    } finally {
      setLogSubmitting(false);
    }
  };

  const handleGenerateProfile = async () => {
    if (!id) return;
    const uid = Array.isArray(id) ? id[0] : id;
    setGeneratingProfile(true);
    try {
      const res = await apiFetch<{ notes: string }>(`/v1/users/${uid}/generate-profile`, {
        method: "POST",
      });
      if (res.code === 200) {
        message.success("AI 画像生成成功");
        fetchUser(uid);
      } else {
        message.error(res.message || "生成失败");
      }
    } catch {
      message.error("生成失败");
    } finally {
      setGeneratingProfile(false);
    }
  };

  const githubStats = user ? parseGithubStats(user.github_stats) : null;

  const activeReposList = githubStats
    ? Array.isArray(githubStats.active_repos)
      ? (githubStats.active_repos as string[]).slice(0, 3)
      : null
    : null;

  const activeReposCount =
    githubStats && typeof githubStats.active_repos === "number"
      ? githubStats.active_repos
      : null;

  if (loading) {
    return (
      <Layout>
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <Spin size="large" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Text type="secondary">用户不存在</Text>
        </div>
      </Layout>
    );
  }

  function parseExtraData(raw?: string | Record<string, string>): Record<string, string> | null {
    if (!raw) return null;
    // Already an object (json.RawMessage serialized as object)
    if (typeof raw === "object") {
      return Object.keys(raw).length > 0 ? raw as Record<string, string> : null;
    }
    try {
      const obj = JSON.parse(raw as string);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj as Record<string, string>;
    } catch {
      // ignore
    }
    return null;
  }

  const activityTimelineItems = activity.map((r) => {
    const extra = parseExtraData(r.extra_data);
    const extraEntries = extra
      ? Object.entries(extra).filter(([, v]) => v !== "" && v !== null && v !== undefined)
      : [];
    return {
      key: r.id,
      color: r.award ? "gold" : "blue",
      children: (
        <div>
          <Space wrap size={4}>
            <Text strong>{r.event?.name ?? `活动 #${r.event_id}`}</Text>
            {r.event?.type && <Tag color="purple">{r.event.type}</Tag>}
            {r.award && <Tag color="gold">{r.award}</Tag>}
            {r.role && <Tag color="default">{r.role}</Tag>}
            {r.status && <Tag color="green">{r.status}</Tag>}
          </Space>
          {r.event?.start_date && (
            <Text
              type="secondary"
              style={{ display: "block", fontSize: 12, marginTop: 2 }}
            >
              {new Date(r.event.start_date).toLocaleDateString("zh-CN")}
              {r.event.platform ? ` · ${r.event.platform}` : ""}
            </Text>
          )}
          {extraEntries.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary
                style={{
                  fontSize: 11,
                  color: "#999",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                原始数据
              </summary>
              <div
                style={{
                  background: "#1f1633",
                  borderRadius: 4,
                  padding: "6px 10px",
                  marginTop: 4,
                  fontSize: 12,
                }}
              >
                {extraEntries.map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 2 }}>
                    <Text style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>{k}：</Text>
                    <Text style={{ fontSize: 12, color: "#333" }}>{String(v)}</Text>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ),
    };
  });

  return (
    <Layout>
      <div>
        {/* Back button */}
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/developers")}
          style={{ marginBottom: 16, padding: 0, color: "#7c3aed" }}
        >
          返回开发者列表
        </Button>

        {/* Profile Header Card */}
        <Card style={{ marginBottom: 20, borderRadius: 12 }}>
          <Space size={24} align="start">
            <Avatar
              size={80}
              icon={<UserOutlined />}
              src={user.avatar || undefined}
              style={{ flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <Space align="center" style={{ marginBottom: 6 }}>
                <Title level={3} style={{ margin: 0 }}>
                  {user.username || "未命名"}
                </Title>
                {user.group && <Tag color="blue">{user.group}</Tag>}
                <Tag color="purple">{user.role}</Tag>
                <Badge
                  color={scoreColor(user.activity_score || 0)}
                  text={
                    <Text style={{ fontSize: 12 }}>
                      活跃度 {user.activity_score || 0}
                    </Text>
                  }
                />
              </Space>
              <Text
                type="secondary"
                style={{ display: "block", marginBottom: 10 }}
              >
                {user.email}
              </Text>

              <Space wrap size={8} style={{ marginBottom: 10 }}>
                {user.github && (
                  <a
                    href={user.github.startsWith("http") ? user.github : `https://github.com/${user.github}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Tag icon={<GithubOutlined />} color="default">
                      {user.github.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
                    </Tag>
                  </a>
                )}
                {user.twitter && (
                  <a
                    href={`https://twitter.com/${user.twitter}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Tag icon={<TwitterOutlined />} color="blue">
                      {user.twitter}
                    </Tag>
                  </a>
                )}
                {user.wallet_address && (
                  <Tooltip title={user.wallet_address}>
                    <Tag icon={<WalletOutlined />} color="cyan">
                      {user.wallet_address.slice(0, 6)}…
                      {user.wallet_address.slice(-4)}
                    </Tag>
                  </Tooltip>
                )}
                {user.wechat && (
                  <Tag icon={<WechatOutlined />} color="green">
                    {user.wechat}
                  </Tag>
                )}
                {user.telegram && <Tag color="blue">@{user.telegram}</Tag>}
              </Space>

              {(user.tags?.length ?? 0) > 0 && (
                <Space wrap size={4}>
                  {user.tags!.map((t) => (
                    <Tag key={t} color="purple">
                      {t}
                    </Tag>
                  ))}
                </Space>
              )}
            </div>
          </Space>
        </Card>

        {/* Main Content */}
        <Row gutter={[20, 20]}>
          {/* Left column */}
          <Col xs={24} lg={16}>
            {/* Basic Info + GitHub Stats */}
            <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
              <Col xs={24} md={12}>
                <Card
                  title="基础信息"
                  size="small"
                  style={{ borderRadius: 12, height: "100%" }}
                  extra={
                    <Button
                      size="small"
                      icon={<ThunderboltOutlined />}
                      loading={generatingProfile}
                      onClick={handleGenerateProfile}
                      style={{ color: "#7c3aed", borderColor: "#7c3aed" }}
                    >
                      生成 AI 画像
                    </Button>
                  }
                >
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {user.web3insight_id && (
                      <div>
                        <Text type="secondary">Web3Insight ID：</Text>
                        <Text copyable>{user.web3insight_id}</Text>
                      </div>
                    )}
                    <div>
                      <Text type="secondary">加入时间：</Text>
                      <Text>
                        {(() => {
                          const d = user.first_joined_at || user.created_at || user.CreatedAt;
                          if (!d || d.startsWith("0001-")) return "—";
                          const date = new Date(d);
                          return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("zh-CN");
                        })()}
                      </Text>
                    </div>
                    {user.intro && (
                      <div>
                        <Text type="secondary">简介：</Text>
                        <Paragraph
                          style={{ margin: "4px 0 0" }}
                          ellipsis={{ rows: 3, expandable: true }}
                        >
                          {user.intro}
                        </Paragraph>
                      </div>
                    )}
                    {user.notes && !user.notes.includes("数据不足") && !user.notes.includes("待补充") ? (
                      <div>
                        <Text type="secondary">AI 画像：</Text>
                        <Paragraph
                          style={{ margin: "4px 0 0" }}
                          ellipsis={{ rows: 3, expandable: true }}
                        >
                          {user.notes}
                        </Paragraph>
                      </div>
                    ) : (
                      <div style={{ background: "#2d2147", borderRadius: 8, padding: "10px 12px" }}>
                        <Space size={6} align="start">
                          <span style={{ fontSize: 16 }}>🤖</span>
                          <div>
                            <Text style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600 }}>AI 画像待生成</Text>
                            <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 2 }}>
                              {user.github ? "GitHub 数据采集完成后自动生成" : "补充 GitHub 账号后可生成开发者画像"}
                            </Text>
                          </div>
                        </Space>
                      </div>
                    )}
                    {(user.existing_projects || user.projects_raw) && (
                      <div>
                        {user.projects_cleaned === false && user.projects_raw ? (
                          // AI extraction in progress
                          <div>
                            <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>已有项目：</Text>
                            <Text style={{ fontSize: 13, color: "#999", wordBreak: "break-all", display: "block" }}>
                              {user.projects_raw.slice(0, 100)}{user.projects_raw.length > 100 ? "…" : ""}
                            </Text>
                            <Space size={4} style={{ marginTop: 4 }}>
                              <SyncOutlined spin style={{ color: "#7c3aed", fontSize: 12 }} />
                              <Text type="secondary" style={{ fontSize: 12 }}>AI 提取中...</Text>
                            </Space>
                          </div>
                        ) : (() => {
                          const parts = parseProjects(user.existing_projects);
                          if (parts.length === 0) return null;
                          return (
                            <div>
                              <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>已有项目：</Text>
                              <Space wrap size={4}>
                                {parts.map((p) => (
                                  <Tag key={p} color="cyan" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {p.length > 24 ? p.slice(0, 24) + "…" : p}
                                  </Tag>
                                ))}
                              </Space>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </Space>
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card
                  title="GitHub / Web3Insight 数据"
                  size="small"
                  style={{ borderRadius: 12, height: "100%" }}
                  extra={
                    user.github ? (
                      <Button
                        size="small"
                        icon={<SyncOutlined spin={syncing} />}
                        loading={syncing}
                        onClick={handleSyncWeb3Insight}
                        style={{ color: "#7c3aed", borderColor: "#7c3aed" }}
                      >
                        同步
                      </Button>
                    ) : null
                  }
                >
                  {githubStats ? (
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {(githubStats.followers !== undefined || githubStats.public_repos !== undefined) && (
                        <Space size={16}>
                          {githubStats.followers !== undefined && (
                            <Text><Text type="secondary">关注者：</Text><Text strong>{githubStats.followers}</Text></Text>
                          )}
                          {githubStats.public_repos !== undefined && (
                            <Text><Text type="secondary">公开仓库：</Text><Text strong>{githubStats.public_repos}</Text></Text>
                          )}
                        </Space>
                      )}
                      {githubStats.location && (
                        <div><Text type="secondary">地区：</Text><Text>{githubStats.location}</Text></div>
                      )}
                      {githubStats.company && (
                        <div><Text type="secondary">公司：</Text><Text>{githubStats.company}</Text></div>
                      )}
                      {githubStats.bio && (
                        <div><Text type="secondary">简介：</Text><Text style={{ fontSize: 12 }}>{githubStats.bio}</Text></div>
                      )}
                      {githubStats.total_commits_7d !== undefined && (
                        <div>
                          <Text type="secondary">近7天提交：</Text>
                          <Text strong style={{ color: "#7c3aed" }}>
                            {githubStats.total_commits_7d}
                          </Text>
                        </div>
                      )}
                      {githubStats.total_commits_30d !== undefined && (
                        <div>
                          <Text type="secondary">近30天提交：</Text>
                          <Text strong>{githubStats.total_commits_30d}</Text>
                        </div>
                      )}
                      {activeReposList && activeReposList.length > 0 && (
                        <div>
                          <Text
                            type="secondary"
                            style={{ display: "block", marginBottom: 4 }}
                          >
                            活跃仓库：
                          </Text>
                          <Space wrap size={4}>
                            {activeReposList.map((r) => (
                              <Tag key={r} color="geekblue">
                                {r.split("/")[1] || r}
                              </Tag>
                            ))}
                          </Space>
                        </div>
                      )}
                      {githubStats.last_active_at && (
                        <div>
                          <Text type="secondary">最后活跃：</Text>
                          <Text>
                            {new Date(
                              githubStats.last_active_at
                            ).toLocaleDateString("zh-CN")}
                          </Text>
                        </div>
                      )}
                      {githubStats.score !== undefined && (
                        <div>
                          <Text type="secondary">综合评分：</Text>
                          <Text strong style={{ color: "#7c3aed" }}>
                            {githubStats.score}
                          </Text>
                        </div>
                      )}
                      {githubStats.rank !== undefined && (
                        <div>
                          <Text type="secondary">生态排名：</Text>
                          <Text strong>#{githubStats.rank}</Text>
                        </div>
                      )}
                      {githubStats.eco_contributions !== undefined && (
                        <div>
                          <Text type="secondary">生态贡献：</Text>
                          <Text strong>{githubStats.eco_contributions}</Text>
                        </div>
                      )}
                      {githubStats.total_commits !== undefined && (
                        <div>
                          <Text type="secondary">总提交数：</Text>
                          <Text strong>{githubStats.total_commits}</Text>
                        </div>
                      )}
                      {activeReposCount !== null && (
                        <div>
                          <Text type="secondary">活跃仓库数：</Text>
                          <Text strong>{activeReposCount}</Text>
                        </div>
                      )}
                      {githubStats.weekly_activity !== undefined && (
                        <div>
                          <Text type="secondary">周活跃度：</Text>
                          <Text strong>{githubStats.weekly_activity}</Text>
                        </div>
                      )}
                      {(githubStats.languages?.length ?? 0) > 0 && (
                        <div>
                          <Text
                            type="secondary"
                            style={{ display: "block", marginBottom: 4 }}
                          >
                            技术栈：
                          </Text>
                          <Space wrap size={4}>
                            {githubStats.languages!.slice(0, 8).map((lang) => (
                              <Tag key={lang} color="geekblue">
                                {lang}
                              </Tag>
                            ))}
                          </Space>
                        </div>
                      )}
                      {(githubStats.monad_commits ?? 0) > 0 && (
                        <div>
                          <Text type="secondary">Monad 生态贡献：</Text>
                          <Text strong style={{ color: "#7c3aed" }}>
                            {githubStats.monad_commits} commits
                          </Text>
                          <Tag color="purple" style={{ marginLeft: 8, fontSize: 11 }}>
                            OpenDevData
                          </Tag>
                        </div>
                      )}
                      {githubStats.is_chinese_dev && (
                        <div>
                          <Tag color="red" style={{ fontSize: 12 }}>🇨🇳 华语开发者</Tag>
                        </div>
                      )}
                    </Space>
                  ) : (
                    <div style={{ textAlign: "center", padding: "20px 0" }}>
                      <Text type="secondary">暂无数据，待采集</Text>
                      {user.github && (
                        <div style={{ marginTop: 12 }}>
                          <Button
                            size="small"
                            icon={<SyncOutlined />}
                            loading={syncing}
                            onClick={handleSyncWeb3Insight}
                            style={{ color: "#7c3aed", borderColor: "#7c3aed" }}
                          >
                            立即同步
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </Col>
            </Row>

            {/* Participated Projects */}
            {projects.length > 0 && (
              <Card
                title={`参与项目（${projects.length}）`}
                style={{ borderRadius: 12, marginBottom: 20 }}
              >
                <Row gutter={[12, 12]}>
                  {projects.map((p) => (
                    <Col xs={24} sm={12} md={8} key={p.ID}>
                      <Card size="small" style={{ borderRadius: 8 }}>
                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                          <Text strong>{p.name}</Text>
                          <Space wrap size={4}>
                            {p.award_level && (
                              <Tag color="gold">{p.award_level}</Tag>
                            )}
                            {p.score > 0 && (
                              <Tag color="blue">{p.score} 分</Tag>
                            )}
                          </Space>
                          {p.github && (
                            <a
                              href={
                                p.github.startsWith("http")
                                  ? p.github
                                  : `https://github.com/${p.github}`
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Tag
                                icon={<GithubOutlined />}
                                color="default"
                                style={{ fontSize: 11 }}
                              >
                                GitHub
                              </Tag>
                            </a>
                          )}
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Card>
            )}

            {/* Activity Records Timeline */}
            <Card
              title={`活动参与记录（${activity.length}）`}
              style={{ borderRadius: 12 }}
            >
              <Spin spinning={activityLoading}>
                {activity.length === 0 ? (
                  <Text type="secondary">暂无参与记录</Text>
                ) : (
                  <Timeline items={activityTimelineItems} />
                )}
              </Spin>
            </Card>
          </Col>

          {/* Right column — Operation Logs */}
          <Col xs={24} lg={8}>
            <Card
              title="运营记录"
              extra={
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
                  onClick={() => setLogModalOpen(true)}
                >
                  添加
                </Button>
              }
              style={{ borderRadius: 12 }}
            >
              <Spin spinning={logsLoading}>
                {logs.length === 0 ? (
                  <Text type="secondary">暂无运营记录</Text>
                ) : (
                  <List
                    dataSource={logs}
                    renderItem={(log) => (
                      <List.Item style={{ padding: "10px 0" }}>
                        <div style={{ width: "100%" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: 4,
                            }}
                          >
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {log.admin?.username ||
                                log.admin?.email ||
                                "管理员"}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {new Date(log.created_at).toLocaleDateString(
                                "zh-CN"
                              )}
                            </Text>
                          </div>
                          <Text>{log.content}</Text>
                          <Divider style={{ margin: "8px 0 0" }} />
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </Spin>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Add Log Modal */}
      <Modal
        title="添加运营记录"
        open={logModalOpen}
        onCancel={() => {
          setLogModalOpen(false);
          logForm.resetFields();
        }}
        onOk={() => logForm.submit()}
        confirmLoading={logSubmitting}
        okButtonProps={{
          style: { background: "#7c3aed", borderColor: "#7c3aed" },
        }}
      >
        <Form form={logForm} layout="vertical" onFinish={handleAddLog}>
          <Form.Item
            name="content"
            label="记录内容"
            rules={[{ required: true, message: "请输入记录内容" }]}
          >
            <Input.TextArea rows={4} placeholder="请输入运营记录内容..." />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
