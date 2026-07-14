"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useAtsRole } from "@/lib/atsRole";

function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "recruiter") return "Recruiter";
  if (role === "manager") return "Manager";
  return "Read Only";
}

export default function AtsHeaderAccount() {
  const { displayName, role, organizationName, loading } = useAtsRole();
  const name = displayName || "Signed in";

  return (
    <div className="ml-auto flex items-center gap-4">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
        ApplyPilot
      </Link>
      {!loading && (
        <div className="hidden sm:flex flex-col items-end leading-tight">
          <span className="text-sm font-medium text-slate-800">
            {name} · {roleLabel(role)}
          </span>
          {organizationName ? (
            <span className="text-[11px] text-slate-400">{organizationName}</span>
          ) : null}
        </div>
      )}
      <UserButton afterSignOutUrl="/" />
    </div>
  );
}
