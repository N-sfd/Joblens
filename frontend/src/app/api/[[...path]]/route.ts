import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (!HOP_BY_HOP.has(key.toLowerCase())) to.set(key, value);
  });
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

  let upstream: Response;
  try {
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

    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      // Do not follow redirects that could strip Authorization.
      redirect: "manual",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream unreachable";
    return NextResponse.json(
      {
        detail: `Backend unreachable at ${origin}${pathname} (${msg}). Check BACKEND_URL on Vercel and that the Render service is awake.`,
      },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  copyHeaders(upstream.headers, outHeaders);

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
