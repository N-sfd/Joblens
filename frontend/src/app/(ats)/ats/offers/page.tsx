"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Offer } from "@/types";
import { OFFER_STATUSES, ONBOARDING_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status: string) {
  switch (status) {
    case "Accepted": return "bg-green-100 text-green-700";
    case "Declined": case "Withdrawn": return "bg-red-100 text-red-700";
    case "Extended": return "bg-teal-100 text-teal-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function OffersPageInner() {
  const searchParams = useSearchParams();
  const submissionIdParam = searchParams.get("submission_id");

  const [rows, setRows] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!!submissionIdParam);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState<number | null>(null);
  const [form, setForm] = useState({
    submission_id: submissionIdParam ?? "",
    offered_rate: "",
    start_date: "",
    status: "Extended",
    onboarding_status: "Not Started",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = submissionIdParam ? { submission_id: Number(submissionIdParam) } : undefined;
      setRows(await api.getOffers(params));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load offers.");
    } finally {
      setLoading(false);
    }
  }, [submissionIdParam]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createOffer({
        submission_id: Number(form.submission_id),
        offered_rate: form.offered_rate || null,
        start_date: form.start_date || null,
        status: form.status,
        onboarding_status: form.onboarding_status,
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create offer.");
    } finally {
      setSaving(false);
    }
  };

  const updateField = async (id: number, data: { status?: string; onboarding_status?: string }) => {
    setUpdating(id);
    try {
      await api.updateOffer(id, data);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update offer.");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Offers</h1>
          <p className="page-subtitle">Offers extended to consultants for client roles.</p>
        </div>
        <button type="button" className="btn-primary flex items-center gap-1.5" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> New Offer
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
            <span className="text-sm font-medium text-slate-700">Offered Rate</span>
            <input className="input mt-1 w-full" placeholder="e.g. $80/hr" value={form.offered_rate} onChange={(e) => setForm({ ...form, offered_rate: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Start Date</span>
            <input type="date" className="input mt-1 w-full" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select className="input mt-1 w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {OFFER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Create Offer"}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No offers yet. Create one from a <Link href="/ats/submissions" className="text-indigo-600 hover:underline">submission</Link> in interview stage.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Job", "Employee", "Rate", "Offer Date", "Start", "Status", "Onboarding", "Update"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/50 align-top">
                  <td className="px-4 py-3 font-medium text-slate-800">{o.job_title ?? "—"}</td>
                  <td className="px-4 py-3">{o.employee_name ?? "—"}</td>
                  <td className="px-4 py-3">{o.offered_rate ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(o.offer_date)}</td>
                  <td className="px-4 py-3 text-slate-500">{o.start_date ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", statusClass(o.status))}>{o.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{o.onboarding_status}</td>
                  <td className="px-4 py-3 space-y-1">
                    <select className="input text-xs py-1 w-full" value={o.status} disabled={updating === o.id} onChange={(e) => updateField(o.id, { status: e.target.value })} aria-label="Offer status">
                      {OFFER_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select className="input text-xs py-1 w-full" value={o.onboarding_status} disabled={updating === o.id} onChange={(e) => updateField(o.id, { onboarding_status: e.target.value })} aria-label="Onboarding status">
                      {ONBOARDING_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
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

export default function OffersPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <OffersPageInner />
    </Suspense>
  );
}
