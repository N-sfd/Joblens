"use client";

// Resolves ATS role from the backend (`/api/ats/me`) — source of truth —
// and falls back to Clerk publicMetadata only while loading.

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "@/lib/api";

export type AtsRole = "admin" | "recruiter" | "viewer";

const ROLE_ALIASES: Record<string, AtsRole> = {
  administrator: "admin",
  recruiters: "recruiter",
  view: "viewer",
  readonly: "viewer",
  hr_admin: "admin",
};

function normalizeRole(raw: unknown): AtsRole {
  if (typeof raw !== "string" || !raw.trim()) return "viewer";
  const role = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliased = ROLE_ALIASES[role] ?? role;
  return aliased === "admin" || aliased === "recruiter" || aliased === "viewer" ? aliased : "viewer";
}

export type AtsMeState = {
  role: AtsRole;
  isAdmin: boolean;
  canWrite: boolean;
  isViewer: boolean;
  hasAtsAccess: boolean;
  displayName: string | null;
  email: string | null;
  organizationName: string | null;
  roleSource: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useAtsRole(): AtsMeState {
  const { user, isLoaded: userLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const clerkFallback = normalizeRole(user?.publicMetadata?.role);
  const [role, setRole] = useState<AtsRole>(clerkFallback);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [roleSource, setRoleSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!isSignedIn) {
      setRole("viewer");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const me = await api.getAtsMe();
      setRole(normalizeRole(me.role));
      setDisplayName(me.display_name || user?.fullName || null);
      setEmail(me.email || user?.primaryEmailAddress?.emailAddress || null);
      setOrganizationName(me.organization_name);
      setRoleSource(me.role_source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load ATS permissions.");
      setRole(clerkFallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userLoaded) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoaded, isSignedIn, user?.id]);

  return {
    role,
    isAdmin: role === "admin",
    canWrite: role === "admin" || role === "recruiter",
    isViewer: role === "viewer",
    hasAtsAccess: role === "admin" || role === "recruiter",
    displayName:
      displayName ||
      user?.fullName ||
      user?.primaryEmailAddress?.emailAddress ||
      null,
    email: email || user?.primaryEmailAddress?.emailAddress || null,
    organizationName,
    roleSource,
    loading,
    error,
    refresh,
  };
}
