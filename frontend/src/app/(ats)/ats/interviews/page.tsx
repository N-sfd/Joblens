"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Interview } from "@/types";
import { INTERVIEW_OUTCOMES, INTERVIEW_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function InterviewsPageInner() {
  const searchParams = useSearchParams();
  const submissionIdParam = searchParams.get("submission_id");

  const [rows, setRows] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!!submissionIdParam);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState<number | null>(null);
  const [form, setForm] = useState({
    submission_id: submissionIdParam ?? "",
    scheduled_at: "",
    interview_type: "Phone Screen",
    interviewer_name: "",
    location_or_link: "",
    status: "Scheduled",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = submissionIdParam ? { submission_id: Number(submissionIdParam) } : undefined;
      setRows(await api.getInterviews(params));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load interviews.");
    } finally {
      setLoading(false);
    }
  }, [submissionIdParam]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createInterview({
        submission_id: Number(form.submission_id),
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        interview_type: form.interview_type || null,
        interviewer_name: form.interviewer_name || null,
        location_or_link: form.location_or_link || null,
        status: form.status,
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule interview.");
    } finally {
      setSaving(false);
    }
  };

  const updateField = async (id: number, data: { status?: string; outcome?: string }) => {
    setUpdating(id);
    try {
      await api.updateInterview(id, data);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update interview.");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Interviews</h1>
          <p className="page-subtitle">Track candidate interviews across active submissions.</p>
        </div>
        <button type="button" className="btn-primary flex items-center gap-1.5" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> Schedule Interview
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Submission ID</span>
            <input className="input mt-1 w-full" required value={form.submission_id} onChange={(e) => setForm({ ...form, submission_id: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Scheduled At</span>
            <input type="datetime-local" className="input mt-1 w-full" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Type</span>
            <input className="input mt-1 w-full" value={form.interview_type} onChange={(e) => setForm({ ...form, interview_type: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Interviewer</span>
            <input className="input mt-1 w-full" value={form.interviewer_name} onChange={(e) => setForm({ ...form, interviewer_name: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Location / Link</span>
            <input className="input mt-1 w-full" value={form.location_or_link} onChange={(e) => setForm({ ...form, location_or_link: e.target.value })} />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Schedule"}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No interviews yet. Schedule one from an active <Link href="/ats/submissions" className="text-indigo-600 hover:underline">submission</Link>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Job", "Employee", "Scheduled", "Type", "Status", "Outcome", "Update"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((iv) => (
                <tr key={iv.id} className="hover:bg-slate-50/50 align-top">
                  <td className="px-4 py-3 font-medium text-slate-800">{iv.job_title ?? "—"}</td>
                  <td className="px-4 py-3">{iv.employee_name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(iv.scheduled_at)}</td>
                  <td className="px-4 py-3">{iv.interview_type ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{iv.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", iv.outcome === "Passed" ? "bg-green-100 text-green-700" : iv.outcome === "Failed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")}>
                      {iv.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-3 space-y-1">
                    <select className="input text-xs py-1 w-full" value={iv.status} disabled={updating === iv.id} onChange={(e) => updateField(iv.id, { status: e.target.value })} aria-label="Interview status">
                      {INTERVIEW_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select className="input text-xs py-1 w-full" value={iv.outcome} disabled={updating === iv.id} onChange={(e) => updateField(iv.id, { outcome: e.target.value })} aria-label="Interview outcome">
                      {INTERVIEW_OUTCOMES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
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

export default function InterviewsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <InterviewsPageInner />
    </Suspense>
  );
}
