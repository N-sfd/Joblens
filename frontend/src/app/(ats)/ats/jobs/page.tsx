"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, Search, ChevronLeft, ChevronRight, GitCompareArrows } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { JobRequirement, JobRequirementListParams } from "@/types";
import { JOB_REQUIREMENT_STATUSES, JOB_REQUIREMENT_PRIORITIES, JOB_REQUIREMENT_SOURCES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const WORK_TYPES = ["Remote", "Hybrid", "Onsite"];

const PRIORITY_COLORS: Record<string, string> = {
  Low: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Medium: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  High: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Urgent: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  New: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Parsed: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  "Ready for Match": "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  Matched: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  Closed: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const EMPTY: JobRequirementListParams = { q: "", status: "", work_type: "", priority: "", source: "", vendor: "", client: "", page: 1, page_size: 20 };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function displayRate(job: JobRequirement) {
  return job.rate || (job.rate_min && job.rate_max ? `${job.rate_min}–${job.rate_max}` : job.rate_min || job.rate_max) || "—";
}

export default function JobRequirementsPage() {
  const { canWrite } = useAtsRole();
  const [filters, setFilters] = useState<JobRequirementListParams>({ ...EMPTY });
  const [searchInput, setSearchInput] = useState("");
  const [jobs, setJobs] = useState<JobRequirement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: JobRequirementListParams) => {
    setLoading(true);
    try {
      const clean: JobRequirementListParams = { page: params.page ?? 1, page_size: params.page_size ?? 20 };
      if (params.q?.trim()) clean.q = params.q.trim();
      if (params.status) clean.status = params.status;
      if (params.work_type) clean.work_type = params.work_type;
      if (params.priority) clean.priority = params.priority;
      if (params.source) clean.source = params.source;
      if (params.vendor?.trim()) clean.vendor = params.vendor.trim();
      if (params.client?.trim()) clean.client = params.client.trim();
      const res = await api.getJobRequirements(clean);
      const items = Array.isArray(res) ? res : res?.items ?? [];
      setJobs(items);
      setTotal(Array.isArray(res) ? items.length : res?.total ?? items.length);
      setTotalPages(Array.isArray(res) ? 1 : res?.total_pages ?? 1);
      setError(null);
    } catch (e) {
      setJobs([]);
      setTotal(0);
      setTotalPages(1);
      setError(e instanceof Error ? e.message : "Failed to load job requirements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filters); }, [filters, load]);

  const setFilter = (patch: Partial<JobRequirementListParams>) =>
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const hasFilters = Boolean(filters.q || filters.status || filters.work_type || filters.priority || filters.source || filters.vendor || filters.client);

  return (
    <div className="p-4 sm:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Job Requirements</h1>
          <p className="page-subtitle">Job orders from recruiter emails or manual entry.</p>
        </div>
        {canWrite && (
          <Link href="/ats/jobs/new" className="btn-primary flex items-center gap-2 shrink-0">
            <Plus size={16} /> Add Job Requirement
          </Link>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={() => load(filters)} className="mb-4" />}

      <div className="card p-4 mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9 w-full" placeholder="Search title, vendor, client, location…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setFilter({ q: searchInput })} />
          </div>
          <button type="button" className="btn-primary shrink-0" onClick={() => setFilter({ q: searchInput })}>Search</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <select className="input text-sm" aria-label="Status" value={filters.status ?? ""} onChange={(e) => setFilter({ status: e.target.value || undefined })}>
            <option value="">All statuses</option>
            {JOB_REQUIREMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input text-sm" aria-label="Work type" value={filters.work_type ?? ""} onChange={(e) => setFilter({ work_type: e.target.value || undefined })}>
            <option value="">All work types</option>
            {WORK_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <select className="input text-sm" aria-label="Priority" value={filters.priority ?? ""} onChange={(e) => setFilter({ priority: e.target.value || undefined })}>
            <option value="">All priorities</option>
            {JOB_REQUIREMENT_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input text-sm" aria-label="Source" value={filters.source ?? ""} onChange={(e) => setFilter({ source: e.target.value || undefined })}>
            <option value="">All sources</option>
            {JOB_REQUIREMENT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="input text-sm" placeholder="Vendor" value={filters.vendor ?? ""} onChange={(e) => setFilter({ vendor: e.target.value })} />
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && <button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => { setSearchInput(""); setFilters({ ...EMPTY }); }}>Clear filters</button>}
          <span className="text-xs text-slate-400 ml-auto">{total} job{total === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
        ) : jobs.length === 0 ? (
          <div className="py-12 text-center"><p className="text-slate-500 font-medium">No job requirements found.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Job Title", "Vendor", "Client", "Location", "Work Type", "Rate", "Status", "Priority", "Source", "Created", "Actions"].map((h) => (
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
                    <td className="px-3 py-3 text-slate-600">{job.vendor ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-600">{job.client || job.end_client || "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{job.location ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{job.work_type ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{displayRate(job)}</td>
                    <td className="px-3 py-3">
                      <span className={clsx("inline-flex px-2 py-0.5 rounded-full text-xs font-semibold", STATUS_COLORS[job.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200")}>{job.status}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx("inline-flex px-2 py-0.5 rounded-full text-xs font-semibold", PRIORITY_COLORS[job.priority] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200")}>{job.priority}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-500 text-xs">{job.source}</td>
                    <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(job.created_at)}</td>
                    <td className="px-3 py-3">
                      <Link href={`/ats/jobs/${job.id}/matches`} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                        <GitCompareArrows size={13} /> Matches
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
