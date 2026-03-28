import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import {
  Table,
  Input,
  Tag,
  Avatar,
  Space,
  Button,
  Typography,
  message,
  Modal,
  Form,
  Tooltip,
  Upload,
  Select,
  Card,
  Result,
  Divider,
  Badge,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  SearchOutlined,
  PlusOutlined,
  UploadOutlined,
  UserOutlined,
  EyeOutlined,
  EditOutlined,
  FileAddOutlined,
  InboxOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  DownloadOutlined,
  GithubOutlined,
  TwitterOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import Layout from "@/components/Layout";
import { apiFetch, API_BASE } from "@/lib/api";

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

interface User {
  id: number;
  ID?: number; // legacy alias
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
  projects_raw?: string;
  projects_cleaned?: boolean;
  web3insight_id: string;
  tags: string[] | null;
  group: string;
  notes: string;
  role: string;
  activity_score: number;
  first_joined_at?: string;
}

interface UserListData {
  users: User[];
  total: number;
  page: number;
  page_size: number;
}

interface ActivityEvent {
  id: number;
  name: string;
  type: string;
  platform: string;
  start_date: string;
}

interface EventsData {
  events: ActivityEvent[];
  total: number;
}

interface PreviewData {
  columns: string[];
  rows: string[][];
}

interface ImportResult {
  created: number;
  merged: number;
  web3insight_triggered?: boolean;
}

const SYSTEM_FIELDS = [
  "email",
  "last_name",
  "first_name",
  "github",
  "wallet_address",
  "wechat",
  "telegram",
  "existing_projects",
  "intro",
  "monad_experience",
  "joined_at",
  "award",
  "role",
  "status",
] as const;

const FIELD_LABELS: Record<string, string> = {
  email: "邮箱",
  last_name: "姓",
  first_name: "名",
  github: "GitHub",
  wallet_address: "钱包地址",
  wechat: "微信",
  telegram: "Telegram",
  existing_projects: "已有项目",
  intro: "描述",
  monad_experience: "Monad 经验",
  joined_at: "首次加入时间",
  award: "获奖情况",
  role: "角色",
  status: "参与状态",
};

type ImportStep = "upload" | "preview" | "result";
type GithubFilter = "all" | "has" | "none";

export default function DevelopersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("All");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [githubFilter, setGithubFilter] = useState<GithubFilter>("all");
  const [activityRange, setActivityRange] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Create developer modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

  // Add operation log modal
  const [logOpen, setLogOpen] = useState(false);
  const [logUserId, setLogUserId] = useState<number | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logForm] = Form.useForm();

  // CSV import modal
  const [importOpen, setImportOpen] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null);
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [aiMatching, setAiMatching] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await apiFetch<UserListData>(
        "/v1/users?page=1&page_size=500"
      );
      if (res.code === 200) {
        setUsers(res.data?.users || []);
      } else {
        message.error(res.message || "获取用户列表失败");
      }
    } catch {
      message.error("获取用户列表失败");
    } finally {
      setLoading(false);
    }
  }

  async function fetchEvents() {
    setEventsLoading(true);
    try {
      const res = await apiFetch<EventsData>("/v1/events?page=1&page_size=200");
      if (res.code === 200) {
        setEvents(res.data.events || []);
      }
    } catch {
      // ignore
    } finally {
      setEventsLoading(false);
    }
  }

  const openImportModal = () => {
    setImportStep("upload");
    setSelectedEvent(null);
    setCsvFile(null);
    setPreviewData(null);
    setFieldMapping({});
    setImportResult(null);
    setAiMatching(false);
    setImportOpen(true);
    fetchEvents();
  };

  const closeImport = () => {
    setImportOpen(false);
  };

  const handlePreview = async (file: File) => {
    if (!selectedEvent) {
      message.warning("请先选择活动");
      return;
    }
    setCsvFile(file);
    setUploading(true);

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("insight_token")
        : null;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", "preview");

    try {
      const response = await fetch(
        `${API_BASE}/v1/events/${selectedEvent.id}/import`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
          body: formData,
        }
      );
      const result = (await response.json()) as {
        code: number;
        message: string;
        data: PreviewData;
      };

      if (result.code === 200) {
        setPreviewData(result.data);
        setFieldMapping({});
        setImportStep("preview");
        suggestMapping(result.data.columns);
      } else {
        message.error(result.message || "解析 CSV 失败");
      }
    } catch {
      message.error("解析 CSV 失败");
    } finally {
      setUploading(false);
    }
  };

  const suggestMapping = async (columns: string[]) => {
    setAiMatching(true);
    try {
      const res = await apiFetch<Record<string, string>>("/v1/suggest-mapping", {
        method: "POST",
        body: JSON.stringify({ columns }),
      });
      if (res.code === 200 && res.data) {
        setFieldMapping(res.data);
      }
    } catch {
      // silently degrade — user can map manually
    } finally {
      setAiMatching(false);
    }
  };

  const handleImport = async () => {
    if (!selectedEvent || !csvFile) return;
    setImporting(true);

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("insight_token")
        : null;

    const formData = new FormData();
    formData.append("file", csvFile);
    formData.append("mode", "import");
    formData.append("field_mapping", JSON.stringify(fieldMapping));

    try {
      const response = await fetch(
        `${API_BASE}/v1/events/${selectedEvent.id}/import`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
          body: formData,
        }
      );
      const result = (await response.json()) as {
        code: number;
        message: string;
        data: ImportResult;
      };

      if (result.code === 200) {
        setImportResult(result.data);
        setImportStep("result");
        fetchUsers();
      } else {
        message.error(result.message || "导入失败");
      }
    } catch {
      message.error("导入失败");
    } finally {
      setImporting(false);
    }
  };

  // Derived: unique groups
  const groups = useMemo(() => {
    const set = new Set(users.map((u) => u.group).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [users]);

  // Derived: unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => (u.tags || []).forEach((t) => set.add(t)));
    return Array.from(set);
  }, [users]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !q ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.github?.toLowerCase().includes(q);

      const matchGroup =
        selectedGroup === "All" || u.group === selectedGroup;

      const matchTag =
        !selectedTag || (u.tags || []).includes(selectedTag);

      const matchGithub =
        githubFilter === "all" ||
        (githubFilter === "has" && !!u.github) ||
        (githubFilter === "none" && !u.github);

      const score = u.activity_score || 0;
      const matchActivity =
        activityRange === "all" ||
        (activityRange === "0" && score === 0) ||
        (activityRange === "1-30" && score >= 1 && score <= 30) ||
        (activityRange === "31-60" && score >= 31 && score <= 60) ||
        (activityRange === "61+" && score > 60);

      return matchSearch && matchGroup && matchTag && matchGithub && matchActivity;
    });
  }, [users, search, selectedGroup, selectedTag, githubFilter, activityRange]);

  const handleCreate = async (values: {
    email: string;
    username: string;
    avatar?: string;
    github?: string;
    twitter?: string;
  }) => {
    setCreateLoading(true);
    try {
      const res = await apiFetch("/v1/users", {
        method: "POST",
        body: JSON.stringify(values),
      });
      if (res.code === 200 || res.code === 201) {
        message.success("创建成功");
        setCreateOpen(false);
        createForm.resetFields();
        fetchUsers();
      } else {
        message.error(res.message || "创建失败");
      }
    } catch {
      message.error("创建失败");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleAddLog = async (values: { content: string }) => {
    if (!logUserId) return;
    setLogLoading(true);
    try {
      const res = await apiFetch("/v1/operation-logs", {
        method: "POST",
        body: JSON.stringify({
          target_type: "user",
          target_id: logUserId,
          content: values.content,
        }),
      });
      if (res.code === 200 || res.code === 201) {
        message.success("运营记录已添加");
        setLogOpen(false);
        logForm.resetFields();
      } else {
        message.error(res.message || "添加失败");
      }
    } catch {
      message.error("添加失败");
    } finally {
      setLogLoading(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ["姓名", "邮箱", "GitHub", "Twitter", "Telegram", "活跃度", "标签", "分组"];
    const rows = filteredUsers.map((u) => [
      u.username || "",
      u.email || "",
      u.github || "",
      u.twitter || "",
      u.telegram || u.wechat || "",
      String(u.activity_score || 0),
      (u.tags || []).join("|"),
      u.group || "",
    ]);
    const content = [headers, ...rows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `developers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Preview table
  const previewTableData = (previewData?.rows ?? []).map((row, idx) => {
    const obj: Record<string, string> & { _key: string } = { _key: String(idx) };
    (previewData?.columns ?? []).forEach((col, i) => {
      obj[`col_${i}`] = row[i] ?? "";
    });
    return obj;
  });

  const previewColumns: ColumnsType<Record<string, string>> = (
    previewData?.columns ?? []
  ).map((col, i) => ({
    title: col,
    dataIndex: `col_${i}`,
    key: `col_${i}`,
    ellipsis: true,
    width: 140,
  }));

  const importFooter = () => {
    if (importStep === "upload") {
      return [
        <Button key="cancel" onClick={closeImport}>
          取消
        </Button>,
      ];
    }
    if (importStep === "preview") {
      return [
        <Button key="back" onClick={() => setImportStep("upload")}>
          重新选择文件
        </Button>,
        <Button key="cancel" onClick={closeImport}>
          取消
        </Button>,
        <Button
          key="import"
          type="primary"
          loading={importing}
          style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
          onClick={handleImport}
        >
          开始导入
        </Button>,
      ];
    }
    return [
      <Button
        key="close"
        type="primary"
        style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
        onClick={closeImport}
      >
        完成
      </Button>,
    ];
  };

  const columns: ColumnsType<User> = [
    {
      title: "头像",
      dataIndex: "avatar",
      key: "avatar",
      width: 64,
      render: (avatar: string) => (
        <Avatar size={40} icon={<UserOutlined />} src={avatar || undefined} />
      ),
    },
    {
      title: "姓名",
      dataIndex: "username",
      key: "username",
      render: (username: string, record: User) => (
        <div>
          <Text strong>{username || "—"}</Text>
          {record.intro && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.intro.slice(0, 40)}
                {record.intro.length > 40 ? "…" : ""}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "邮箱",
      dataIndex: "email",
      key: "email",
      render: (email: string) => <Text>{email || "—"}</Text>,
    },
    {
      title: "GitHub",
      dataIndex: "github",
      key: "github",
      render: (github: string) =>
        github ? (
          <a
            href={github.startsWith("http") ? github : `https://github.com/${github}`}
            target="_blank"
            rel="noreferrer"
          >
            {github.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
          </a>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "联系方式",
      key: "contact",
      width: 110,
      render: (_: unknown, record: User) => (
        <Space size={10}>
          <Tooltip title={record.github ? `GitHub: ${record.github}` : "无 GitHub"}>
            <GithubOutlined
              style={{
                color: record.github ? "#22c55e" : "#d1d5db",
                fontSize: 16,
              }}
            />
          </Tooltip>
          <Tooltip title={record.twitter ? `Twitter: @${record.twitter}` : "无 Twitter"}>
            <TwitterOutlined
              style={{
                color: record.twitter ? "#22c55e" : "#d1d5db",
                fontSize: 16,
              }}
            />
          </Tooltip>
          <Tooltip
            title={
              record.telegram || record.wechat
                ? `IM: ${record.telegram || record.wechat}`
                : "无即时通讯"
            }
          >
            <MessageOutlined
              style={{
                color: record.telegram || record.wechat ? "#22c55e" : "#d1d5db",
                fontSize: 16,
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      width: 150,
      render: (tags: string[] | null) => (
        <Space wrap size={4}>
          {(tags || []).slice(0, 3).map((t) => (
            <Tag key={t} color="purple" style={{ fontSize: 12 }}>
              {t}
            </Tag>
          ))}
          {(tags || []).length > 3 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              +{(tags || []).length - 3}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "已有项目",
      key: "existing_projects",
      width: 200,
      render: (_: unknown, record: User) => {
        if (record.projects_cleaned === false && record.projects_raw) {
          return (
            <Space size={4}>
              <SyncOutlined spin style={{ color: "#7c3aed", fontSize: 12 }} />
              <Tooltip title={record.projects_raw}>
                <Text style={{ fontSize: 12 }}>
                  {record.projects_raw.slice(0, 25)}…
                </Text>
              </Tooltip>
            </Space>
          );
        }
        const val = record.existing_projects;
        if (!val) return <Text type="secondary">—</Text>;
        const projects = val.split(",").map((s) => s.trim()).filter(Boolean);
        return (
          <Space wrap size={4}>
            {projects.slice(0, 3).map((p) => (
              <Tag
                key={p}
                color="cyan"
                style={{
                  fontSize: 12,
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.length > 15 ? p.slice(0, 15) + "…" : p}
              </Tag>
            ))}
            {projects.length > 3 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                +{projects.length - 3}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: "分组",
      dataIndex: "group",
      key: "group",
      render: (group: string) =>
        group ? <Tag color="blue">{group}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "活跃度分",
      key: "activity",
      width: 100,
      sorter: (a: User, b: User) => (a.activity_score || 0) - (b.activity_score || 0),
      render: (_: unknown, record: User) => {
        const score = record.activity_score || 0;
        if (score === 0) {
          return <Badge status="default" text="0" />;
        }
        const status: "processing" | "warning" | "success" =
          score >= 61 ? "success" : score >= 31 ? "warning" : "processing";
        return <Badge status={status} text={String(score)} />;
      },
    },
    {
      title: "首次加入",
      key: "first_joined_at",
      width: 110,
      sorter: (a: User, b: User) => {
        if (!a.first_joined_at) return 1;
        if (!b.first_joined_at) return -1;
        return new Date(a.first_joined_at).getTime() - new Date(b.first_joined_at).getTime();
      },
      render: (_: unknown, record: User) => {
        if (!record.first_joined_at || record.first_joined_at.startsWith("0001-")) return <Text type="secondary">—</Text>;
        return <Text style={{ fontSize: 12 }}>{record.first_joined_at.slice(0, 10)}</Text>;
      },
    },
    {
      title: "操作",
      key: "action",
      width: 160,
      fixed: "right" as const,
      render: (_: unknown, record: User) => (
        <Space size={4}>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => router.push(`/developers/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => message.info("编辑功能开发中")}
            />
          </Tooltip>
          <Tooltip title="添加运营记录">
            <Button
              type="text"
              size="small"
              icon={<FileAddOutlined />}
              onClick={() => {
                setLogUserId(record.id);
                setLogOpen(true);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

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
          <Title level={4} style={{ margin: 0 }}>
            开发者名单
          </Title>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
            >
              导出 CSV
            </Button>
            <Button
              icon={<UploadOutlined />}
              onClick={openImportModal}
            >
              导入 CSV
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
              onClick={() => setCreateOpen(true)}
            >
              新增开发者
            </Button>
          </Space>
        </div>

        {/* Search & filter */}
        <div style={{ marginBottom: 16 }}>
          <Space wrap style={{ marginBottom: 12 }}>
            <Input
              placeholder="搜索姓名 / 邮箱 / GitHub"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: 280 }}
              allowClear
            />
            <Select
              value={githubFilter}
              onChange={(val: GithubFilter) => {
                setGithubFilter(val);
                setCurrentPage(1);
              }}
              style={{ width: 140 }}
            >
              <Option value="all">全部 GitHub</Option>
              <Option value="has">有 GitHub</Option>
              <Option value="none">无 GitHub</Option>
            </Select>
            <Select
              value={activityRange}
              onChange={(val: string) => {
                setActivityRange(val);
                setCurrentPage(1);
              }}
              style={{ width: 160 }}
            >
              <Option value="all">全部活跃度</Option>
              <Option value="0">未活跃 (0)</Option>
              <Option value="1-30">低活跃 (1-30)</Option>
              <Option value="31-60">中活跃 (31-60)</Option>
              <Option value="61+">高活跃 (61+)</Option>
            </Select>
          </Space>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ marginRight: 8 }}>
              分组：
            </Text>
            <Space wrap>
              {groups.map((g) => (
                <Tag
                  key={g}
                  color={selectedGroup === g ? "purple" : "default"}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setSelectedGroup(g);
                    setCurrentPage(1);
                  }}
                >
                  {g}
                </Tag>
              ))}
            </Space>
          </div>
          {allTags.length > 0 && (
            <div>
              <Text type="secondary" style={{ marginRight: 8 }}>
                标签：
              </Text>
              <Space wrap>
                <Tag
                  color={!selectedTag ? "purple" : "default"}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setSelectedTag(null);
                    setCurrentPage(1);
                  }}
                >
                  All
                </Tag>
                {allTags.map((t) => (
                  <Tag
                    key={t}
                    color={selectedTag === t ? "purple" : "default"}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setSelectedTag(t);
                      setCurrentPage(1);
                    }}
                  >
                    {t}
                  </Tag>
                ))}
              </Space>
            </div>
          )}
        </div>

        {/* Table */}
        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="ID"
          loading={loading}
          scroll={{ x: "max-content" }}
          pagination={{
            current: currentPage,
            pageSize: 20,
            total: filteredUsers.length,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page) => setCurrentPage(page),
          }}
        />
      </div>

      {/* Create developer modal */}
      <Modal
        title="新增开发者"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
        okButtonProps={{ style: { background: "#7c3aed", borderColor: "#7c3aed" } }}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "请输入有效邮箱" },
            ]}
          >
            <Input placeholder="developer@example.com" />
          </Form.Item>
          <Form.Item
            name="username"
            label="姓名"
            rules={[{ required: true, message: "请输入姓名" }]}
          >
            <Input placeholder="开发者姓名" />
          </Form.Item>
          <Form.Item name="github" label="GitHub">
            <Input placeholder="GitHub 用户名" />
          </Form.Item>
          <Form.Item name="twitter" label="Twitter">
            <Input placeholder="Twitter 用户名" />
          </Form.Item>
          <Form.Item name="avatar" label="头像 URL">
            <Input placeholder="https://..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add operation log modal */}
      <Modal
        title="添加运营记录"
        open={logOpen}
        onCancel={() => {
          setLogOpen(false);
          logForm.resetFields();
        }}
        onOk={() => logForm.submit()}
        confirmLoading={logLoading}
        okButtonProps={{ style: { background: "#7c3aed", borderColor: "#7c3aed" } }}
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

      {/* CSV Import Modal */}
      <Modal
        title={
          <Space>
            <CalendarOutlined />
            <span>
              {importStep === "result"
                ? "导入完成"
                : "导入 CSV — 开发者名单"}
            </span>
          </Space>
        }
        open={importOpen}
        onCancel={closeImport}
        footer={importFooter()}
        width={importStep === "preview" ? 900 : 520}
        destroyOnClose
      >
        {/* Step 1: Select event + Upload */}
        {importStep === "upload" && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                请先选择关联活动，再上传 CSV 文件：
              </Text>
              <Select
                placeholder="选择活动"
                loading={eventsLoading}
                value={selectedEvent?.id ?? undefined}
                onChange={(val: number) => {
                  const ev = events.find((e) => e.id === val) ?? null;
                  setSelectedEvent(ev);
                }}
                style={{ width: "100%" }}
                showSearch
                optionFilterProp="children"
              >
                {events.map((ev) => (
                  <Option key={ev.id} value={ev.id}>
                    {ev.name}
                    {ev.type && (
                      <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        [{ev.type}]
                      </Text>
                    )}
                  </Option>
                ))}
              </Select>
            </div>
            <Dragger
              accept=".csv"
              multiple={false}
              showUploadList={false}
              beforeUpload={(file) => {
                handlePreview(file);
                return false;
              }}
              disabled={uploading || !selectedEvent}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined
                  style={{
                    color: selectedEvent ? "#7c3aed" : "#d9d9d9",
                    fontSize: 48,
                  }}
                />
              </p>
              <p className="ant-upload-text">
                {selectedEvent ? "点击或拖拽 CSV 文件到此区域" : "请先选择活动"}
              </p>
              <p className="ant-upload-hint">
                {uploading ? "正在解析..." : "仅支持 .csv 格式，最大 10MB"}
              </p>
            </Dragger>
          </div>
        )}

        {/* Step 2: Preview + Field Mapping */}
        {importStep === "preview" && previewData && (
          <div>
            <Text strong>数据预览（前 {previewData.rows.length} 行）</Text>
            <Table
              columns={previewColumns}
              dataSource={previewTableData}
              rowKey="_key"
              pagination={false}
              size="small"
              scroll={{ x: "max-content" }}
              style={{ marginTop: 8, marginBottom: 20 }}
            />

            <Divider />

            <Text strong>字段映射配置</Text>
            <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
              {aiMatching ? "AI 智能匹配中..." : "已由 AI 自动匹配，可手动调整"}
            </Text>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px 24px",
              }}
            >
              {SYSTEM_FIELDS.map((field) => (
                <Card key={field} size="small" style={{ background: "#fafafa", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Text style={{ width: 90, flexShrink: 0 }}>
                      {FIELD_LABELS[field]}
                    </Text>
                    <Select
                      value={fieldMapping[field] ?? undefined}
                      onChange={(val: string) =>
                        setFieldMapping((prev) => ({ ...prev, [field]: val }))
                      }
                      onClear={() =>
                        setFieldMapping((prev) => {
                          const next = { ...prev };
                          delete next[field];
                          return next;
                        })
                      }
                      placeholder="选择 CSV 列"
                      allowClear
                      style={{ flex: 1, minWidth: 0, maxWidth: "100%" }}
                      popupMatchSelectWidth={false}
                      size="small"
                    >
                      {previewData.columns.map((col) => (
                        <Option key={col} value={col}>
                          {col}
                        </Option>
                      ))}
                    </Select>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {importStep === "result" && importResult && (
          <Result
            icon={<CheckCircleOutlined style={{ color: "#7c3aed" }} />}
            title="导入成功"
            subTitle={
              <Space direction="vertical">
                <Text>
                  新建开发者：<Text strong>{importResult.created}</Text> 人
                </Text>
                <Text>
                  合并已有记录：<Text strong>{importResult.merged}</Text> 条
                </Text>
                {importResult.web3insight_triggered && (
                  <Text type="secondary">
                    已触发 Web3Insight 数据分析，稍后可在开发者详情中查看
                  </Text>
                )}
              </Space>
            }
          />
        )}
      </Modal>
    </Layout>
  );
}
