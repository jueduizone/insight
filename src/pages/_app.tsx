import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { App } from "antd";

export default function AppWrapper({ Component, pageProps }: AppProps) {
  return (
    <App>
      <Component {...pageProps} />
    </App>
  );
}
