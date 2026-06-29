# ATS/admin backend auth — Clerk JWT verification NOT implemented yet.
#
# The frontend ATS routes (/employees, /job-requirements, /matches, /submissions,
# /settings) are gated by Clerk on the Next.js side (see frontend/src/middleware.ts).
# That protects the *pages*, but the FastAPI endpoints below are reachable by
# anyone who can guess the URL until real token verification is added here.
#
# `get_current_ats_user` is a stub: it lets every request through today so the
# CRUD endpoints are usable during development. Do NOT ship this to production
# without finishing the TODO below.
#
# TODO before this app handles real employee/resume/job-email data in production:
#   1. Verify the Clerk session JWT sent from the frontend (Authorization: Bearer <token>
#      or the __session cookie) using Clerk's backend SDK / JWKS endpoint
#      (https://clerk.com/docs/backend-requests/handling/manual-jwt).
#   2. Replace the body of `get_current_ats_user` below with that verification,
#      raising HTTPException(401) on failure (mirror `auth.get_current_user_required`,
#      which does this for the separate, unrelated job-seeker auth system).
#   3. Every employee/job-requirement/match/submission route must depend on this
#      function — none of those should ever be reachable without a verified Clerk session.

def get_current_ats_user() -> None:
    """STUB — always allows the request through. Replace with real Clerk JWT
    verification (see module TODO) before exposing this API outside development."""
    return None
