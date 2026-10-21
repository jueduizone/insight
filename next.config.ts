import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
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
