"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, Loader2, Plus, Search,
} from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import type {
  PipelineListParams, PipelineSummaryCounts, Submission,
} from "@/types";
import {
  PIPELINE_ACTIVE_STAGES,
  PIPELINE_CREATE_STAGES,
  PIPELINE_STAGE_GROUP_LABELS,
  PIPELINE_STAGE_GROUPS,
  PIPELINE_STAGES,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function stageClass(stage: string) {
  switch (stage) {
    case "Placed": return "bg-green-100 text-green-700";
    case "Rejected": case "Withdrawn": return "bg-red-100 text-red-700";
    case "Interview Scheduled": case "Interview Completed": case "Offer": return "bg-teal-100 text-teal-700";
    case "Submitted": case "Client Review": return "bg-cyan-100 text-cyan-700";
    case "Interested": case "Contacted": return "bg-indigo-100 text-indigo-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function displayStage(s: Submission) {
  return s.status_display || s.status;
}

type ViewMode = "table" | "board";

function paramsFromSearch(sp: URLSearchParams): PipelineListParams & { view: ViewMode } {
  const view = sp.get("view") === "board" ? "board" : "table";
  return {
    view,
    q: sp.get("q") || "",
    stage_group: sp.get("stage_group") || "",
    stage: sp.get("stage") || "",
    follow_up: sp.get("follow_up") || "",
    sort: sp.get("sort") || "",
    job_requirement_id: sp.get("job_requirement_id") ? Number(sp.get("job_requirement_id")) : undefined,
    employee_id: sp.get("employee_id") ? Number(sp.get("employee_id")) : undefined,
    page: Math.max(1, Number(sp.get("page") || 1)),
    page_size: 20,
  };
}

function buildSearchParams(p: PipelineListParams & { view?: ViewMode }): string {
  const sp = new URLSearchParams();
  if (p.view && p.view !== "table") sp.set("view", p.view);
  if (p.q?.trim()) sp.set("q", p.q.trim());
  if (p.stage_group) sp.set("stage_group", p.stage_group);
  if (p.stage) sp.set("stage", p.stage);
  if (p.follow_up) sp.set("follow_up", p.follow_up);
  if (p.sort) sp.set("sort", p.sort);
  if (p.job_requirement_id) sp.set("job_requirement_id", String(p.job_requirement_id));
  if (p.employee_id) sp.set("employee_id", String(p.employee_id));
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function PipelinePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canWrite } = useAtsRole();

  const [filters, setFilters] = useState(() => paramsFromSearch(searchParams));
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const [rows, setRows] = useState<Submission[]>([]);
  const [summary, setSummary] = useState<PipelineSummaryCounts | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [existingConflictId, setExistingConflictId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(
    () => !!(searchParams.get("employee_id") || searchParams.get("job_requirement_id")),
  );
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    employee_id: searchParams.get("employee_id") || "",
    job_requirement_id: searchParams.get("job_requirement_id") || "",
    submitted_rate: "",
    status: "Identified",
  }));
  const [mobileBoardStage, setMobileBoardStage] = useState<string>(PIPELINE_ACTIVE_STAGES[0]);

  const syncUrl = useCallback((next: typeof filters) => {
    router.replace(`/ats/pipeline${buildSearchParams(next)}`, { scroll: false });
  }, [router]);

  const applyFilters = useCallback((patch: Partial<typeof filters>) => {
    setFilters((f) => {
      const next = { ...f, ...patch, page: patch.page ?? (patch.q !== undefined || patch.stage_group !== undefined || patch.stage !== undefined || patch.follow_up !== undefined || patch.view !== undefined ? 1 : (f.page ?? 1)) };
      syncUrl(next);
      return next;
    });
  }, [syncUrl]);

  const load = useCallback(async (params: typeof filters) => {
    setLoading(true);
    try {
      const query: PipelineListParams = {
        page: params.page ?? 1,
        page_size: params.page_size ?? 20,
      };
      if (params.q?.trim()) query.q = params.q.trim();
      if (params.stage_group) query.stage_group = params.stage_group;
      if (params.stage) query.stage = params.stage;
      if (params.follow_up) query.follow_up = params.follow_up;
      if (params.sort) query.sort = params.sort;
      if (params.job_requirement_id) query.job_requirement_id = params.job_requirement_id;
      if (params.employee_id) query.employee_id = params.employee_id;

      // Board loads a wider page of active items for columns.
      if (params.view === "board" && !params.stage && !params.stage_group) {
        query.stage_group = "active";
        query.page_size = 100;
      }

      const [list, counts] = await Promise.all([
        api.getPipeline(query),
        api.getPipelineSummary(),
      ]);
      setRows(list.items);
      setTotal(list.total);
      setTotalPages(list.total_pages);
      setSummary(counts);
      setError(null);
      setExistingConflictId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filters); }, [filters, load]);

  const changeStage = async (id: number, stage: string) => {
    setUpdatingId(id);
    try {
      await api.changePipelineStage(id, { stage, confirmed: true });
      await load(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change stage.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setExistingConflictId(null);
    try {
      const created = await api.createPipeline({
        job_requirement_id: Number(form.job_requirement_id),
        employee_id: Number(form.employee_id),
        submitted_rate: form.submitted_rate || null,
        status: form.status,
      });
      setShowForm(false);
      setForm({ employee_id: "", job_requirement_id: "", submitted_rate: "", status: "Identified" });
      router.push(`/ats/pipeline/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.message);
        setExistingConflictId(err.submissionId ?? null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to create pipeline record.");
      }
    } finally {
      setSaving(false);
    }
  };

  const boardColumns = useMemo(() => {
    const map = new Map<string, Submission[]>();
    for (const stage of PIPELINE_ACTIVE_STAGES) map.set(stage, []);
    for (const row of rows) {
      const stage = displayStage(row);
      if (map.has(stage)) map.get(stage)!.push(row);
    }
    return PIPELINE_ACTIVE_STAGES.map((stage) => ({ stage, items: map.get(stage) || [] }));
  }, [rows]);

  const summaryChips: { key: keyof PipelineSummaryCounts; label: string; href: string }[] = [
    { key: "active", label: "Active", href: "/ats/pipeline?stage_group=active" },
    { key: "submitted", label: "Submitted", href: "/ats/pipeline?stage_group=submitted" },
    { key: "interview", label: "Interview", href: "/ats/pipeline?stage_group=interview" },
    { key: "offer", label: "Offer", href: "/ats/pipeline?stage_group=offer" },
    { key: "placed", label: "Placed", href: "/ats/pipeline?stage_group=placed" },
    { key: "follow_ups_due", label: "Follow-ups due", href: "/ats/pipeline?follow_up=due" },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-subtitle">Track candidates from identified through placement.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              className={clsx("px-2.5 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5", filters.view === "table" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50")}
              onClick={() => applyFilters({ view: "table" })}
            >
              <List size={14} /> Table
            </button>
            <button
              type="button"
              className={clsx("px-2.5 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5", filters.view === "board" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50")}
              onClick={() => applyFilters({ view: "board" })}
            >
              <LayoutGrid size={14} /> Board
            </button>
          </div>
          {canWrite && (
            <button type="button" className="btn-primary flex items-center gap-1.5" onClick={() => setShowForm((v) => !v)}>
              <Plus size={16} /> New Submission
            </button>
          )}
        </div>
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2 mb-4">
          {summaryChips.map(({ key, label, href }) => (
            <Link
              key={key}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (key === "follow_ups_due") applyFilters({ follow_up: "due", stage_group: "", stage: "" });
                else applyFilters({ stage_group: key === "active" ? "active" : key, follow_up: "", stage: "" });
              }}
              className={clsx(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                (key === "follow_ups_due" && filters.follow_up === "due")
                  || (key !== "follow_ups_due" && filters.stage_group === (key === "active" ? "active" : key))
                  ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              <span className="font-semibold">{summary[key]}</span>
              <span className="text-slate-500">{label}</span>
            </Link>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => { setError(null); setExistingConflictId(null); }} onRetry={() => load(filters)} />
          {existingConflictId && (
            <p className="mt-2 text-sm text-slate-600">
              Open existing record:{" "}
              <Link href={`/ats/pipeline/${existingConflictId}`} className="text-indigo-600 hover:underline">
                Pipeline #{existingConflictId}
              </Link>
            </p>
          )}
        </div>
      )}

      {showForm && canWrite && (
        <form onSubmit={handleCreate} className="card p-5 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Candidate ID</span>
            <input className="input mt-1 w-full" required type="number" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Job ID</span>
            <input className="input mt-1 w-full" required type="number" value={form.job_requirement_id} onChange={(e) => setForm({ ...form, job_requirement_id: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Submitted Rate</span>
            <input className="input mt-1 w-full" placeholder="e.g. $75/hr" value={form.submitted_rate} onChange={(e) => setForm({ ...form, submitted_rate: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Initial Stage</span>
            <select className="input mt-1 w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {PIPELINE_CREATE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Create"}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="card p-4 mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input w-full pl-9"
              placeholder="Search candidate or job…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyFilters({ q: searchInput }); }}
            />
          </div>
          <button type="button" className="btn-secondary" onClick={() => applyFilters({ q: searchInput })}>Search</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="input text-sm py-1.5 w-auto"
            aria-label="Stage group"
            value={filters.stage_group || ""}
            onChange={(e) => applyFilters({ stage_group: e.target.value, stage: "" })}
          >
            <option value="">All groups</option>
            {PIPELINE_STAGE_GROUPS.map((g) => (
              <option key={g} value={g}>{PIPELINE_STAGE_GROUP_LABELS[g]}</option>
            ))}
          </select>
          <select
            className="input text-sm py-1.5 w-auto"
            aria-label="Stage"
            value={filters.stage || ""}
            onChange={(e) => applyFilters({ stage: e.target.value })}
          >
            <option value="">All stages</option>
            {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="input text-sm py-1.5 w-auto"
            aria-label="Follow-up filter"
            value={filters.follow_up || ""}
            onChange={(e) => applyFilters({ follow_up: e.target.value })}
          >
            <option value="">Any follow-up</option>
            <option value="due">Follow-up due</option>
          </select>
          {(filters.q || filters.stage_group || filters.stage || filters.follow_up) && (
            <button
              type="button"
              className="text-sm text-indigo-600 hover:underline px-2"
              onClick={() => {
                setSearchInput("");
                applyFilters({ q: "", stage_group: "", stage: "", follow_up: "", page: 1 });
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No pipeline records match these filters.
          {canWrite && (
            <button type="button" className="block mx-auto mt-3 text-indigo-600 hover:underline text-sm" onClick={() => setShowForm(true)}>
              Create a submission
            </button>
          )}
        </div>
      ) : filters.view === "board" ? (
        <>
          {/* Mobile: stage select + cards */}
          <div className="lg:hidden space-y-3">
            <select
              className="input w-full"
              aria-label="Board stage"
              value={mobileBoardStage}
              onChange={(e) => setMobileBoardStage(e.target.value)}
            >
              {PIPELINE_ACTIVE_STAGES.map((s) => {
                const count = boardColumns.find((c) => c.stage === s)?.items.length ?? 0;
                return <option key={s} value={s}>{s} ({count})</option>;
              })}
            </select>
            {(boardColumns.find((c) => c.stage === mobileBoardStage)?.items ?? []).map((s) => (
              <PipelineCard key={s.id} item={s} canWrite={canWrite} updating={updatingId === s.id} onStageChange={changeStage} />
            ))}
          </div>
          {/* Desktop board */}
          <div className="hidden lg:block overflow-x-auto pb-2">
            <div className="flex gap-3 min-w-max">
              {boardColumns.map(({ stage, items }) => (
                <div key={stage} className="w-64 shrink-0 rounded-xl border border-slate-200 bg-slate-50/80">
                  <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-700">{stage}</h3>
                    <span className="text-xs text-slate-400">{items.length}</span>
                  </div>
                  <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6">Empty</p>
                    ) : items.map((s) => (
                      <PipelineCard key={s.id} item={s} canWrite={canWrite} updating={updatingId === s.id} onStageChange={changeStage} compact />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Candidate", "Job", "Client", "Stage", "Match", "Interview", "Follow-up", "Updated", canWrite ? "Change" : null]
                    .filter(Boolean)
                    .map((h) => (
                      <th key={h!} className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => {
                  const stage = displayStage(s);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 align-top">
                      <td className="px-3 py-2.5">
                        <Link href={`/ats/pipeline/${s.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                          {s.employee_name ?? `Candidate #${s.employee_id}`}
                        </Link>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          <Link href={`/ats/candidates/${s.employee_id}`} className="hover:underline">Profile</Link>
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/ats/jobs/${s.job_requirement_id}`} className="text-slate-800 hover:text-indigo-600">
                          {s.job_title ?? `Job #${s.job_requirement_id}`}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{s.client_name ?? s.vendor_name ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap", stageClass(stage))}>{stage}</span>
                        {s.follow_up_overdue && (
                          <span className="ml-1 text-[10px] font-medium text-red-600">Overdue</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{s.match_score != null ? `${s.match_score}%` : "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{formatDateTime(s.next_interview_at)}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                        <span className={s.follow_up_overdue ? "text-red-600 font-medium" : ""}>
                          {formatDate(s.next_follow_up_at)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(s.last_activity_at || s.updated_at)}</td>
                      {canWrite && (
                        <td className="px-3 py-2.5">
                          <select
                            className="input text-xs py-1 w-auto max-w-[10rem]"
                            value={stage}
                            disabled={updatingId === s.id}
                            aria-label="Change stage"
                            onChange={(e) => changeStage(s.id, e.target.value)}
                          >
                            {PIPELINE_STAGES.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
              <span>{total} total</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary p-1.5"
                  disabled={(filters.page ?? 1) <= 1}
                  onClick={() => applyFilters({ page: (filters.page ?? 1) - 1 })}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span>Page {filters.page ?? 1} of {totalPages}</span>
                <button
                  type="button"
                  className="btn-secondary p-1.5"
                  disabled={(filters.page ?? 1) >= totalPages}
                  onClick={() => applyFilters({ page: (filters.page ?? 1) + 1 })}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PipelineCard({
  item,
  canWrite,
  updating,
  onStageChange,
  compact,
}: {
  item: Submission;
  canWrite: boolean;
  updating: boolean;
  onStageChange: (id: number, stage: string) => void;
  compact?: boolean;
}) {
  const stage = displayStage(item);
  return (
    <div className={clsx("rounded-lg border border-slate-200 bg-white p-3", !compact && "card")}>
      <Link href={`/ats/pipeline/${item.id}`} className="font-medium text-indigo-600 hover:text-indigo-800 text-sm">
        {item.employee_name ?? `Candidate #${item.employee_id}`}
      </Link>
      <p className="text-xs text-slate-600 mt-0.5 truncate">{item.job_title ?? `Job #${item.job_requirement_id}`}</p>
      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{item.client_name ?? item.vendor_name ?? "—"}</p>
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className={clsx("text-[10px] font-medium px-1.5 py-0.5 rounded-full", stageClass(stage))}>{stage}</span>
        {item.match_score != null && <span className="text-[11px] text-slate-500">{item.match_score}%</span>}
      </div>
      {canWrite && (
        <select
          className="input text-xs py-1 w-full mt-2"
          value={stage}
          disabled={updating}
          aria-label="Change stage"
          onChange={(e) => onStageChange(item.id, e.target.value)}
        >
          {PIPELINE_STAGES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      )}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <PipelinePageInner />
    </Suspense>
  );
}
