"use client";

// Mirrors the role normalization in backend/ats_auth.py so the UI hides
// actions a user's Clerk public_metadata.role would be rejected for. The
// backend is the source of truth (403s on unauthorized writes); this only
// avoids showing a control that would immediately fail.
//
// Missing/unrecognized role defaults to "viewer" (least privilege) to match
// backend/ats_auth.py's AtsPrincipal.role when ATS_AUTH_ENFORCE=true — which
// this project runs even in local dev. A user without public_metadata.role
// set yet should see a read-only UI, not admin buttons that immediately 403.

import { useUser } from "@clerk/nextjs";

export type AtsRole = "admin" | "recruiter" | "viewer";

const ROLE_ALIASES: Record<string, AtsRole> = {
  administrator: "admin",
  recruiters: "recruiter",
  view: "viewer",
  readonly: "viewer",
};

function normalizeRole(raw: unknown): AtsRole {
  if (typeof raw !== "string" || !raw.trim()) return "viewer";
  const role = raw.trim().toLowerCase();
  const aliased = ROLE_ALIASES[role] ?? role;
  return aliased === "admin" || aliased === "recruiter" || aliased === "viewer" ? aliased : "viewer";
}

export function useAtsRole(): { role: AtsRole; isAdmin: boolean; canWrite: boolean; isViewer: boolean } {
  const { user } = useUser();
  const role = normalizeRole(user?.publicMetadata?.role);
  return {
    role,
    isAdmin: role === "admin",
    canWrite: role === "admin" || role === "recruiter",
    isViewer: role === "viewer",
  };
}
