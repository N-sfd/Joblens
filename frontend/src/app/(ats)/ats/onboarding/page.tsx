"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Offer } from "@/types";
import { ONBOARDING_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OnboardingPage() {
  const [rows, setRows] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("active");
  const [updating, setUpdating] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offers = await api.getOffers({ status: "Accepted" });
      const filtered = filter === "all"
        ? offers
        : filter === "active"
          ? offers.filter((o) => o.onboarding_status !== "Completed")
          : offers.filter((o) => o.onboarding_status === filter);
      setRows(filtered);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load onboarding.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateOnboarding = async (id: number, onboarding_status: string) => {
    setUpdating(id);
    try {
      await api.updateOffer(id, { onboarding_status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update onboarding.");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Onboarding</h1>
        <p className="page-subtitle">Track consultants after accepted offers.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="flex flex-wrap gap-2 mb-4">
        {([["active", "In Progress"], ["all", "All Accepted"], ...ONBOARDING_STATUSES.map((s) => [s, s] as const)] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm font-medium",
              filter === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No onboarding records yet. Accept an <Link href="/ats/offers" className="text-indigo-600 hover:underline">offer</Link> to start onboarding.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Job", "Employee", "Rate", "Start", "Offer Date", "Onboarding", "Update"].map((h) => (
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
                  <td className="px-4 py-3 text-slate-500">{o.start_date ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(o.offer_date)}</td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      o.onboarding_status === "Completed" ? "bg-green-100 text-green-700"
                        : o.onboarding_status === "In Progress" ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600",
                    )}>
                      {o.onboarding_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input text-xs py-1 w-auto"
                      value={o.onboarding_status}
                      disabled={updating === o.id}
                      onChange={(e) => updateOnboarding(o.id, e.target.value)}
                      aria-label="Onboarding status"
                    >
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
