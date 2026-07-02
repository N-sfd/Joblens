"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { CRMActivity } from "@/types";
import { ACTIVITY_TYPES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setActivities(await api.getActivities(typeFilter ? { activity_type: typeFilter } : undefined));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activities.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [typeFilter]);

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">CRM</p>
        <h1 className="page-title">Activities</h1>
        <p className="page-subtitle">A unified feed of interactions across the CRM.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="flex gap-3 mb-4">
        <select className="input sm:w-64" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All activity types</option>
          {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {typeFilter && <button className="btn-secondary" onClick={() => setTypeFilter("")}>Clear</button>}
      </div>

      <div className="card p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-indigo-500" />
          </div>
        ) : activities.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No activities yet.</p>
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-3 border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-indigo-600">{a.activity_type}</span>
                    <span className="text-xs text-slate-400">{new Date(a.activity_date).toLocaleString()}</span>
                  </div>
                  {a.subject && <p className="text-sm font-medium text-slate-800">{a.subject}</p>}
                  {a.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
