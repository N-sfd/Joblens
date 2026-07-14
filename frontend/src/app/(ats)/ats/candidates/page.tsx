"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Loader2, Search, ChevronLeft, ChevronRight, Upload, Pencil, Archive, MoreHorizontal, UserRound, FileUp,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { EmployeeListItem, EmployeeListParams } from "@/types";
import {
  CANDIDATE_DISPLAY_STATUSES, EMPLOYEE_AVAILABILITIES, CANDIDATE_SORT_OPTIONS,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const STATUS_DISPLAY_COLORS: Record<string, string> = {
  New: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  Active: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Submitted: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  Interviewing: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  Offered: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  Placed: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  Rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
  Inactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const RESUME_STATUS_COLORS: Record<string, string> = {
  None: "bg-slate-100 text-slate-500",
  Parsed: "bg-green-50 text-green-700",
  Failed: "bg-amber-50 text-amber-700",
};

const EMPTY_FILTERS: EmployeeListParams = {
  q: "",
  status_group: "",
  status: "",
  availability: "",
  work_authorization: "",
  visa_status: "",
  primary_skill: "",
  location: "",
  source: "",
  has_resume: undefined,
  has_matches: undefined,
  has_submissions: undefined,
  sort: "last_activity",
  page: 1,
  page_size: 20,
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRelative(iso: string | null | undefined) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function displayName(emp: EmployeeListItem): string {
  const parts = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim();
  return parts || emp.name;
}

function CandidatesPageInner() {
  const router = useRouter();
  const { canWrite } = useAtsRole();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<EmployeeListParams>(() => ({
    ...EMPTY_FILTERS,
    status_group: searchParams.get("status_group") || "",
    status: searchParams.get("status") || "",
    has_submissions: searchParams.get("has_submissions") === "true" ? true
      : searchParams.get("has_submissions") === "false" ? false : undefined,
    has_resume: searchParams.get("has_resume") === "true" ? true
      : searchParams.get("has_resume") === "false" ? false : undefined,
    has_matches: searchParams.get("has_matches") === "true" ? true
      : searchParams.get("has_matches") === "false" ? false : undefined,
    sort: searchParams.get("sort") || "last_activity",
    q: searchParams.get("q") || "",
  }));
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const [candidates, setCandidates] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const syncUrl = useCallback((params: EmployeeListParams) => {
    const sp = new URLSearchParams();
    if (params.q?.trim()) sp.set("q", params.q.trim());
    if (params.status_group) sp.set("status_group", params.status_group);
    if (params.status) sp.set("status", params.status);
    if (params.availability) sp.set("availability", params.availability);
    if (params.work_authorization?.trim()) sp.set("work_authorization", params.work_authorization.trim());
    if (params.visa_status?.trim()) sp.set("visa_status", params.visa_status.trim());
    if (params.primary_skill?.trim()) sp.set("skills", params.primary_skill.trim());
    if (params.location?.trim()) sp.set("location", params.location.trim());
    if (params.source?.trim()) sp.set("source", params.source.trim());
    if (params.has_resume !== undefined) sp.set("has_resume", String(params.has_resume));
    if (params.has_matches !== undefined) sp.set("has_matches", String(params.has_matches));
    if (params.has_submissions !== undefined) sp.set("has_submissions", String(params.has_submissions));
    if (params.sort && params.sort !== "last_activity") sp.set("sort", params.sort);
    if (params.page && params.page > 1) sp.set("page", String(params.page));
    const qs = sp.toString();
    router.replace(qs ? `/ats/candidates?${qs}` : "/ats/candidates", { scroll: false });
  }, [router]);

  const load = useCallback(async (params: EmployeeListParams) => {
    setLoading(true);
    try {
      const clean: EmployeeListParams = {
        page: params.page ?? 1,
        page_size: params.page_size ?? 20,
        sort: params.sort || "last_activity",
      };
      if (params.q?.trim()) clean.q = params.q.trim();
      if (params.status_group) clean.status_group = params.status_group;
      if (params.status) clean.status = params.status;
      if (params.availability) clean.availability = params.availability;
      if (params.work_authorization?.trim()) clean.work_authorization = params.work_authorization.trim();
      if (params.visa_status?.trim()) clean.visa_status = params.visa_status.trim();
      if (params.primary_skill?.trim()) clean.primary_skill = params.primary_skill.trim();
      if (params.location?.trim()) clean.location = params.location.trim();
      if (params.source?.trim()) clean.source = params.source.trim();
      if (params.has_resume !== undefined) clean.has_resume = params.has_resume;
      if (params.has_matches !== undefined) clean.has_matches = params.has_matches;
      if (params.has_submissions !== undefined) clean.has_submissions = params.has_submissions;

      const res = await api.getCandidates(clean);
      setCandidates(res.items);
      setTotal(res.total);
      setTotalPages(res.total_pages);
      setError(null);
      syncUrl(params);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidates.");
    } finally {
      setLoading(false);
    }
  }, [syncUrl]);

  useEffect(() => { load(filters); }, [filters, load]);

  const setFilter = (patch: Partial<EmployeeListParams>) =>
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const clearFilters = () => {
    setSearchInput("");
    setFilters({ ...EMPTY_FILTERS });
  };

  const hasActiveFilters = Boolean(
    filters.q || filters.status_group || filters.status || filters.availability ||
    filters.work_authorization || filters.visa_status || filters.primary_skill ||
    filters.location || filters.source || filters.has_resume !== undefined ||
    filters.has_matches !== undefined || filters.has_submissions !== undefined
  );

  const handleArchive = async (emp: EmployeeListItem) => {
    setStatusBusyId(emp.id);
    setOpenMenuId(null);
    try {
      await api.updateCandidateStatus(emp.id, "Inactive");
      await load(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive candidate.");
    } finally {
      setStatusBusyId(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Candidates</h1>
          <p className="page-subtitle">Candidates, consultants, and resumes in one place.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/ats/candidates/new?mode=resume" className="btn-secondary flex items-center gap-2">
              <FileUp size={16} /> Upload Resume
            </Link>
            <Link href="/ats/candidates/new" className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Add Candidate
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
              placeholder="Search name, email, phone, title, skills, location…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setFilter({ q: searchInput })}
            />
          </div>
          <button type="button" className="btn-primary shrink-0" onClick={() => setFilter({ q: searchInput })}>
            Search
          </button>
          <button
            type="button"
            className="btn-secondary shrink-0 sm:hidden"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            Filters
          </button>
        </div>

        <div className={clsx("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2", !filtersOpen && "hidden sm:grid")}>
          <select
            className="input text-sm"
            value={filters.status_group ?? ""}
            onChange={(e) => setFilter({ status_group: e.target.value || undefined, status: undefined })}
            aria-label="Status group"
          >
            <option value="">All status groups</option>
            <option value="active">Active pipeline</option>
            {CANDIDATE_DISPLAY_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="input text-sm"
            value={filters.availability ?? ""}
            onChange={(e) => setFilter({ availability: e.target.value || undefined })}
            aria-label="Availability"
          >
            <option value="">All availability</option>
            {EMPLOYEE_AVAILABILITIES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            className="input text-sm"
            placeholder="Work authorization"
            value={filters.work_authorization ?? ""}
            onChange={(e) => setFilter({ work_authorization: e.target.value })}
          />
          <input
            className="input text-sm"
            placeholder="Visa type"
            value={filters.visa_status ?? ""}
            onChange={(e) => setFilter({ visa_status: e.target.value })}
          />
          <input
            className="input text-sm"
            placeholder="Skills"
            value={filters.primary_skill ?? ""}
            onChange={(e) => setFilter({ primary_skill: e.target.value })}
          />
          <input
            className="input text-sm"
            placeholder="Location"
            value={filters.location ?? ""}
            onChange={(e) => setFilter({ location: e.target.value })}
          />
          <input
            className="input text-sm"
            placeholder="Source"
            value={filters.source ?? ""}
            onChange={(e) => setFilter({ source: e.target.value })}
          />
          <select
            className="input text-sm"
            value={filters.sort ?? "last_activity"}
            onChange={(e) => setFilter({ sort: e.target.value })}
            aria-label="Sort"
          >
            {CANDIDATE_SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "has_resume" as const, label: "With resumes", on: true },
            { key: "has_resume" as const, label: "No resume", on: false },
            { key: "has_matches" as const, label: "With matches", on: true },
            { key: "has_submissions" as const, label: "With submissions", on: true },
          ].map((chip) => {
            const active = filters[chip.key] === chip.on;
            return (
              <button
                key={`${chip.key}-${chip.on}`}
                type="button"
                className={clsx(
                  "text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors",
                  active ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
                onClick={() => setFilter({ [chip.key]: active ? undefined : chip.on })}
              >
                {chip.label}
              </button>
            );
          })}
          {hasActiveFilters && (
            <button type="button" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{total} candidate{total === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="py-12 text-center">
            <UserRound className="mx-auto text-slate-300 mb-3" size={36} />
            <p className="text-slate-600 font-medium">
              {hasActiveFilters ? "No candidates match filters" : "No candidates yet"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {hasActiveFilters ? "Try clearing filters." : "Add a candidate manually or upload a resume."}
            </p>
            {canWrite && !hasActiveFilters && (
              <div className="flex justify-center gap-2 mt-4">
                <Link href="/ats/candidates/new" className="btn-primary text-sm">Add Candidate</Link>
                <Link href="/ats/candidates/new?mode=resume" className="btn-secondary text-sm">Upload Resume</Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 font-semibold">Candidate</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Title</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Location</th>
                    <th className="px-4 py-3 font-semibold hidden xl:table-cell">Auth</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold hidden sm:table-cell">Resume</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Matches</th>
                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Subs</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Activity</th>
                    <th className="px-4 py-3 font-semibold w-12" />
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((emp) => {
                    const display = emp.status_display || emp.status;
                    return (
                      <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <Link href={`/ats/candidates/${emp.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800 block">
                            {displayName(emp)}
                          </Link>
                          <p className="text-xs text-slate-400 truncate max-w-[220px]">{emp.email}</p>
                          {emp.phone && <p className="text-xs text-slate-400">{emp.phone}</p>}
                          {emp.primary_skill && (
                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{emp.primary_skill}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 hidden md:table-cell">
                          {emp.current_job_title || "—"}
                          {emp.total_experience && (
                            <p className="text-xs text-slate-400">{emp.total_experience} yrs</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                          {emp.current_location || emp.location || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">
                          {emp.work_authorization || emp.visa_status || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                            STATUS_DISPLAY_COLORS[display] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                          )}>
                            {display}
                          </span>
                          {display !== emp.status && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{emp.status}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={clsx(
                            "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                            RESUME_STATUS_COLORS[emp.resume_status] ?? RESUME_STATUS_COLORS.None,
                          )}>
                            {emp.resume_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{emp.match_count ?? 0}</td>
                        <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{emp.submission_count ?? 0}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                          {formatRelative(emp.last_activity_at || emp.updated_at)}
                        </td>
                        <td className="px-4 py-3 relative">
                          <div className="flex items-center gap-1 justify-end">
                            <Link
                              href={`/ats/candidates/${emp.id}`}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50"
                              title="View"
                            >
                              <UserRound size={14} />
                            </Link>
                            {canWrite && (
                              <>
                                <Link
                                  href={`/ats/candidates/${emp.id}/edit`}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 hidden sm:inline-flex"
                                  title="Edit"
                                >
                                  <Pencil size={14} />
                                </Link>
                                <Link
                                  href={`/ats/candidates/${emp.id}?tab=resumes`}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 hidden sm:inline-flex"
                                  title="Upload Resume"
                                >
                                  <Upload size={14} />
                                </Link>
                              </>
                            )}
                            <button
                              type="button"
                              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                              onClick={() => setOpenMenuId(openMenuId === emp.id ? null : emp.id)}
                              aria-label="More actions"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                          {openMenuId === emp.id && (
                            <div className="absolute right-4 top-10 z-20 w-44 rounded-lg border border-slate-200 bg-white shadow-lg text-sm overflow-hidden">
                              <Link href={`/ats/candidates/${emp.id}`} className="block px-3 py-2 hover:bg-slate-50 text-slate-700" onClick={() => setOpenMenuId(null)}>
                                View Profile
                              </Link>
                              {canWrite && (
                                <>
                                  <Link href={`/ats/candidates/${emp.id}/edit`} className="block px-3 py-2 hover:bg-slate-50 text-slate-700" onClick={() => setOpenMenuId(null)}>
                                    Edit
                                  </Link>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                                    disabled={statusBusyId === emp.id}
                                    onClick={() => handleArchive(emp)}
                                  >
                                    <Archive size={12} /> Archive
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <button
                  type="button"
                  className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-40"
                  disabled={(filters.page ?? 1) <= 1}
                  onClick={() => setFilter({ page: (filters.page ?? 1) - 1 })}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-xs text-slate-500">Page {filters.page ?? 1} of {totalPages}</span>
                <button
                  type="button"
                  className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-40"
                  disabled={(filters.page ?? 1) >= totalPages}
                  onClick={() => setFilter({ page: (filters.page ?? 1) + 1 })}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>}>
      <CandidatesPageInner />
    </Suspense>
  );
}
