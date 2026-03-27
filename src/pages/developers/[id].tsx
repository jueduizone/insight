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
  Table,
  List,
  Form,
  Input,
  Modal,
  Tooltip,
  Divider,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeftOutlined,
  GithubOutlined,
  UserOutlined,
  PlusOutlined,
  SyncOutlined,
  TwitterOutlined,
  WalletOutlined,
  WechatOutlined,
} from "@ant-design/icons";
import Layout from "@/components/Layout";
import { apiFetch } from "@/lib/api";

const { Title, Text, Paragraph } = Typography;

interface UserDetail {
  ID: number;
  CreatedAt: string;
  UpdatedAt: string;
  email: string;
  username: string;
  intro: string;
  avatar: string;
  github: string;
  twitter: string;
  wechat?: string;
  telegram?: string;
  existing_projects?: string;
  wallet_address: string;
  web3insight_id: string;
  tags: string[] | null;
  group: string;
  github_stats: string | null;
  twitter_stats: string | null;
  notes: string;
  role: string;
}

interface GithubStats {
  total_commits?: number;
  active_repos?: number;
  languages?: string[];
  weekly_activity?: number;
  score?: number;
  rank?: number;
  eco_contributions?: number;
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
  event?: ActivityEvent;
}

interface OperationLog {
  id: number;
  created_at: string;
  content: string;
  admin?: { username: string; email: string };
}

function parseGithubStats(raw: string | null): GithubStats | null {
  if (!raw) return null;
  try {
    const decoded = atob(raw);
    return JSON.parse(decoded) as GithubStats;
  } catch {
    return null;
  }
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

  const [syncing, setSyncing] = useState(false);

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
      if (res.code === 200) setUser(res.data);
      else message.error(res.message || "获取用户信息失败");
    } catch {
      message.error("获取用户信息失败");
    } finally {
      setLoading(false);
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
        // Re-fetch user so github_stats reflects the newly saved data
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

  const activityColumns: ColumnsType<ActivityRecord> = [
    {
      title: "活动名称",
      key: "event_name",
      render: (_: unknown, r: ActivityRecord) => (
        <Text>{r.event?.name ?? `活动 #${r.event_id}`}</Text>
      ),
    },
    {
      title: "类型",
      key: "event_type",
      render: (_: unknown, r: ActivityRecord) =>
        r.event?.type ? (
          <Tag color="purple">{r.event.type}</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "平台",
      key: "platform",
      render: (_: unknown, r: ActivityRecord) =>
        r.event?.platform ? (
          <Tag color="blue">{r.event.platform}</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      render: (role: string) => role || <Text type="secondary">—</Text>,
    },
    {
      title: "获奖情况",
      dataIndex: "award",
      key: "award",
      render: (award: string) =>
        award ? (
          <Tag color="gold">{award}</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: string) =>
        status ? <Tag color="green">{status}</Tag> : <Text type="secondary">—</Text>,
    },
  ];

  const githubStats = user ? parseGithubStats(user.github_stats) : null;

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
              </Space>
              <Text type="secondary" style={{ display: "block", marginBottom: 10 }}>
                {user.email}
              </Text>

              <Space wrap size={8} style={{ marginBottom: 10 }}>
                {user.github && (
                  <a
                    href={`https://github.com/${user.github}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Tag icon={<GithubOutlined />} color="default">
                      {user.github}
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
                {user.telegram && (
                  <Tag color="blue">@{user.telegram}</Tag>
                )}
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
                        {new Date(user.CreatedAt).toLocaleDateString("zh-CN")}
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
                    {user.notes && (
                      <div>
                        <Text type="secondary">备注：</Text>
                        <Paragraph
                          style={{ margin: "4px 0 0" }}
                          ellipsis={{ rows: 3, expandable: true }}
                        >
                          {user.notes}
                        </Paragraph>
                      </div>
                    )}
                    {user.existing_projects && (
                      <div>
                        <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                          已有项目：
                        </Text>
                        <Space wrap size={4}>
                          {user.existing_projects
                            .split(",")
                            .map((p) => p.trim())
                            .filter(Boolean)
                            .map((p) => (
                              <Tag key={p} color="cyan">
                                {p}
                              </Tag>
                            ))}
                        </Space>
                      </div>
                    )}
                  </Space>
                </Card>
              </Col>

              <Col xs={24} md={12}>
                <Card
                  title="Web3Insight 数据"
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
                      {githubStats.active_repos !== undefined && (
                        <div>
                          <Text type="secondary">活跃仓库：</Text>
                          <Text strong>{githubStats.active_repos}</Text>
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
                            编程语言：
                          </Text>
                          <Space wrap size={4}>
                            {githubStats.languages!.map((lang) => (
                              <Tag key={lang} color="geekblue">
                                {lang}
                              </Tag>
                            ))}
                          </Space>
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

            {/* Activity Records */}
            <Card
              title={`活动参与记录（${activity.length}）`}
              style={{ borderRadius: 12 }}
            >
              <Table
                columns={activityColumns}
                dataSource={activity}
                rowKey="id"
                loading={activityLoading}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                size="small"
                locale={{ emptyText: "暂无参与记录" }}
              />
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
                              {log.admin?.username || log.admin?.email || "管理员"}
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
