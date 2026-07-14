import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only run this middleware on ATS + legacy CRM paths (+ seeker paths, only to
// enforce the SEEKER_PRODUCT_ENABLED flag below). Job-seeker pages skip Clerk
// entirely so local Next stays responsive.
const isProtectedAtsRoute = createRouteMatcher(["/ats", "/ats/(.*)"]);

const LEGACY_ATS_REDIRECTS: Record<string, string> = {
  "/job-requirements": "/ats/jobs",
  "/employees": "/ats/candidates",
  "/ats/employee-resumes": "/ats/candidates",
  "/ats/recruiters": "/ats/contacts",
  "/ats/vendors": "/ats/contacts",
  "/ats/clients": "/ats/contacts",
};

const LEGACY_ATS_EXACT: Record<string, string> = {
  "/ats/employees": "/ats/candidates",
  "/ats/employees/new": "/ats/candidates/new",
  "/ats/employees/new-from-resume": "/ats/candidates/new?mode=resume",
};

function applyLegacyRedirects(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (LEGACY_ATS_EXACT[pathname]) {
    return NextResponse.redirect(new URL(LEGACY_ATS_EXACT[pathname], req.url));
  }
  // /ats/employees/:id[/edit] → /ats/candidates/:id[/edit]
  if (pathname.startsWith("/ats/employees/")) {
    const target = pathname.replace("/ats/employees", "/ats/candidates");
    const url = new URL(target, req.url);
    url.search = req.nextUrl.search;
    return NextResponse.redirect(url);
  }

  for (const [legacyPrefix, targetPrefix] of Object.entries(LEGACY_ATS_REDIRECTS)) {
    if (pathname === legacyPrefix || pathname.startsWith(`${legacyPrefix}/`)) {
      const target = pathname.replace(legacyPrefix, targetPrefix);
      return NextResponse.redirect(new URL(target, req.url));
    }
  }
  return null;
}

// The standalone job-seeker product ("JobLens" — Dashboard, Discover Jobs,
// Job Tracker, Job Matcher, Resume Analyzer, Cover Letter Generator,
// Reminders, browser-extension pairing, and the marketing landing page).
// Feature-flagged off (not deleted) while the app consolidates onto the
// Recruitment CRM + ATS product. Defaults to enabled.
const SEEKER_PRODUCT_ENABLED =
  (process.env.NEXT_PUBLIC_SEEKER_PRODUCT_ENABLED ?? "true").trim().toLowerCase() !== "false";

const isSeekerRoute = createRouteMatcher([
  "/",
  "/dashboard(.*)",
  "/jobs(.*)",
  "/resume(.*)",
  "/match(.*)",
  "/cover-letter(.*)",
  "/reminders(.*)",
  "/applications(.*)",
  "/profile(.*)",
  "/extension(.*)",
]);

function applySeekerProductGate(req: NextRequest) {
  if (!SEEKER_PRODUCT_ENABLED && isSeekerRoute(req)) {
    return NextResponse.redirect(new URL("/ats", req.url));
  }
  return null;
}

const hasClerk =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) &&
  Boolean(process.env.CLERK_SECRET_KEY?.trim());

function publicMiddleware(req: NextRequest) {
  const gated = applySeekerProductGate(req);
  if (gated) return gated;
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
      const gated = applySeekerProductGate(req);
      if (gated) return gated;

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
    "/",
    "/ats",
    "/ats/(.*)",
    "/job-requirements",
    "/job-requirements/(.*)",
    "/employees",
    "/employees/(.*)",
    "/dashboard",
    "/dashboard/(.*)",
    "/jobs",
    "/jobs/(.*)",
    "/resume",
    "/resume/(.*)",
    "/match",
    "/match/(.*)",
    "/cover-letter",
    "/cover-letter/(.*)",
    "/reminders",
    "/reminders/(.*)",
    "/applications",
    "/applications/(.*)",
    "/profile",
    "/profile/(.*)",
    "/extension",
    "/extension/(.*)",
  ],
};
