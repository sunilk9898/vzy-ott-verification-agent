/** @type {import('next').NextConfig} */

// Determine build target:
// - GITHUB_PAGES=true  -> static export for GitHub Pages
// - VERCEL=true        -> Vercel builder (no standalone)
// - Default            -> standalone for Docker/self-hosted
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const isVercel = !!process.env.VERCEL;

const repoName = "vzy-ott-verification-agent";

const nextConfig = {
  // Output mode
  ...(isGitHubPages
    ? { output: "export" }
    : isVercel
      ? {}
      : { output: "standalone" }),

  // GitHub Pages requires basePath for repo subpath
  ...(isGitHubPages ? { basePath: `/${repoName}` } : {}),

  reactStrictMode: true,

  // Make backend API URL available at build time
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      (isGitHubPages
        ? "https://vzy-api-gro1.onrender.com/api"
        : "/api"),
    NEXT_PUBLIC_WS_URL:
      process.env.NEXT_PUBLIC_WS_URL ||
      process.env.WS_URL ||
      (isGitHubPages
        ? "https://vzy-api-gro1.onrender.com"
        : "http://localhost:3001"),
  },

  // Images: use unoptimized for static export (no server-side optimization)
  ...(isGitHubPages ? { images: { unoptimized: true } } : {}),

  // Rewrites only work with a server (not in static export or Vercel)
  ...(!isGitHubPages && !isVercel
    ? {
        async rewrites() {
          const apiUrl =
            process.env.API_BASE_URL || "http://localhost:3001";
          return [
            {
              source: "/api/:path*",
              destination: `${apiUrl}/api/:path*`,
            },
          ];
        },
      }
    : {}),
};

module.exports = nextConfig;
