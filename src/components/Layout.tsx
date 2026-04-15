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
  Tooltip,
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
  SunOutlined,
  MoonOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";

const { Sider, Header, Content } = AntLayout;
const { Text } = Typography;

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { user, token, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

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
    <AntLayout style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Sider
        width={220}
        style={{
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-color)",
          overflow: "auto",
          height: "100vh",
          position: "sticky",
          top: 0,
          left: 0,
        }}
      >
        <div
          style={{
            height: 64,
            padding: "0 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Text strong style={{ fontSize: 15, color: "var(--text-secondary)" }}>
            Monad DevInsight
          </Text>
        </div>
        <Menu
          theme={isDark ? "dark" : "light"}
          mode="inline"
          selectedKeys={[activeKey]}
          defaultOpenKeys={["/projects-group"]}
          items={menuItems}
          style={{ border: "none", marginTop: 4, background: "var(--bg-sidebar)" }}
        />
      </Sider>
      <AntLayout style={{ background: "var(--bg-primary)" }}>
        <Header
          style={{
            background: "var(--bg-header)",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--border-color)",
            position: "sticky",
            top: 0,
            zIndex: 10,
            height: 64,
          }}
        >
          <Text strong style={{ fontSize: 15, color: "var(--text-secondary)" }}>
            Monad DevInsight
          </Text>
          <Space size={12}>
            <Tooltip title={isDark ? "切换到浅色" : "切换到深色"}>
              <Button
                type="text"
                icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
                size="small"
                style={{ color: "var(--text-secondary)" }}
              />
            </Tooltip>
            <Avatar
              size={32}
              icon={<UserOutlined />}
              src={user?.avatar || undefined}
            />
            <Text style={{ color: "var(--text-primary)" }}>{user?.username || user?.email}</Text>
            <Tag color={roleColor}>{roleLabel}</Tag>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={logout}
              size="small"
              style={{ color: "var(--text-secondary)" }}
            >
              退出
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, background: "var(--bg-primary)", minHeight: "calc(100vh - 64px)" }}>
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
