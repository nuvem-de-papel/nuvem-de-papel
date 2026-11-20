/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // foto do cliente (ate 2 MB) sobe por server action
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
