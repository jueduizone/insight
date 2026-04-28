import { useEffect, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Input,
  Space,
  Typography,
  Tag,
  message,
  Form,
  Tabs,
  Descriptions,
  Divider,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, KeyOutlined } from "@ant-design/icons";
import Layout from "@/components/Layout";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const { Title, Text } = Typography;

interface AdminUser {
  id: number;
  created_at: string;
  email: string;
  username: string;
  role: string;
}

interface UsersData {
  users: AdminUser[];
  total: number;
}

interface CreateAdminFormValues {
  email: string;
  username: string;
  password: string;
}

interface ChangePasswordFormValues {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  // Tab1: admin management
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminsTotal, setAdminsTotal] = useState(0);
  const [adminsPage, setAdminsPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm<CreateAdminFormValues>();

  // Tab2: personal settings
  const [pwLoading, setPwLoading] = useState(false);
  const [pwForm] = Form.useForm<ChangePasswordFormValues>();

  const fetchAdmins = async (page: number) => {
    setAdminsLoading(true);
    try {
      const res = await apiFetch<UsersData>(
        `/v1/users?roles=admin,super_admin&page=${page}&page_size=20&sort_by=created_at&order=asc`
      );
      if (res.code === 200) {
        setAdmins(res.data.users || []);
        setAdminsTotal(res.data.total);
      } else {
        message.error(res.message || "获取用户列表失败");
      }
    } catch {
      message.error("获取用户列表失败");
    } finally {
      setAdminsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins(adminsPage);
  }, [adminsPage]);

  const handleCreateAdmin = async (values: CreateAdminFormValues) => {
    setCreateLoading(true);
    try {
      const res = await apiFetch("/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          username: values.username,
          password: values.password,
        }),
      });
      if (res.code === 200 || res.code === 201) {
        message.success("管理员创建成功");
        setCreateOpen(false);
        createForm.resetFields();
        fetchAdmins(1);
        setAdminsPage(1);
      } else {
        message.error(res.message || "创建失败");
      }
    } catch {
      message.error("创建失败");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleChangePassword = async (values: ChangePasswordFormValues) => {
    if (values.new_password !== values.confirm_password) {
      message.error("两次输入的新密码不一致");
      return;
    }
    setPwLoading(true);
    try {
      const res = await apiFetch("/v1/users/me/password", {
        method: "PUT",
        body: JSON.stringify({
          old_password: values.old_password,
          new_password: values.new_password,
        }),
      });
      if (res.code === 200) {
        message.success("密码修改成功");
        pwForm.resetFields();
      } else {
        message.error(res.message || "修改失败");
      }
    } catch {
      message.error("修改失败");
    } finally {
      setPwLoading(false);
    }
  };

  const adminColumns: ColumnsType<AdminUser> = [
    {
      title: "邮箱",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "用户名",
      dataIndex: "username",
      key: "username",
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      render: (role: string) => (
        <Tag color={role === "super_admin" ? "gold" : "blue"}>{role}</Tag>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      render: (d: string) => new Date(d).toLocaleDateString("zh-CN"),
    },
  ];

  const tab1Content = (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        {isSuperAdmin && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            style={{ background: "var(--accent-purple)", borderColor: "var(--accent-purple)" }}
            onClick={() => setCreateOpen(true)}
          >
            新建管理员
          </Button>
        )}
      </div>
      <Table
        columns={adminColumns}
        dataSource={admins}
        rowKey="id"
        loading={adminsLoading}
        pagination={{
          current: adminsPage,
          pageSize: 20,
          total: adminsTotal,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page) => setAdminsPage(page),
        }}
      />
    </div>
  );

  const tab2Content = (
    <div style={{ maxWidth: 480 }}>
      <Title level={5}>当前账号信息</Title>
      <Descriptions column={1} size="small" bordered style={{ marginBottom: 24 }}>
        <Descriptions.Item label="邮箱">{user?.email || "—"}</Descriptions.Item>
        <Descriptions.Item label="用户名">{user?.username || "—"}</Descriptions.Item>
        <Descriptions.Item label="角色">
          <Tag color={isSuperAdmin ? "gold" : "blue"}>
            {user?.role || "—"}
          </Tag>
        </Descriptions.Item>
      </Descriptions>

      <Divider />

      <Title level={5} style={{ marginBottom: 16 }}>
        <Space>
          <KeyOutlined />
          修改密码
        </Space>
      </Title>
      <Form
        form={pwForm}
        layout="vertical"
        onFinish={handleChangePassword}
        style={{ maxWidth: 400 }}
      >
        <Form.Item
          name="old_password"
          label="当前密码"
          rules={[{ required: true, message: "请输入当前密码" }]}
        >
          <Input.Password placeholder="输入当前密码" />
        </Form.Item>
        <Form.Item
          name="new_password"
          label="新密码"
          rules={[
            { required: true, message: "请输入新密码" },
            { min: 6, message: "密码至少 6 位" },
          ]}
        >
          <Input.Password placeholder="输入新密码（至少6位）" />
        </Form.Item>
        <Form.Item
          name="confirm_password"
          label="确认新密码"
          rules={[{ required: true, message: "请再次输入新密码" }]}
        >
          <Input.Password placeholder="再次输入新密码" />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={pwLoading}
            style={{ background: "var(--accent-purple)", borderColor: "var(--accent-purple)" }}
          >
            修改密码
          </Button>
        </Form.Item>
      </Form>
    </div>
  );

  const tabItems = [
    {
      key: "accounts",
      label: "账号管理",
      children: tab1Content,
    },
    {
      key: "personal",
      label: "个人设置",
      children: tab2Content,
    },
  ];

  return (
    <Layout>
      <div>
        <Title level={4} style={{ marginBottom: 20 }}>
          系统设置
        </Title>
        <Tabs defaultActiveKey="accounts" items={tabItems} />
      </div>

      <Modal
        title="新建管理员"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createLoading}
        okButtonProps={{
          style: { background: "var(--accent-purple)", borderColor: "var(--accent-purple)" },
        }}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateAdmin}>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "请输入有效邮箱" },
            ]}
          >
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 6, message: "密码至少 6 位" },
            ]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
