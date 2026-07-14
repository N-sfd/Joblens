"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { useAtsRole } from "@/lib/atsRole";
import ErrorBanner from "@/components/ErrorBanner";

type StaffRow = {
  id: number;
  clerk_user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  organization_name: string | null;
  role_updated_at: string | null;
  role_updated_by: string | null;
};

export default function AtsStaffUsersPage() {
  const { isAdmin, loading: roleLoading } = useAtsRole();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clerkId, setClerkId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "recruiter" | "manager" | "read_only">("recruiter");

  const load = async () => {
    setError(null);
    try {
      const data = (await api.listAtsStaffUsers()) as StaffRow[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff users.");
    }
  };

  useEffect(() => {
    if (!roleLoading && isAdmin) void load();
  }, [roleLoading, isAdmin]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!clerkId.trim()) {
      setError("Clerk user id is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createAtsStaffUser({
        clerk_user_id: clerkId.trim(),
        role,
        email: email.trim() || undefined,
        display_name: name.trim() || undefined,
        organization_name: "Consult America",
      });
      setClerkId("");
      setEmail("");
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  };

  const onRoleChange = async (clerkUserId: string, next: "admin" | "recruiter" | "manager" | "read_only") => {
    setBusy(true);
    setError(null);
    try {
      await api.updateAtsStaffRole(clerkUserId, { role: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  if (roleLoading) {
    return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-lg">
        <ErrorBanner message="Only administrators can manage ATS staff roles." />
        <Link href="/ats/settings" className="text-sm text-indigo-600 mt-4 inline-block">
          Back to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/ats/settings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3">
          <ArrowLeft size={14} /> Settings
        </Link>
        <p className="page-kicker">ATS</p>
        <h1 className="page-title flex items-center gap-2">
          <Shield size={22} className="text-indigo-600" /> Staff access
        </h1>
        <p className="page-subtitle">
          Assign Recruiter or Admin so staff can parse resumes and job emails. Role changes are audited.
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <form onSubmit={onCreate} className="card p-5 mb-6 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-slate-600">Clerk user ID</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={clerkId}
            onChange={(e) => setClerkId(e.target.value)}
            placeholder="user_2abc…"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Email</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Display name</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Role</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="recruiter">Recruiter</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
            <option value="read_only">Read Only (no ATS write)</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Add / grant access
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{r.display_name || r.email || "—"}</div>
                  <div className="text-xs text-slate-500">{r.email}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{r.clerk_user_id}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="rounded-md border border-slate-200 px-2 py-1 text-sm"
                    value={r.role}
                    disabled={busy}
                    onChange={(e) =>
                      onRoleChange(
                        r.clerk_user_id,
                        e.target.value as "admin" | "recruiter" | "manager" | "read_only",
                      )
                    }
                  >
                    <option value="admin">Admin</option>
                    <option value="recruiter">Recruiter</option>
                    <option value="manager">Manager</option>
                    <option value="read_only">Read Only</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.organization_name || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.role_updated_at ? new Date(r.role_updated_at).toLocaleString() : "—"}
                  {r.role_updated_by ? (
                    <div className="font-mono text-[10px] mt-0.5">{r.role_updated_by}</div>
                  ) : null}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No staff rows yet. Grant yourself access with the script, then manage others here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
