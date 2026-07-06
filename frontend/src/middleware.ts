import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// PROTECTED (requires Clerk sign-in): ATS/admin routes only.
// Everything else — /, /resume, /match, /cover-letter, /jobs, /dashboard,
// /reminders, /sign-in, /sign-up, legal pages, etc. — stays public.
// All private Consult America CRM/ATS pages live under /ats/*. Everything else
// (/, /dashboard, /resume, /match, /jobs, /cover-letter, /reminders, legal, auth)
// stays public.
const isProtectedAtsRoute = createRouteMatcher([
  "/ats",
  "/ats/(.*)",
]);

const LEGACY_ATS_REDIRECTS: Record<string, string> = {
  "/job-requirements": "/ats/jobs",
  "/employees": "/ats/employees",
};

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  for (const [legacyPrefix, targetPrefix] of Object.entries(LEGACY_ATS_REDIRECTS)) {
    if (pathname === legacyPrefix || pathname.startsWith(`${legacyPrefix}/`)) {
      const target = pathname.replace(legacyPrefix, targetPrefix);
      return NextResponse.redirect(new URL(target, req.url));
    }
  }

  if (isProtectedAtsRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      // Redirect unauthenticated visitors to /sign-in and, after sign-in,
      // send them back to the exact ATS page they originally requested.
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run on every route except static assets, so the matcher above can decide
    // which paths actually require auth — public job-seeker pages pass through.
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
