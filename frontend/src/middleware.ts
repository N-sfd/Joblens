import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only run this middleware on ATS + legacy CRM paths. Job-seeker pages
// (/ , /match, /dashboard, …) skip Clerk entirely so local Next stays responsive.
const isProtectedAtsRoute = createRouteMatcher(["/ats", "/ats/(.*)"]);

const LEGACY_ATS_REDIRECTS: Record<string, string> = {
  "/job-requirements": "/ats/jobs",
  "/employees": "/ats/employees",
};

function applyLegacyRedirects(req: NextRequest) {
  const { pathname } = req.nextUrl;
  for (const [legacyPrefix, targetPrefix] of Object.entries(LEGACY_ATS_REDIRECTS)) {
    if (pathname === legacyPrefix || pathname.startsWith(`${legacyPrefix}/`)) {
      const target = pathname.replace(legacyPrefix, targetPrefix);
      return NextResponse.redirect(new URL(target, req.url));
    }
  }
  return null;
}

const hasClerk =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) &&
  Boolean(process.env.CLERK_SECRET_KEY?.trim());

function publicMiddleware(req: NextRequest) {
  const redirected = applyLegacyRedirects(req);
  if (redirected) return redirected;
  if (isProtectedAtsRoute(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export default hasClerk
  ? clerkMiddleware(async (auth, req) => {
      const redirected = applyLegacyRedirects(req);
      if (redirected) return redirected;

      if (isProtectedAtsRoute(req)) {
        const { userId } = await auth();
        if (!userId) {
          const signInUrl = new URL("/sign-in", req.url);
          signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
          return NextResponse.redirect(signInUrl);
        }
      }
      return NextResponse.next();
    })
  : publicMiddleware;

export const config = {
  matcher: [
    "/ats",
    "/ats/(.*)",
    "/job-requirements",
    "/job-requirements/(.*)",
    "/employees",
    "/employees/(.*)",
  ],
};
