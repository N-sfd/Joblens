import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// AI endpoints (resume/cover-letter analysis) can run well past a typical
// CRUD request — give the function room to outlive the upstream fetch below.
export const maxDuration = 60;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function backendOrigin(): string | null {
  const raw = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "").replace(/\/api\/?$/i, "");
}

function copyHeaders(from: Headers, to: Headers) {
  from.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === "set-cookie") return;
    to.set(key, value);
  });
}

const UPSTREAM_TIMEOUT_MS = 18_000;
const WAKE_HEALTH_TIMEOUT_MS = 22_000;

function isTimeoutError(e: unknown): boolean {
  return e instanceof Error && /abort|timeout/i.test(e.message);
}

async function wakeBackend(origin: string): Promise<boolean> {
  try {
    const res = await fetch(new URL("/health", origin), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(WAKE_HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchUpstream(
  target: URL,
  init: {
    method: string;
    headers: Headers;
    body: ArrayBuffer | undefined;
  },
  timeoutMs: number,
): Promise<Response> {
  let upstream = await fetch(target, {
    method: init.method,
    headers: init.headers,
    body: init.body && init.body.byteLength > 0 ? init.body : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });

  // FastAPI 307s bare router-prefix requests (e.g. /api/profile -> /api/profile/).
  // Following that in the browser is a cross-origin hop to the raw Render host,
  // which strips Authorization. Follow same-origin redirects here instead.
  if (upstream.status === 307 || upstream.status === 308) {
    const location = upstream.headers.get("location");
    if (location) {
      const redirectTarget = new URL(location, target.origin);
      if (redirectTarget.origin === target.origin) {
        upstream = await fetch(redirectTarget, {
          method: init.method,
          headers: init.headers,
          body: init.body && init.body.byteLength > 0 ? init.body : undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
      }
    }
  }
  return upstream;
}

async function proxy(req: NextRequest, path: string[] | undefined) {
  const origin = backendOrigin();
  if (!origin) {
    return NextResponse.json(
      {
        detail:
          "API proxy is not configured. In Vercel, set BACKEND_URL to your Render service root (e.g. https://your-api.onrender.com), then redeploy.",
      },
      { status: 502 }
    );
  }

  const sub = path?.length ? path.join("/") : "";
  // FastAPI liveness is `/health` (not under `/api`). Map the proxy path for probes.
  const pathname =
    sub === "health" || sub === "health/ready"
      ? `/${sub}`
      : sub
        ? `/api/${sub}`
        : "/api";
  const target = new URL(pathname + req.nextUrl.search, origin);

  const headers = new Headers();
  copyHeaders(req.headers, headers);
  // Explicitly forward Clerk session JWT — never drop Authorization on the BFF hop.
  const authorization = req.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  // Body is re-buffered below; inbound Content-Length can mismatch and break
  // multipart resume uploads / authenticated POSTs upstream.
  headers.delete("content-length");

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  const init = { method: req.method, headers, body };

  let upstream: Response;
  try {
    // Bound wait time so a sleeping Render host fails before maxDuration.
    // On timeout, ping /health once (wakes free-tier cold starts) then retry.
    try {
      upstream = await fetchUpstream(target, init, UPSTREAM_TIMEOUT_MS);
    } catch (first) {
      if (!isTimeoutError(first) || pathname === "/health" || pathname === "/health/ready") {
        throw first;
      }
      await wakeBackend(origin);
      upstream = await fetchUpstream(target, init, UPSTREAM_TIMEOUT_MS);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream unreachable";
    const timedOut = isTimeoutError(e);
    return NextResponse.json(
      {
        detail: timedOut
          ? `The API at ${origin} is waking up or overloaded (timed out). Render free-tier services sleep when idle — wait ~30s and try again. If this keeps happening, open ${origin}/health and confirm {"status":"healthy"}.`
          : `Backend unreachable at ${origin}${pathname} (${msg}). Check BACKEND_URL on Vercel and that the Render service is awake.`,
      },
      { status: 504 },
    );
  }

  // Wrong BACKEND_URL often points at the unrelated salary-prediction "joblens-api"
  // (health includes model_rmse). Surface a clear 502 instead of opaque 404s.
  if (
    upstream.status === 404 &&
    (pathname.startsWith("/api/profile") ||
      pathname.startsWith("/api/joblens") ||
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/api/jobs") ||
      pathname.startsWith("/api/candidates"))
  ) {
    try {
      const healthRes = await fetch(new URL("/health", origin), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
      });
      const healthText = await healthRes.text();
      let healthJson: Record<string, unknown> | null = null;
      try {
        healthJson = JSON.parse(healthText) as Record<string, unknown>;
      } catch {
        healthJson = null;
      }
      const wrongSalaryApi =
        healthJson != null &&
        ("model_rmse" in healthJson ||
          "model_loaded" in healthJson ||
          healthJson.status === "ok");
      const notCrmHealthy = !healthJson || healthJson.status !== "healthy";
      if (wrongSalaryApi || notCrmHealthy) {
        return NextResponse.json(
          {
            detail:
              `BACKEND_URL (${origin}) is not this repo’s CRM FastAPI. ` +
              `Expected /health → {"status":"healthy"}. ` +
              `Do not use the salary-prediction joblens-api.onrender.com. ` +
              `Deploy backend/ to Render, set Vercel BACKEND_URL to that service root (no /api), enable SEEKER_PRODUCT_ENABLED=true, then redeploy.`,
          },
          { status: 502 },
        );
      }
    } catch {
      /* keep original 404 */
    }
  }

  const outHeaders = new Headers();
  copyHeaders(upstream.headers, outHeaders);
  // Node fetch exposes Set-Cookie via getSetCookie(); forEach can drop or join them.
  outHeaders.delete("set-cookie");
  const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies =
    typeof getSetCookie === "function" ? getSetCookie.call(upstream.headers) : [];
  if (setCookies.length) {
    for (const cookie of setCookies) {
      outHeaders.append("set-cookie", cookie);
    }
  } else {
    const single = upstream.headers.get("set-cookie");
    if (single) outHeaders.append("set-cookie", single);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

type Ctx = { params: { path?: string[] } };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function HEAD(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function OPTIONS(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}
