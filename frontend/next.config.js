/** Service root only (e.g. https://x.onrender.com). Strips accidental /api suffix so rewrites do not become /api/api/... */
function normalizeBackendOrigin(raw) {
  return String(raw || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api\/?$/i, "");
}

const backendUrl = normalizeBackendOrigin(process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "");

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
    // beforeFiles: proxy /api before App Router resolves missing /api/* as not-found (404 HTML).
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      ],
    };
  },
};

module.exports = nextConfig;
