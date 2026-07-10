"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { JobSend } from "@/types";
import { EMPLOYEE_RESPONSE_VALUES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function responseClass(r: string) {
  switch (r) {
    case "Interested": return "bg-green-100 text-green-700";
    case "Not Interested": return "bg-red-100 text-red-700";
    case "Need More Information": return "bg-amber-100 text-amber-800";
    case "Not Available": return "bg-slate-200 text-slate-600";
    default: return "bg-indigo-100 text-indigo-700";
  }
}

export default function JobSendsPage() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") === "pending" ? "pending" : "all";

  const [sends, setSends] = useState<JobSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(initialFilter);
  const [updating, setUpdating] = useState<number | null>(null);
  const [creatingSubmission, setCreatingSubmission] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === "pending"
        ? { employee_response: "Pending", delivery_status: "Sent" }
        : undefined;
      setSends(await api.getJobSends(params));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job sends.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateResponse = async (id: number, employee_response: string) => {
    setUpdating(id);
    try {
      await api.updateJobSend(id, { employee_response });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update response.");
    } finally {
      setUpdating(null);
    }
  };

  const createSubmission = async (sendId: number) => {
    setCreatingSubmission(sendId);
    try {
      const sub = await api.createSubmissionFromJobSend(sendId);
      window.location.href = `/ats/submissions?highlight=${sub.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create submission.");
    } finally {
      setCreatingSubmission(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Job Sends</h1>
        <p className="page-subtitle">Track jobs sent to employees and record their responses.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="flex gap-2 mb-4">
        {([["all", "All Sends"], ["pending", "Pending Response"]] as const).map(([key, label]) => (
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
      ) : sends.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">No job sends yet. Use <strong>Send Job</strong> on a job&apos;s matches page.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["Job", "Employee", "Sent", "Match", "Status", "Response", "Update", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sends.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/ats/jobs/${s.job_requirement_id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                      {s.job_title ?? `Job #${s.job_requirement_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/ats/employees/${s.employee_id}`} className="text-slate-800 hover:text-indigo-600">
                      {s.employee_name ?? `Employee #${s.employee_id}`}
                    </Link>
                    {s.employee_email && <p className="text-xs text-slate-400">{s.employee_email}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(s.sent_at)}</td>
                  <td className="px-4 py-3">{s.match_score_at_send != null ? `${s.match_score_at_send}%` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{s.delivery_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", responseClass(s.employee_response))}>
                      {s.employee_response}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input text-xs py-1 w-auto"
                      value={s.employee_response}
                      disabled={updating === s.id}
                      onChange={(e) => updateResponse(s.id, e.target.value)}
                      aria-label="Employee response"
                    >
                      {EMPLOYEE_RESPONSE_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {s.employee_response === "Interested" && (
                      <button
                        type="button"
                        className="btn-primary text-xs py-1 px-2"
                        disabled={creatingSubmission === s.id}
                        onClick={() => createSubmission(s.id)}
                      >
                        {creatingSubmission === s.id ? "Creating…" : "Create Submission"}
                      </button>
                    )}
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
