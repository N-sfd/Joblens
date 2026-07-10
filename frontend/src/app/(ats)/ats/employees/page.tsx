"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Loader2, Search, ChevronLeft, ChevronRight, Upload, Pencil, Archive, MoreHorizontal, UserRound, FileUp,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { EmployeeListItem, EmployeeListParams } from "@/types";
import {
  EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, EMPLOYEE_AVAILABILITIES,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Bench: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  "On Project": "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  "Available Soon": "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  Inactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  "Do Not Contact": "bg-red-50 text-red-700 ring-1 ring-red-200",
  "Former Employee": "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const RESUME_STATUS_COLORS: Record<string, string> = {
  None: "bg-slate-100 text-slate-500",
  Parsed: "bg-green-50 text-green-700",
  Failed: "bg-amber-50 text-amber-700",
};

const ARCHIVED = new Set(["Inactive", "Former Employee", "Do Not Contact"]);

const EMPTY_FILTERS: EmployeeListParams = {
  q: "",
  status: "",
  availability: "",
  work_authorization: "",
  primary_skill: "",
  location: "",
  employment_type: "",
  archived: undefined,
  page: 1,
  page_size: 20,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function displayName(emp: EmployeeListItem): string {
  const parts = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim();
  return parts || emp.name;
}

export default function EmployeesPage() {
  const router = useRouter();
  const { canWrite } = useAtsRole();
  const [filters, setFilters] = useState<EmployeeListParams>({ ...EMPTY_FILTERS });
  const [searchInput, setSearchInput] = useState("");
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);

  const load = useCallback(async (params: EmployeeListParams) => {
    setLoading(true);
    try {
      const clean: EmployeeListParams = { page: params.page ?? 1, page_size: params.page_size ?? 20 };
      if (params.q?.trim()) clean.q = params.q.trim();
      if (params.status) clean.status = params.status;
      if (params.availability) clean.availability = params.availability;
      if (params.work_authorization?.trim()) clean.work_authorization = params.work_authorization.trim();
      if (params.primary_skill?.trim()) clean.primary_skill = params.primary_skill.trim();
      if (params.location?.trim()) clean.location = params.location.trim();
      if (params.employment_type) clean.employment_type = params.employment_type;
      if (params.archived !== undefined) clean.archived = params.archived;

      const res = await api.getEmployees(clean);
      setEmployees(res.items);
      setTotal(res.total);
      setTotalPages(res.total_pages);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filters); }, [filters, load]);

  const setFilter = (patch: Partial<EmployeeListParams>) =>
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const clearFilters = () => {
    setSearchInput("");
    setFilters({ ...EMPTY_FILTERS });
  };

  const hasActiveFilters = Boolean(
    filters.q || filters.status || filters.availability || filters.work_authorization ||
    filters.primary_skill || filters.location || filters.employment_type || filters.archived !== undefined
  );

  const handleArchive = async (emp: EmployeeListItem) => {
    setStatusBusyId(emp.id);
    setOpenMenuId(null);
    try {
      await api.updateEmployeeStatus(emp.id, "Inactive");
      await load(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive employee.");
    } finally {
      setStatusBusyId(null);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Consultants and employees available for job matching.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/ats/employees/new-from-resume" className="btn-secondary flex items-center gap-2">
              <FileUp size={16} /> Add from Resume
            </Link>
            <Link href="/ats/employees/new" className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Add Employee
            </Link>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={() => load(filters)} className="mb-4" />}

      {/* Filters */}
      <div className="card p-4 mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9 w-full"
              placeholder="Search name, email, skill, location…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setFilter({ q: searchInput })}
            />
          </div>
          <button type="button" className="btn-primary shrink-0" onClick={() => setFilter({ q: searchInput })}>
            Search
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <select className="input text-sm" value={filters.status ?? ""} onChange={(e) => setFilter({ status: e.target.value || undefined })} aria-label="Status filter">
            <option value="">All statuses</option>
            {EMPLOYEE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input text-sm" value={filters.availability ?? ""} onChange={(e) => setFilter({ availability: e.target.value || undefined })} aria-label="Availability filter">
            <option value="">All availability</option>
            {EMPLOYEE_AVAILABILITIES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="input text-sm" placeholder="Work authorization" value={filters.work_authorization ?? ""} onChange={(e) => setFilter({ work_authorization: e.target.value })} />
          <input className="input text-sm" placeholder="Primary skill" value={filters.primary_skill ?? ""} onChange={(e) => setFilter({ primary_skill: e.target.value })} />
          <input className="input text-sm" placeholder="Location" value={filters.location ?? ""} onChange={(e) => setFilter({ location: e.target.value })} />
          <select className="input text-sm" value={filters.employment_type ?? ""} onChange={(e) => setFilter({ employment_type: e.target.value || undefined })} aria-label="Employment type filter">
            <option value="">All types</option>
            {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={clsx("text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors",
              filters.archived === false ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
            onClick={() => setFilter({ archived: filters.archived === false ? undefined : false })}
          >
            Active only
          </button>
          <button
            type="button"
            className={clsx("text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors",
              filters.archived === true ? "bg-slate-200 border-slate-300 text-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
            onClick={() => setFilter({ archived: filters.archived === true ? undefined : true })}
          >
            Archived only
          </button>
          {hasActiveFilters && (
            <button type="button" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 ml-auto" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{total} employee{total === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : employees.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-500 font-medium">{hasActiveFilters ? "No employees match your filters." : "No employees yet."}</p>
            {!hasActiveFilters && <p className="text-slate-400 text-sm mt-1">Add your first employee to get started.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Employee", "Primary Skill", "Experience", "Location", "Work Auth", "Availability", "Expected Rate", "Status", "Resume", "Updated", "Actions"].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3">
                      <Link href={`/ats/employees/${emp.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800 block">
                        {displayName(emp)}
                      </Link>
                      <span className="text-xs text-slate-400">{emp.email}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{emp.primary_skill ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{emp.total_experience ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{emp.current_location || emp.location || "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{emp.work_authorization || emp.visa_status || "—"}</td>
                    <td className="px-3 py-3 text-slate-500">{emp.availability ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{emp.expected_rate ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className={clsx(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap",
                        STATUS_COLORS[emp.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                      )}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={clsx(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                        RESUME_STATUS_COLORS[emp.resume_status] ?? RESUME_STATUS_COLORS.None
                      )}>
                        {emp.resume_status === "None" ? "No resume" : emp.resume_status}
                      </span>
                      {emp.resume_count > 0 && (
                        <span className="block text-[11px] text-slate-400 mt-0.5">{emp.resume_count} file{emp.resume_count === 1 ? "" : "s"}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(emp.updated_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 relative">
                        <Link href={`/ats/employees/${emp.id}`} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50" title="View Profile">
                          <UserRound size={14} />
                        </Link>
                        <Link href={`/ats/employees/${emp.id}/edit`} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50" title="Edit">
                          <Pencil size={14} />
                        </Link>
                        <Link href={`/ats/employees/${emp.id}#resume-upload`} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50" title="Upload Resume">
                          <Upload size={14} />
                        </Link>
                        <button
                          type="button"
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                          title="More actions"
                          onClick={() => setOpenMenuId(openMenuId === emp.id ? null : emp.id)}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {openMenuId === emp.id && (
                          <div className="absolute right-0 top-8 z-10 w-44 rounded-xl border border-slate-200 bg-white shadow-lg py-1 text-sm">
                            <Link href={`/ats/employees/${emp.id}`} className="block px-3 py-2 hover:bg-slate-50 text-slate-700" onClick={() => setOpenMenuId(null)}>View Profile</Link>
                            <Link href={`/ats/employees/${emp.id}/edit`} className="block px-3 py-2 hover:bg-slate-50 text-slate-700" onClick={() => setOpenMenuId(null)}>Edit</Link>
                            <button type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700" onClick={() => { setOpenMenuId(null); router.push(`/ats/employees/${emp.id}#resume-upload`); }}>Upload Resume</button>
                            {!ARCHIVED.has(emp.status) && (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-1.5"
                                disabled={statusBusyId === emp.id}
                                onClick={() => handleArchive(emp)}
                              >
                                <Archive size={13} /> Archive
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">Page {filters.page} of {totalPages}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex items-center gap-1 text-xs py-1.5"
                disabled={(filters.page ?? 1) <= 1}
                onClick={() => setFilter({ page: (filters.page ?? 1) - 1 })}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                type="button"
                className="btn-secondary flex items-center gap-1 text-xs py-1.5"
                disabled={(filters.page ?? 1) >= totalPages}
                onClick={() => setFilter({ page: (filters.page ?? 1) + 1 })}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
