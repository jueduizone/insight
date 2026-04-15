import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { App, ConfigProvider, theme as antTheme } from "antd";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";

const DARK_THEME = {
  algorithm: antTheme.darkAlgorithm,
  token: {
    colorPrimary: "#6a5fc1",
    colorBgContainer: "#2d2147",
    colorBgElevated: "#1f1633",
    colorBgLayout: "#0f0a1e",
    colorBorder: "#362d59",
    colorBorderSecondary: "#2a2045",
    colorText: "#ffffff",
    colorTextSecondary: "#a89bc4",
    colorTextTertiary: "#7a6e9a",
    borderRadius: 8,
    fontFamily: "inherit",
  },
  components: {
    Table: {
      headerBg: "#2d2147",
      rowHoverBg: "#362d59",
      borderColor: "#362d59",
      headerColor: "#a89bc4",
    },
    Modal: {
      contentBg: "#1f1633",
      headerBg: "#1f1633",
      titleColor: "#ffffff",
    },
    Card: {
      colorBgContainer: "#2d2147",
    },
    Button: {
      colorPrimary: "#6a5fc1",
      colorPrimaryHover: "#7c6fd4",
    },
    Form: {
      labelColor: "#a89bc4",
    },
    Input: {
      colorBgContainer: "#150f23",
      colorBorder: "#362d59",
    },
    Select: {
      colorBgContainer: "#150f23",
      colorBorder: "#362d59",
      optionSelectedBg: "#362d59",
    },
    Steps: {
      colorPrimary: "#6a5fc1",
    },
    Menu: {
      darkItemBg: "#0f0a1e",
      darkSubMenuItemBg: "#1f1633",
      darkItemSelectedBg: "#362d59",
      darkItemColor: "#a89bc4",
      darkItemSelectedColor: "#ffffff",
      darkItemHoverBg: "#2a2045",
    },
    Layout: {
      siderBg: "#0f0a1e",
      headerBg: "#0f0a1e",
      bodyBg: "#0f0a1e",
    },
  },
};

const LIGHT_THEME = {
  algorithm: antTheme.defaultAlgorithm,
  token: {
    colorPrimary: "#7c3aed",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#ffffff",
    colorBgLayout: "#f8f9fa",
    colorBorder: "#e0e0e0",
    colorBorderSecondary: "#ececec",
    colorText: "#1a1a2e",
    colorTextSecondary: "#6b7280",
    colorTextTertiary: "#9ca3af",
    borderRadius: 8,
    fontFamily: "inherit",
  },
  components: {
    Table: {
      headerBg: "#f3f0fa",
      rowHoverBg: "#f8f4ff",
      borderColor: "#ececec",
      headerColor: "#6d28d9",
    },
    Card: {
      colorBgContainer: "#ffffff",
    },
    Button: {
      colorPrimary: "#7c3aed",
      colorPrimaryHover: "#6d28d9",
    },
    Layout: {
      siderBg: "#f0f0f5",
      headerBg: "#ffffff",
      bodyBg: "#f8f9fa",
    },
    Menu: {
      itemBg: "#f0f0f5",
      itemSelectedBg: "#ede9fe",
      itemSelectedColor: "#6d28d9",
      itemColor: "#1a1a2e",
      itemHoverBg: "#e9e6f5",
    },
  },
};

function ThemedApp({ Component, pageProps }: AppProps) {
  const { theme } = useTheme();
  return (
    <ConfigProvider theme={theme === "dark" ? DARK_THEME : LIGHT_THEME}>
      <App>
        <Component {...pageProps} />
      </App>
    </ConfigProvider>
  );
}

export default function AppWrapper(props: AppProps) {
  return (
    <ThemeProvider>
      <ThemedApp {...props} />
    </ThemeProvider>
  );
}
