"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertTriangle, Send } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { JobRequirement, JobEmployeeMatch } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function scoreColor(score: number) {
  if (score >= 75) return "text-green-700 bg-green-50";
  if (score >= 50) return "text-amber-700 bg-amber-50";
  return "text-slate-600 bg-slate-100";
}

export default function JobMatchesPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params.id);

  const [job, setJob] = useState<JobRequirement | null>(null);
  const [matches, setMatches] = useState<JobEmployeeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [j, m] = await Promise.all([
        api.getJobRequirement(jobId),
        api.getJobEmployeeMatches(jobId, minScore),
      ]);
      setJob(j);
      setMatches(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load matches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [jobId, minScore]);

  if (loading && !job) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Link href={`/ats/jobs/${jobId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Job
      </Link>

      <div className="mb-6">
        <p className="page-kicker">Job Matches</p>
        <h1 className="page-title">{job?.job_title ?? "Loading…"}</h1>
        <p className="page-subtitle">Weighted match against eligible employees and their primary resumes.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="card p-4 mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600 flex items-center gap-2">
          Min score:
          <select className="input w-auto text-sm" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} aria-label="Minimum match score">
            {[0, 40, 50, 60, 70, 80].map((s) => <option key={s} value={s}>{s}%</option>)}
          </select>
        </label>
        <p className="text-xs text-slate-400 ml-auto">
          Scoring: required skills 35% · title 15% · experience 15% · industry 10% · work auth 10% · location 5% · availability 5% · rate 5%
        </p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
        ) : matches.length === 0 ? (
          <div className="py-12 text-center text-slate-500">No matches above {minScore}%.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Employee", "Score", "Primary Skill", "Matching Skills", "Missing Skills", "Work Auth", "Availability", "Rate", "Warnings", ""].map((h) => (
                    <th key={h || "actions"} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matches.map((m) => (
                  <tr key={m.employee_id} className="hover:bg-slate-50 align-top">
                    <td className="px-3 py-3">
                      <Link href={`/ats/employees/${m.employee_id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">{m.employee_name}</Link>
                      <p className="text-xs text-slate-400 mt-0.5">{m.total_experience ?? "—"} yrs</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx("inline-flex px-2 py-1 rounded-lg text-sm font-bold", scoreColor(m.match_score))}>{m.match_score}%</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{m.primary_skill ?? "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {m.matching_skills.slice(0, 4).map((s) => (
                          <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-green-50 text-green-700">{s}</span>
                        ))}
                        {m.matching_skills.length > 4 && <span className="text-[11px] text-slate-400">+{m.matching_skills.length - 4}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {m.missing_skills.slice(0, 3).map((s) => (
                          <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-700">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-500 text-xs">{m.work_authorization ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs">{m.availability ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">{m.expected_rate ?? "—"}</td>
                    <td className="px-3 py-3">
                      {m.compatibility_warnings.length > 0 ? (
                        <span className="text-xs text-amber-700 flex items-start gap-1 max-w-[160px]" title={m.compatibility_warnings.join("; ")}>
                          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                          {m.compatibility_warnings[0]}
                        </span>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" disabled title="Send job workflow coming in Phase 7" className="btn-secondary text-xs py-1 px-2 flex items-center gap-1 opacity-50 cursor-not-allowed">
                        <Send size={12} /> Send Job
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
