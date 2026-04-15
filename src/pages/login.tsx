import { useState } from "react";
import { Form, Input, Button, Card, Typography, message } from "antd";
import { useRouter } from "next/router";
import { apiFetch } from "@/lib/api";

const { Title, Text } = Typography;

interface LoginForm {
  email: string;
  password: string;
}

interface LoginData {
  ID: number;
  email: string;
  username: string;
  avatar: string;
  role: string;
  permissions: string[];
  token: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [form] = Form.useForm<LoginForm>();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values: LoginForm) => {
    setLoading(true);
    try {
      const res = await apiFetch<LoginData>("/v1/login", {
        method: "POST",
        body: JSON.stringify(values),
      });

      if (res.code === 200) {
        localStorage.setItem("insight_token", res.data.token);
        localStorage.setItem(
          "insight_user",
          JSON.stringify({
            ID: res.data.ID,
            email: res.data.email,
            username: res.data.username,
            avatar: res.data.avatar,
            role: res.data.role,
            permissions: res.data.permissions,
          })
        );
        message.success("登录成功");
        router.push("/");
      } else {
        message.error(res.message || "登录失败");
      }
    } catch {
      message.error("登录失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-primary)",
      }}
    >
      <Card style={{ width: 400, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Title level={3} style={{ color: "var(--accent-purple)", margin: 0 }}>
            Monad DevInsight
          </Title>
          <Text type="secondary">登录管理后台</Text>
        </div>
        <Form form={form} onFinish={handleLogin} layout="vertical" size="large">
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "请输入有效的邮箱地址" },
            ]}
          >
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              style={{ background: "var(--accent-purple)", borderColor: "var(--accent-purple)" }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
