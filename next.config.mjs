/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  agentRules: false,
  devIndicators: false,
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: { cpus: 1, staticGenerationMaxConcurrency: 2 },
};
export default nextConfig;
