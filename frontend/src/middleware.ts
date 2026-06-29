import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// PROTECTED (requires Clerk sign-in): ATS/admin routes only.
// Everything else — /, /resume, /match, /cover-letter, /jobs, /dashboard,
// /reminders, /sign-in, /sign-up, legal pages, etc. — stays public.
const isProtectedAtsRoute = createRouteMatcher([
  "/employees",
  "/employees/(.*)",
  "/job-requirements",
  "/job-requirements/(.*)",
  "/matches",
  "/matches/(.*)",
  "/submissions",
  "/submissions/(.*)",
  "/settings",
  "/settings/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedAtsRoute(req)) {
    // Redirects unauthenticated visitors to /sign-in and, after sign-in,
    // sends them back to the exact ATS page they originally requested.
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Run on every route except static assets, so the matcher above can decide
    // which paths actually require auth — public job-seeker pages pass through.
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};
