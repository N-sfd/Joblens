"use client";

import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAtsRole } from "@/lib/atsRole";
import { isClerkConfigured } from "@/lib/clerkConfigured";

function AtsAccessGateInner({ children }: { children: React.ReactNode }) {
  const { loading, hasAtsAccess, error, displayName, email, role, refresh } = useAtsRole();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 size={22} className="animate-spin text-indigo-500" />
        <p>Checking ATS permissions…</p>
        {error ? <p className="text-xs text-red-600 max-w-md text-center px-4">{error}</p> : null}
      </div>
    );
  }

  if (!hasAtsAccess) {
    return (
      <div className="max-w-lg mx-auto my-16 px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={22} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                You are signed in, but your account does not have ATS access.
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Ask an administrator to assign the <strong>Recruiter</strong> or{" "}
                <strong>Admin</strong> role
                {email ? (
                  <>
                    {" "}
                    for <span className="font-medium">{email}</span>
                  </>
                ) : null}
                . Current role: <span className="font-medium capitalize">{role}</span>
                {displayName ? <> · {displayName}</> : null}.
              </p>
              {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                >
                  Try again
                </button>
                <Link
                  href="/"
                  className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                >
                  Return to JobLens
                </Link>
                <a
                  href="mailto:admin@consultamerica.com?subject=ATS%20access%20request"
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                >
                  Contact Administrator
                </a>
                <SignOutButton>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
                  >
                    Sign Out
                  </button>
                </SignOutButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Blocks ATS UI until backend confirms access. Safe without Clerk at build. */
export default function AtsAccessGate({ children }: { children: React.ReactNode }) {
  if (!isClerkConfigured()) {
    return <>{children}</>;
  }
  return <AtsAccessGateInner>{children}</AtsAccessGateInner>;
}
