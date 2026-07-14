"use client";

// Resolves ATS role from the backend (`/api/ats/me`) — source of truth —
// and falls back to Clerk publicMetadata only while loading.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { api } from "@/lib/api";

export type AtsRole = "admin" | "recruiter" | "manager" | "read_only";

const ROLE_ALIASES: Record<string, AtsRole> = {
  administrator: "admin",
  recruiters: "recruiter",
  managers: "manager",
  view: "read_only",
  viewer: "read_only",
  readonly: "read_only",
  "read-only": "read_only",
  hr_admin: "admin",
};

const VALID_ROLES: readonly AtsRole[] = ["admin", "recruiter", "manager", "read_only"];

/** Compile-time: NEXT_PUBLIC_* is inlined per deployment — hook graph never switches mid-session. */
const CLERK_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());

function normalizeRole(raw: unknown): AtsRole {
  if (typeof raw !== "string" || !raw.trim()) return "read_only";
  const role = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliased = ROLE_ALIASES[role] ?? role;
  return (VALID_ROLES as readonly string[]).includes(aliased) ? (aliased as AtsRole) : "read_only";
}

export type AtsMeState = {
  role: AtsRole;
  isAdmin: boolean;
  canWrite: boolean;
  isReadOnly: boolean;
  hasAtsAccess: boolean;
  displayName: string | null;
  email: string | null;
  organizationName: string | null;
  roleSource: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function pack(
  role: AtsRole,
  rest: {
    displayName?: string | null;
    email?: string | null;
    organizationName?: string | null;
    roleSource?: string | null;
    loading?: boolean;
    error?: string | null;
    refresh: () => Promise<void>;
  },
): AtsMeState {
  return {
    role,
    isAdmin: role === "admin",
    canWrite: role === "admin" || role === "recruiter" || role === "manager",
    isReadOnly: role === "read_only",
    hasAtsAccess: true,
    displayName: rest.displayName ?? null,
    email: rest.email ?? null,
    organizationName: rest.organizationName ?? null,
    roleSource: rest.roleSource ?? null,
    loading: rest.loading ?? false,
    error: rest.error ?? null,
    refresh: rest.refresh,
  };
}

function useAtsRoleWithoutClerk(): AtsMeState {
  const refresh = useCallback(async () => {}, []);
  return pack("admin", {
    loading: false,
    error:
      "Clerk is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY on Vercel, then redeploy. Zoho Inbox can still open; API auth will fail until Clerk is set.",
    roleSource: "clerk_missing",
    displayName: "Unauthenticated",
    refresh,
  });
}

function useAtsRoleWithClerk(): AtsMeState {
  const { user, isLoaded: userLoaded } = useUser();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const clerkFallback = normalizeRole(user?.publicMetadata?.role);
  const [role, setRole] = useState<AtsRole>(clerkFallback);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [roleSource, setRoleSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authLoaded || !userLoaded) return;
    if (!isSignedIn) {
      setRole("read_only");
      setLoading(false);
      setError(null);
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
  }, [
    authLoaded,
    userLoaded,
    isSignedIn,
    user?.fullName,
    user?.primaryEmailAddress?.emailAddress,
    clerkFallback,
  ]);

  useEffect(() => {
    if (!authLoaded || !userLoaded) return;
    void refresh();
  }, [authLoaded, userLoaded, isSignedIn, user?.id, refresh]);

  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => {
      setLoading(false);
      setError((prev) => prev || "Timed out checking ATS permissions. Try again or sign out and sign back in.");
      if (clerkFallback === "admin" || clerkFallback === "recruiter" || clerkFallback === "manager") {
        setRole(clerkFallback);
      }
    }, 12000);
    return () => window.clearTimeout(t);
  }, [loading, clerkFallback]);

  return pack(role, {
    displayName:
      displayName ||
      user?.fullName ||
      user?.primaryEmailAddress?.emailAddress ||
      null,
    email: email || user?.primaryEmailAddress?.emailAddress || null,
    organizationName,
    roleSource,
    loading: loading && !(authLoaded && userLoaded && !isSignedIn),
    error,
    refresh,
  });
}

export const useAtsRole: () => AtsMeState = CLERK_CONFIGURED
  ? useAtsRoleWithClerk
  : useAtsRoleWithoutClerk;
