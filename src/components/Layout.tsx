import { ReactNode } from "react";
import {
  Layout as AntLayout,
  Menu,
  Avatar,
  Button,
  Space,
  Typography,
  Spin,
  Tag,
} from "antd";
import {
  HomeOutlined,
  TeamOutlined,
  CalendarOutlined,
  FileTextOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/hooks/useAuth";

const { Sider, Header, Content } = AntLayout;
const { Text } = Typography;

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { user, token, loading, logout } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!token) {
    return null;
  }

  const isSuperAdmin = user?.role === "super_admin";

  const menuItems = [
    {
      key: "/",
      icon: <HomeOutlined />,
      label: <Link href="/">首页</Link>,
    },
    {
      key: "/developers",
      icon: <TeamOutlined />,
      label: <Link href="/developers">开发者名单</Link>,
    },
    {
      key: "/activities",
      icon: <CalendarOutlined />,
      label: <Link href="/activities">活动管理</Link>,
    },
    {
      key: "/operations",
      icon: <FileTextOutlined />,
      label: <Link href="/operations">运营记录</Link>,
    },
    ...(isSuperAdmin
      ? [
          {
            key: "/settings",
            icon: <SettingOutlined />,
            label: <Link href="/settings">设置</Link>,
          },
        ]
      : []),
  ];

  const roleLabel = isSuperAdmin ? "super_admin" : "admin";
  const roleColor = isSuperAdmin ? "gold" : "blue";

  // Match active menu key (handle sub-routes like /developers/123)
  const activeKey =
    router.pathname === "/"
      ? "/"
      : Object.keys({ "/developers": 1, "/activities": 1, "/operations": 1, "/settings": 1 }).find(
          (k) => router.pathname.startsWith(k)
        ) ?? router.pathname;

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <Sider
        width={220}
        style={{
          background: "#fff",
          borderRight: "1px solid #f0f0f0",
          overflow: "auto",
          height: "100vh",
          position: "sticky",
          top: 0,
          left: 0,
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Text strong style={{ fontSize: 15, color: "#7c3aed" }}>
            Monad DevInsight
          </Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems}
          style={{ border: "none", marginTop: 4 }}
        />
      </Sider>
      <AntLayout>
        <Header
          style={{
            background: "#fff",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            borderBottom: "1px solid #f0f0f0",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <Space size={12}>
            <Avatar
              size={32}
              icon={<UserOutlined />}
              src={user?.avatar || undefined}
            />
            <Text>{user?.username || user?.email}</Text>
            <Tag color={roleColor}>{roleLabel}</Tag>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={logout}
              size="small"
            >
              退出
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, background: "#f5f5f5", minHeight: "calc(100vh - 64px)" }}>
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
