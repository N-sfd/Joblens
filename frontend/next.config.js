/** Service root only (e.g. https://x.onrender.com). Strips accidental /api suffix. */
function normalizeBackendOrigin(raw) {
  return String(raw || "")
    .trim()
    .replace(/\/$/, "")
    .replace(/\/api\/?$/i, "");
}

const backendUrl = normalizeBackendOrigin(process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "");

if (process.env.VERCEL === "1" && !backendUrl) {
  console.warn(
    "[JobLens] Set BACKEND_URL (recommended) or NEXT_PUBLIC_API_URL on Vercel so /api/* can be proxied to FastAPI."
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

module.exports = nextConfig;
