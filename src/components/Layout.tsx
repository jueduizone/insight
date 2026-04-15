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
  AppstoreOutlined,
  UploadOutlined,
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
      key: "/projects-group",
      icon: <AppstoreOutlined />,
      label: "项目管理",
      children: [
        {
          key: "/projects",
          label: <Link href="/projects">项目列表</Link>,
        },
        {
          key: "/projects/hackathon",
          icon: <UploadOutlined />,
          label: <Link href="/projects/hackathon">Hackathon 导入</Link>,
        },
      ],
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

  // Match active menu key (more specific paths first)
  const activeKey =
    router.pathname === "/"
      ? "/"
      : [
          "/projects/hackathon",
          "/projects",
          "/developers",
          "/activities",
          "/operations",
          "/settings",
        ].find((k) => router.pathname.startsWith(k)) ?? router.pathname;

  return (
    <AntLayout style={{ minHeight: "100vh", background: "#0f0a1e" }}>
      <Sider
        width={220}
        style={{
          background: "#0f0a1e",
          borderRight: "1px solid #362d59",
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
            borderBottom: "1px solid #362d59",
          }}
        >
          <Text strong style={{ fontSize: 15, color: "#a89bc4" }}>
            Monad DevInsight
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          defaultOpenKeys={["/projects-group"]}
          items={menuItems}
          style={{ border: "none", marginTop: 4, background: "#0f0a1e" }}
        />
      </Sider>
      <AntLayout style={{ background: "#0f0a1e" }}>
        <Header
          style={{
            background: "#1f1633",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            borderBottom: "1px solid #362d59",
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
            <Text style={{ color: "#ffffff" }}>{user?.username || user?.email}</Text>
            <Tag color={roleColor}>{roleLabel}</Tag>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={logout}
              size="small"
              style={{ color: "#a89bc4" }}
            >
              退出
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, background: "#0f0a1e", minHeight: "calc(100vh - 64px)" }}>
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
