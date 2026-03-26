import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true, // 忽略 TypeScript 检查
  },
  reactStrictMode: true,
  transpilePackages: [
    '@ant-design',
    'antd',
    'rc-util',
    'rc-pagination',
    'rc-picker',
    'rc-tree',
    'rc-table',
    'rc-input',
  ],
  images: {
    remotePatterns: [
       {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
         pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
