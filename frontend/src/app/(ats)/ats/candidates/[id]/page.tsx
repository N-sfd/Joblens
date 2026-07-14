"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Pencil, Trash2, Upload, GitCompareArrows, Send, MoreHorizontal,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { CandidateCounts, Employee } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import EmployeeResumeManager from "@/components/EmployeeResumeManager";
import { useAtsRole } from "@/lib/atsRole";

const TABS = [
  "overview", "resumes", "matches", "submissions", "interviews", "offers", "activity",
] as const;
type Tab = (typeof TABS)[number];

const STATUS_COLORS: Record<string, string> = {
  New: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  Active: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Submitted: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  Interviewing: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  Offered: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  Placed: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  Rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
  Inactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Bench: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

function Field({ label, value }: { label: string; value?: string | null | number }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5 break-words">{value ?? "—"}</p>
    </div>
  );
}

function fullName(e: Employee): string {
  const parts = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ").trim();
  return parts || e.name;
}

function CandidateDetailInner() {
  const params = useParams<{ id: string }>();
  const candidateId = Number(params.id);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin, canWrite } = useAtsRole();
  const tabParam = (searchParams.get("tab") || "overview").toLowerCase();
  const tab = (TABS.includes(tabParam as Tab) ? tabParam : "overview") as Tab;

  const [candidate, setCandidate] = useState<Employee | null>(null);
  const [counts, setCounts] = useState<CandidateCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [matching, setMatching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [matches, setMatches] = useState<Record<string, unknown>[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, unknown>[]>([]);
  const [interviews, setInterviews] = useState<Record<string, unknown>[]>([]);
  const [offers, setOffers] = useState<Record<string, unknown>[]>([]);
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);

  const setTab = (t: Tab) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (t === "overview") sp.delete("tab");
    else sp.set("tab", t);
    const qs = sp.toString();
    router.replace(qs ? `/ats/candidates/${candidateId}?${qs}` : `/ats/candidates/${candidateId}`, { scroll: false });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, ct] = await Promise.all([
        api.getCandidate(candidateId),
        api.getCandidateCounts(candidateId).catch(() => null),
      ]);
      setCandidate(c);
      setCounts(ct);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidate.");
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!candidate) return;
    let cancelled = false;
    const run = async () => {
      setTabError(null);
      try {
        if (tab === "matches") {
          const rows = await api.getCandidateMatches(candidateId);
          if (!cancelled) setMatches(rows as Record<string, unknown>[]);
        } else if (tab === "submissions") {
          const rows = await api.getCandidateSubmissions(candidateId);
          if (!cancelled) setSubmissions(rows as Record<string, unknown>[]);
        } else if (tab === "interviews") {
          const rows = await api.getCandidateInterviews(candidateId);
          if (!cancelled) setInterviews(rows as Record<string, unknown>[]);
        } else if (tab === "offers") {
          const rows = await api.getCandidateOffers(candidateId);
          if (!cancelled) setOffers(rows as Record<string, unknown>[]);
        } else if (tab === "activity") {
          const rows = await api.getCandidateActivities(candidateId);
          if (!cancelled) setActivities(rows as Record<string, unknown>[]);
        }
      } catch (e) {
        if (!cancelled) setTabError(e instanceof Error ? e.message : "Failed to load tab.");
      }
    };
    if (tab !== "overview" && tab !== "resumes") run();
    return () => { cancelled = true; };
  }, [tab, candidate, candidateId]);

  const runMatch = async () => {
    setMatching(true);
    setTabError(null);
    try {
      const rows = await api.runCandidateMatches(candidateId, { save: true });
      setMatches(rows as Record<string, unknown>[]);
      setTab("matches");
      const ct = await api.getCandidateCounts(candidateId).catch(() => null);
      setCounts(ct);
    } catch (e) {
      setTabError(e instanceof Error ? e.message : "Match failed.");
    } finally {
      setMatching(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this candidate? Only allowed when there is no placement history.")) return;
    setDeleting(true);
    try {
      await api.deleteCandidate(candidateId);
      router.push("/ats/candidates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete candidate.");
      setDeleting(false);
    }
  };

  const archive = async () => {
    try {
      await api.updateCandidateStatus(candidateId, "Inactive");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive.");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }
  if (error && !candidate) {
    return <div className="p-4 sm:p-8 max-w-4xl mx-auto"><ErrorBanner message={error} onRetry={load} /></div>;
  }
  if (!candidate) return null;

  const display = candidate.status_display || candidate.status;
  const subtitle = [candidate.current_job_title, candidate.primary_skill, candidate.current_location || candidate.location]
    .filter(Boolean).join(" · ");

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Link href="/ats/candidates" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Candidates
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <p className="page-kicker">Candidate</p>
          <h1 className="page-title">{fullName(candidate)}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={clsx(
              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
              STATUS_COLORS[display] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
            )}>
              {display}
            </span>
            {display !== candidate.status && (
              <span className="text-xs text-slate-400">raw: {candidate.status}</span>
            )}
            {counts && (
              <span className="text-xs text-slate-400">
                {counts.resumes} resumes · {counts.matches} matches · {counts.active_submissions} submissions
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 relative">
          {canWrite && (
            <>
              <button type="button" onClick={() => setTab("resumes")} className="btn-secondary flex items-center gap-2 text-sm">
                <Upload size={14} /> Upload Resume
              </button>
              <button type="button" onClick={runMatch} disabled={matching} className="btn-secondary flex items-center gap-2 text-sm">
                {matching ? <Loader2 size={14} className="animate-spin" /> : <GitCompareArrows size={14} />} Match to Jobs
              </button>
              <Link href={`/ats/pipeline?employee_id=${candidateId}`} className="btn-secondary flex items-center gap-2 text-sm">
                <Send size={14} /> Create Submission
              </Link>
              <Link href={`/ats/candidates/${candidateId}/edit`} className="btn-primary flex items-center gap-2 text-sm">
                <Pencil size={14} /> Edit
              </Link>
            </>
          )}
          <button type="button" className="btn-secondary p-2" onClick={() => setMenuOpen((o) => !o)} aria-label="More actions">
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-20 w-48 rounded-lg border border-slate-200 bg-white shadow-lg text-sm overflow-hidden">
              {canWrite && (
                <button type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => { setMenuOpen(false); archive(); }}>
                  Archive / Inactive
                </button>
              )}
              {isAdmin && (
                <button type="button" className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-700" disabled={deleting} onClick={() => { setMenuOpen(false); remove(); }}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="overflow-x-auto mb-4 -mx-1 px-1">
        <div className="flex gap-1 min-w-max border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={clsx(
                "px-3 py-2 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors",
                tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tabError && tab !== "overview" && tab !== "resumes" && (
        <ErrorBanner message={tabError} onDismiss={() => setTabError(null)} className="mb-4" />
      )}

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="card p-6 space-y-5">
            <h2 className="font-bold text-slate-800">Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Email" value={candidate.email} />
              <Field label="Phone" value={candidate.phone} />
              <Field label="Current title" value={candidate.current_job_title} />
              <Field label="Experience" value={candidate.total_experience} />
              <Field label="Location" value={candidate.current_location || candidate.location} />
              <Field label="Preferred locations" value={candidate.preferred_locations} />
              <Field label="Work authorization" value={candidate.work_authorization} />
              <Field label="Visa status" value={candidate.visa_status} />
              <Field label="Desired rate" value={candidate.expected_rate} />
              <Field label="Availability" value={candidate.availability} />
              <Field label="Work preference" value={candidate.remote_preference} />
              <Field label="Source" value={candidate.source} />
              <Field label="LinkedIn" value={candidate.linkedin_url} />
              <Field label="Owner" value={candidate.created_by} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Skills</p>
              <p className="text-sm text-slate-800 mt-0.5">
                {[candidate.primary_skill, candidate.secondary_skills].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Summary / notes</p>
              <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{candidate.notes || "—"}</p>
            </div>
          </div>
        </div>
      )}

      {tab === "resumes" && (
        <div>
          <EmployeeResumeManager employeeId={candidateId} onEmployeeUpdated={(e) => setCandidate(e)} />
        </div>
      )}

      {tab === "matches" && (
        <div className="card overflow-hidden">
          {matches.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-slate-600 font-medium">No job matches</p>
              {canWrite && (
                <button type="button" className="btn-primary mt-3 text-sm" onClick={runMatch} disabled={matching}>
                  Match to Jobs
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3 hidden md:table-cell">Recommendation</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => {
                  const jobId = m.job_requirement_id as number;
                  return (
                    <tr key={(m.id as number) ?? i} className="border-b border-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/ats/jobs/${jobId}`} className="font-medium text-indigo-600 hover:underline">
                          {(m.job_title as string) || `Job #${jobId}`}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{(m.client as string) || "—"}</td>
                      <td className="px-4 py-3 font-semibold">{m.match_score != null ? `${m.match_score}%` : "—"}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-xs max-w-xs truncate">
                        {(m.match_reason as string) || (m.recommendation as string) || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/ats/pipeline?employee_id=${candidateId}&job_requirement_id=${jobId}`} className="text-xs text-indigo-600 hover:underline">
                          Create Submission
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "submissions" && (
        <RelatedTable
          empty="No submissions"
          rows={submissions}
          columns={["job_title", "client", "status", "submitted_at"]}
          idKey="id"
          link={(r) => `/ats/pipeline/${r.id}`}
        />
      )}

      {tab === "interviews" && (
        <RelatedTable
          empty="No interviews"
          rows={interviews}
          columns={["interview_date", "interview_type", "status", "interviewer_name"]}
          idKey="id"
          link={(r) => `/ats/pipeline/${(r.submission_id as number) || ""}`}
        />
      )}

      {tab === "offers" && (
        <RelatedTable
          empty="No offers"
          rows={offers}
          columns={["offered_title", "offered_rate", "status", "offer_date"]}
          idKey="id"
          link={(r) => `/ats/pipeline/${(r.submission_id as number) || ""}`}
        />
      )}

      {tab === "activity" && (
        <div className="card p-4">
          {activities.length === 0 ? (
            <p className="py-8 text-center text-slate-500">No activity</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activities.map((a) => (
                <li key={a.id as number} className="py-3">
                  <p className="text-sm font-medium text-slate-800">
                    {(a.subject as string) || (a.activity_type as string)}
                  </p>
                  {(a.description as string) && (
                    <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{a.description as string}</p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">
                    {a.activity_date ? new Date(a.activity_date as string).toLocaleString() : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RelatedTable({
  empty, rows, columns, link,
}: {
  empty: string;
  rows: Record<string, unknown>[];
  columns: string[];
  idKey: string;
  link: (r: Record<string, unknown>) => string;
}) {
  if (rows.length === 0) {
    return <div className="card py-10 text-center text-slate-500">{empty}</div>;
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
            {columns.map((c) => <th key={c} className="px-4 py-3">{c.replace(/_/g, " ")}</th>)}
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={(r.id as number) ?? i} className="border-b border-slate-50">
              {columns.map((c) => (
                <td key={c} className="px-4 py-3 text-slate-700">
                  {r[c] != null ? String(r[c]) : "—"}
                </td>
              ))}
              <td className="px-4 py-3 text-right">
                <Link href={link(r)} className="text-xs text-indigo-600 hover:underline">View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CandidateDetailPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>}>
      <CandidateDetailInner />
    </Suspense>
  );
}
