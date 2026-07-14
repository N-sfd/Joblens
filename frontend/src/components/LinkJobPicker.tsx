"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { JobRequirement } from "@/types";

export default function LinkJobPicker({
  onLink,
  onClose,
}: {
  onLink: (job: JobRequirement) => void | Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JobRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.getJobRequirements({ q: query || undefined, page: 1, page_size: 8 });
        if (active) setResults(res.items);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to search jobs.");
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [query]);

  const pick = async (job: JobRequirement) => {
    setLinkingId(job.id);
    setError(null);
    try {
      await onLink(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link job.");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24">
      <div className="card w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Link2 size={16} className="text-indigo-600" /> Link to Existing Job
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <input
          autoFocus
          className="input w-full"
          placeholder="Search jobs by title, client, recruiter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-indigo-500" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No matching jobs.</p>
          ) : (
            results.map((job) => (
              <button
                key={job.id}
                type="button"
                disabled={linkingId !== null}
                onClick={() => pick(job)}
                className="w-full text-left px-2 py-3 hover:bg-slate-50 rounded-lg flex items-center justify-between gap-3 disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{job.job_title}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {[job.client, job.vendor].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {linkingId === job.id ? (
                  <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" />
                ) : (
                  <span className="text-xs font-medium text-indigo-600 shrink-0">Link</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
