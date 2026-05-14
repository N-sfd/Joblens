const backendUrl = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "")
  .trim()
  .replace(/\/$/, "");

if (process.env.VERCEL === "1" && !backendUrl) {
  console.warn(
    "[JobLens] Set BACKEND_URL (recommended) or NEXT_PUBLIC_API_URL on Vercel so the app can reach the API."
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    if (!backendUrl) return [];
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

module.exports = nextConfig;
