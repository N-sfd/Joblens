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
};

const LEGACY_ATS_EXACT: Record<string, string> = {
  "/ats/employees": "/ats/candidates",
  "/ats/employees/new": "/ats/candidates/new",
  "/ats/employees/new-from-resume": "/ats/candidates/new?mode=resume",
  "/ats/recruiters": "/ats/contacts?type=recruiter",
  "/ats/clients": "/ats/contacts?view=companies&type=client",
  "/ats/vendors": "/ats/contacts?view=companies&type=vendor",
};

function mapSubmissionsQueryToPipeline(search: string): string {
  if (!search) return "";
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const status = sp.get("status");
  if (status) {
    const normalized = status.trim().toLowerCase();
    sp.delete("status");
    if (normalized === "submitted" || normalized === "client review") {
      sp.set("stage_group", "submitted");
    } else if (normalized === "interview") {
      sp.set("stage_group", "interview");
    } else if (normalized === "offer") {
      sp.set("stage_group", "offer");
    } else if (normalized === "selected" || normalized === "placed") {
      sp.set("stage_group", "placed");
    } else if (normalized === "rejected" || normalized === "withdrawn" || normalized === "closed") {
      sp.set("stage_group", "closed");
    } else {
      sp.set("stage", status);
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function applyLegacyRedirects(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/ats/submissions") {
    const url = new URL(`/ats/pipeline${mapSubmissionsQueryToPipeline(req.nextUrl.search)}`, req.url);
    return NextResponse.redirect(url);
  }
  if (LEGACY_ATS_EXACT[pathname]) {
    const url = new URL(LEGACY_ATS_EXACT[pathname], req.url);
    for (const [k, v] of req.nextUrl.searchParams.entries()) {
      if (!url.searchParams.has(k)) url.searchParams.set(k, v);
    }
    return NextResponse.redirect(url);
  }
  // /ats/employees/:id[/edit] → /ats/candidates/:id[/edit]
  if (pathname.startsWith("/ats/employees/")) {
    const target = pathname.replace("/ats/employees", "/ats/candidates");
    const url = new URL(target, req.url);
    url.search = req.nextUrl.search;
    return NextResponse.redirect(url);
  }
  // /ats/submissions/:id → /ats/pipeline/:id
  if (pathname.startsWith("/ats/submissions/")) {
    const target = pathname.replace("/ats/submissions", "/ats/pipeline");
    const url = new URL(target, req.url);
    url.search = req.nextUrl.search;
    return NextResponse.redirect(url);
  }
  // Unified Contacts legacy detail routes — do NOT map company IDs to people paths
  if (pathname.startsWith("/ats/recruiters/")) {
    const rest = pathname.slice("/ats/recruiters/".length);
    const url = new URL(`/ats/contacts/${rest}`, req.url);
    url.search = req.nextUrl.search;
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/ats/clients/")) {
    const rest = pathname.slice("/ats/clients/".length);
    const url = new URL(`/ats/contacts/companies/${rest}`, req.url);
    url.search = req.nextUrl.search;
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/ats/vendors/")) {
    const rest = pathname.slice("/ats/vendors/".length);
    const url = new URL(`/ats/contacts/companies/${rest}`, req.url);
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
