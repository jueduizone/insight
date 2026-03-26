import { useEffect, useState, useMemo } from "react";
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
} from "@ant-design/icons";
import Layout from "@/components/Layout";
import { apiFetch } from "@/lib/api";

const { Title, Text } = Typography;

interface User {
  ID: number;
  CreatedAt: string;
  UpdatedAt: string;
  email: string;
  username: string;
  intro: string;
  avatar: string;
  github: string;
  twitter: string;
  wallet_address: string;
  web3insight_id: string;
  tags: string[] | null;
  group: string;
  notes: string;
  role: string;
}

interface UserListData {
  users: User[];
  total: number;
  page: number;
  page_size: number;
}

export default function DevelopersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("All");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
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
        setUsers(res.data.users || []);
      } else {
        message.error(res.message || "获取用户列表失败");
      }
    } catch {
      message.error("获取用户列表失败");
    } finally {
      setLoading(false);
    }
  }

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

      return matchSearch && matchGroup && matchTag;
    });
  }, [users, search, selectedGroup, selectedTag]);

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
            href={`https://github.com/${github}`}
            target="_blank"
            rel="noreferrer"
          >
            {github}
          </a>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "钱包地址",
      dataIndex: "wallet_address",
      key: "wallet_address",
      render: (addr: string) =>
        addr ? (
          <Tooltip title={addr}>
            <Text style={{ fontSize: 12 }}>
              {addr.slice(0, 6)}…{addr.slice(-4)}
            </Text>
          </Tooltip>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "标签",
      dataIndex: "tags",
      key: "tags",
      render: (tags: string[] | null) => (
        <Space wrap size={4}>
          {(tags || []).map((t) => (
            <Tag key={t} color="purple" style={{ fontSize: 12 }}>
              {t}
            </Tag>
          ))}
        </Space>
      ),
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
      width: 90,
      render: () => <Text type="secondary">—</Text>,
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
              onClick={() => message.info(`用户 ID: ${record.ID}`)}
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
                setLogUserId(record.ID);
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
              icon={<UploadOutlined />}
              onClick={() => message.info("CSV 导入功能开发中")}
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
          <Input
            placeholder="搜索姓名 / 邮箱 / GitHub"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            style={{ width: 300, marginBottom: 12 }}
            allowClear
          />
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
    </Layout>
  );
}
