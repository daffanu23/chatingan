import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lxgwwaxmfxtmqakdufhu.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
