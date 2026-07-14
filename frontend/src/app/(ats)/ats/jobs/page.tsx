"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Loader2, Search, ChevronLeft, ChevronRight, GitCompareArrows, Inbox } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { JobRequirement, JobRequirementListParams } from "@/types";
import { JOB_REQUIREMENT_PRIORITIES, JOB_SORT_OPTIONS, JOB_STATUS_GROUPS } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const WORK_TYPES = ["Remote", "Hybrid", "Onsite"];
const SOURCE_OPTIONS = [
  ["zoho", "Zoho Email"],
  ["manual", "Manual Entry"],
  ["api", "API Import"],
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  Low: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Medium: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  High: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Urgent: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

const STATUS_DISPLAY_COLORS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Open: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  "On Hold": "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Filled: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  Closed: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
};

const EMPTY: JobRequirementListParams = {
  q: "", status_group: "", work_type: "", priority: "", source: "", vendor: "", client: "",
  sort: "last_activity", page: 1, page_size: 20,
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function displayRate(job: JobRequirement) {
  return job.rate || (job.rate_min && job.rate_max ? `${job.rate_min}–${job.rate_max}` : job.rate_min || job.rate_max) || "—";
}

function JobRequirementsPageInner() {
  const { canWrite } = useAtsRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<JobRequirementListParams>(() => ({
    ...EMPTY,
    status_group: searchParams.get("status_group") || "",
    source: searchParams.get("source") || "",
    created_within_days: searchParams.get("created_within_days") ? Number(searchParams.get("created_within_days")) : undefined,
  }));
  const [searchInput, setSearchInput] = useState("");
  const [jobs, setJobs] = useState<JobRequirement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: JobRequirementListParams) => {
    setLoading(true);
    try {
      const clean: JobRequirementListParams = {
        page: params.page ?? 1, page_size: params.page_size ?? 20, sort: params.sort || "last_activity",
      };
      if (params.q?.trim()) clean.q = params.q.trim();
      if (params.status_group) clean.status_group = params.status_group;
      if (params.work_type) clean.work_type = params.work_type;
      if (params.priority) clean.priority = params.priority;
      if (params.source) clean.source = params.source;
      if (params.created_within_days) clean.created_within_days = params.created_within_days;
      if (params.vendor?.trim()) clean.vendor = params.vendor.trim();
      if (params.client?.trim()) clean.client = params.client.trim();
      const res = await api.getJobRequirements(clean);
      setJobs(res.items ?? []);
      setTotal(res.total ?? 0);
      setTotalPages(res.total_pages ?? 1);
      setError(null);
    } catch (e) {
      setJobs([]);
      setTotal(0);
      setTotalPages(1);
      setError(e instanceof Error ? e.message : "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filters); }, [filters, load]);

  const setFilter = (patch: Partial<JobRequirementListParams>) =>
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const hasFilters = Boolean(
    filters.q || filters.status_group || filters.work_type || filters.priority ||
    filters.source || filters.vendor || filters.client || filters.created_within_days,
  );

  return (
    <div className="p-4 sm:p-8 max-w-[1500px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">Job requirements from Zoho, manual entry, and every source in one place.</p>
        </div>
        {canWrite && (
          <div className="flex gap-2 shrink-0">
            <Link href="/ats/email-inbox" className="btn-secondary flex items-center gap-2">
              <Inbox size={16} /> Import from Zoho
            </Link>
            <Link href="/ats/jobs/new" className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Add Job
            </Link>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={() => load(filters)} className="mb-4" />}

      <div className="card p-4 mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9 w-full"
              placeholder="Search title, reference #, client, recruiter…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setFilter({ q: searchInput })}
            />
          </div>
          <button type="button" className="btn-primary shrink-0" onClick={() => setFilter({ q: searchInput })}>Search</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <select className="input text-sm" aria-label="Status group" value={filters.status_group ?? ""} onChange={(e) => setFilter({ status_group: e.target.value || undefined })}>
            <option value="">All statuses</option>
            {JOB_STATUS_GROUPS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input text-sm" aria-label="Work arrangement" value={filters.work_type ?? ""} onChange={(e) => setFilter({ work_type: e.target.value || undefined })}>
            <option value="">All work arrangements</option>
            {WORK_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <select className="input text-sm" aria-label="Priority" value={filters.priority ?? ""} onChange={(e) => setFilter({ priority: e.target.value || undefined })}>
            <option value="">All priorities</option>
            {JOB_REQUIREMENT_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input text-sm" aria-label="Source" value={filters.source ?? ""} onChange={(e) => setFilter({ source: e.target.value || undefined })}>
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <input className="input text-sm" placeholder="Client / company" value={filters.client ?? ""} onChange={(e) => setFilter({ client: e.target.value })} />
          <select className="input text-sm" aria-label="Sort" value={filters.sort ?? "last_activity"} onChange={(e) => setFilter({ sort: e.target.value })}>
            {JOB_SORT_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {hasFilters && (
            <button
              type="button"
              className="text-xs font-semibold text-indigo-600"
              onClick={() => { setSearchInput(""); setFilters({ ...EMPTY }); router.replace("/ats/jobs"); }}
            >
              Clear filters
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{total} job{total === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
        ) : jobs.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-slate-500 font-medium">{hasFilters ? "No jobs match your filters." : "No jobs yet."}</p>
            {canWrite && (
              <div className="flex justify-center gap-4 mt-3">
                <Link href="/ats/email-inbox" className="text-sm text-indigo-600 hover:underline">Import from Zoho</Link>
                <Link href="/ats/jobs/new" className="text-sm text-indigo-600 hover:underline">Add Job Manually</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Job Title", "Client", "Recruiter", "Location", "Arrangement", "Type", "Skills", "Rate", "Source", "Status", "Received", "Candidates", "Submissions", "Last Activity", "Actions"].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <Link href={`/ats/jobs/${job.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">{job.job_title}</Link>
                      {job.job_reference_number && <p className="text-xs text-slate-400">Ref: {job.job_reference_number}</p>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{job.client || job.end_client || "—"}</td>
                    <td className="px-3 py-3 text-slate-600">{job.recruiter_contact_name || job.recruiter_name || "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{job.location ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{job.work_type ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{job.employment_type ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500 max-w-[160px] truncate" title={job.required_skills.join(", ")}>
                      {job.required_skills.slice(0, 2).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{displayRate(job)}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">{job.source_label}</td>
                    <td className="px-3 py-3">
                      <span className={clsx("inline-flex px-2 py-0.5 rounded-full text-xs font-semibold", STATUS_DISPLAY_COLORS[job.status_display] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200")}>{job.status_display}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(job.received_at)}</td>
                    <td className="px-3 py-3 text-slate-600 text-center">{job.candidate_count}</td>
                    <td className="px-3 py-3 text-slate-600 text-center">{job.submission_count}</td>
                    <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">{formatRelative(job.last_activity_at)}</td>
                    <td className="px-3 py-3">
                      <Link href={`/ats/jobs/${job.id}/matches`} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                        <GitCompareArrows size={13} /> Match
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">Page {filters.page} of {totalPages}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary text-xs py-1.5 flex items-center gap-1" disabled={(filters.page ?? 1) <= 1} onClick={() => setFilter({ page: (filters.page ?? 1) - 1 })}><ChevronLeft size={14} /> Previous</button>
              <button type="button" className="btn-secondary text-xs py-1.5 flex items-center gap-1" disabled={(filters.page ?? 1) >= totalPages} onClick={() => setFilter({ page: (filters.page ?? 1) + 1 })}>Next <ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function JobRequirementsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <JobRequirementsPageInner />
    </Suspense>
  );
}
