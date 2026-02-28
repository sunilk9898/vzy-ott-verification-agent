/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone only for Docker/self-hosted; Vercel uses its own builder
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  reactStrictMode: true,
  env: {
    API_BASE_URL: process.env.API_BASE_URL || "http://localhost:3001",
    WS_URL: process.env.WS_URL || process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001",
  },
  async rewrites() {
    const apiUrl = process.env.API_BASE_URL || "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
