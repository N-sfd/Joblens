"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Submission } from "@/types";
import { SUBMISSION_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status: string) {
  switch (status) {
    case "Selected": return "bg-green-100 text-green-700";
    case "Rejected": case "Withdrawn": case "Closed": return "bg-red-100 text-red-700";
    case "Interview": case "Offer": return "bg-teal-100 text-teal-700";
    case "Submitted": case "Client Review": return "bg-cyan-100 text-cyan-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function SubmissionsPageInner() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(() => searchParams.get("status") || "active");
  const [updating, setUpdating] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(() => !!searchParams.get("job_requirement_id"));
  const [form, setForm] = useState(() => ({
    job_requirement_id: searchParams.get("job_requirement_id") || "",
    employee_id: "",
    submitted_rate: "",
    status: "Draft",
  }));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === "active" ? { active_only: true } : filter !== "all" ? { status: filter } : undefined;
      setRows(await api.getSubmissions(params));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      await api.updateSubmission(id, { status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status.");
    } finally {
      setUpdating(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createSubmission({
        job_requirement_id: Number(form.job_requirement_id),
        employee_id: Number(form.employee_id),
        submitted_rate: form.submitted_rate || null,
        status: form.status,
      });
      setShowForm(false);
      setForm({ job_requirement_id: "", employee_id: "", submitted_rate: "", status: "Draft" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create submission.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Submissions</h1>
          <p className="page-subtitle">Client/vendor submissions for matched employees.</p>
        </div>
        <button type="button" className="btn-primary flex items-center gap-1.5" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> New Submission
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Job ID</span>
            <input className="input mt-1 w-full" required value={form.job_requirement_id} onChange={(e) => setForm({ ...form, job_requirement_id: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Employee ID</span>
            <input className="input mt-1 w-full" required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Submitted Rate</span>
            <input className="input mt-1 w-full" placeholder="e.g. $75/hr" value={form.submitted_rate} onChange={(e) => setForm({ ...form, submitted_rate: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select className="input mt-1 w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {SUBMISSION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Create"}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {([["active", "Active"], ["all", "All"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={clsx("px-3 py-1.5 rounded-lg text-sm font-medium", filter === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {label}
          </button>
        ))}
        {SUBMISSION_STATUSES.filter((s) => ["Submitted", "Interview", "Offer", "Selected"].includes(s)).map((s) => (
          <button key={s} type="button" onClick={() => setFilter(s)} className={clsx("px-3 py-1.5 rounded-lg text-sm font-medium", filter === s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No submissions yet. Create one from a <Link href="/ats/job-sends" className="text-indigo-600 hover:underline">job send</Link> when an employee is interested.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Job", "Employee", "Vendor", "Rate", "Submitted", "Status", "Update", "Stage"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className={clsx("hover:bg-slate-50/50 align-top", highlightId === String(s.id) && "bg-indigo-50")}>
                  <td className="px-4 py-3">
                    <Link href={`/ats/jobs/${s.job_requirement_id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                      {s.job_title ?? `Job #${s.job_requirement_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/ats/candidates/${s.employee_id}`} className="text-slate-800 hover:text-indigo-600">
                      {s.employee_name ?? `Employee #${s.employee_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{s.vendor_name ?? "—"}</td>
                  <td className="px-4 py-3">{s.submitted_rate ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(s.submission_date)}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", statusClass(s.status))}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <select className="input text-xs py-1 w-auto" value={s.status} disabled={updating === s.id} onChange={(e) => updateStatus(s.id, e.target.value)} aria-label="Submission status">
                      {SUBMISSION_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                    <Link href={`/ats/interviews?submission_id=${s.id}`} className="text-xs text-indigo-600 hover:underline">Interview</Link>
                    <Link href={`/ats/offers?submission_id=${s.id}`} className="text-xs text-indigo-600 hover:underline">Offer</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SubmissionsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <SubmissionsPageInner />
    </Suspense>
  );
}
