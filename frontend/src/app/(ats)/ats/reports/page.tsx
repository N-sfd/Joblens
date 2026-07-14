"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import {
  BarChart3, Briefcase, Users, Send, CalendarCheck, BadgeCheck, Award,
  BellRing, Download, Loader2,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type {
  ReportDatePreset, ReportEnvelope, ReportFilterParams, ReportOverviewSummary, ReportTab,
} from "@/types";
import { REPORT_DATE_PRESETS, REPORT_TABS } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const PRESET_LABELS: Record<ReportDatePreset, string> = {
  today: "Today",
  last_7_days: "Last 7 Days",
  last_30_days: "Last 30 Days",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  this_year: "This Year",
  custom: "Custom Range",
};

const TAB_LABELS: Record<ReportTab, string> = {
  overview: "Overview",
  jobs: "Jobs",
  candidates: "Candidates",
  pipeline: "Pipeline",
  contacts: "Contacts",
  activity: "Activity",
  "follow-ups": "Follow-ups",
};

const CHART_COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#e11d48", "#7c3aed", "#64748b", "#0d9488"];

type OverviewCard = {
  key: keyof ReportOverviewSummary;
  label: string;
  href: string;
  icon: React.ElementType;
  tone: string;
};

const OVERVIEW_CARDS: OverviewCard[] = [
  { key: "open_jobs", label: "Open Jobs", href: "/ats/jobs?status_group=open", icon: Briefcase, tone: "bg-indigo-50 text-indigo-600" },
  { key: "candidates_submitted", label: "Candidates Submitted", href: "/ats/pipeline?stage_group=submitted", icon: Send, tone: "bg-cyan-50 text-cyan-600" },
  { key: "interviews_scheduled", label: "Interviews", href: "/ats/pipeline?stage=interview_scheduled", icon: CalendarCheck, tone: "bg-teal-50 text-teal-600" },
  { key: "offers", label: "Offers", href: "/ats/pipeline?stage_group=offer", icon: BadgeCheck, tone: "bg-rose-50 text-rose-600" },
  { key: "placements", label: "Placements", href: "/ats/pipeline?stage_group=placed", icon: Award, tone: "bg-amber-50 text-amber-600" },
  { key: "active_candidates", label: "Active Candidates", href: "/ats/candidates?status_group=active", icon: Users, tone: "bg-emerald-50 text-emerald-600" },
  { key: "overdue_follow_ups", label: "Overdue Follow-Ups", href: "/ats/pipeline?follow_up=due", icon: BellRing, tone: "bg-orange-50 text-orange-600" },
];

const SECTION_TITLES: Record<string, string> = {
  pipeline_stages: "Pipeline by stage",
  jobs_by_status: "Jobs by status",
  activity_by_type: "Activity by type",
  top_clients: "Top clients",
  top_recruiters: "Top recruiters",
  by_status: "By status",
  by_source: "By source",
  by_recruiter: "By recruiter",
  by_client: "By client",
  aging_open: "Aging open jobs",
  aging_inactive: "Aging inactive candidates",
  activity_counts: "Activity counts",
  by_stage: "By stage",
  conversion: "Conversion rates",
  interview_status: "Interview status",
  offer_status: "Offer status",
  placements: "Placements",
  contact_activity: "Contact activity",
  attention: "Needs attention",
  company_performance: "Company performance",
  by_type: "By type",
  by_user: "By user",
  buckets: "Follow-up buckets",
};

function isReportTab(v: string | null): v is ReportTab {
  return !!v && (REPORT_TABS as readonly string[]).includes(v);
}

function isPreset(v: string | null): v is ReportDatePreset {
  return !!v && (REPORT_DATE_PRESETS as readonly string[]).includes(v);
}

function formatCell(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateLabel(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function filtersFromSearch(sp: URLSearchParams): ReportFilterParams {
  const preset = isPreset(sp.get("preset")) ? sp.get("preset")! : "last_30_days";
  const params: ReportFilterParams = { preset };
  const dateFrom = sp.get("date_from");
  const dateTo = sp.get("date_to");
  const owner = sp.get("owner");
  const orgId = sp.get("organization_id");
  const recruiterId = sp.get("recruiter_contact_id");
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;
  if (owner) params.owner = owner;
  if (orgId) params.organization_id = orgId;
  if (recruiterId) params.recruiter_contact_id = recruiterId;
  return params;
}

function filtersToQuery(tab: ReportTab, filters: ReportFilterParams): string {
  const sp = new URLSearchParams();
  sp.set("tab", tab);
  sp.set("preset", filters.preset || "last_30_days");
  if (filters.preset === "custom") {
    if (filters.date_from) sp.set("date_from", String(filters.date_from));
    if (filters.date_to) sp.set("date_to", String(filters.date_to));
  }
  if (filters.owner?.trim()) sp.set("owner", filters.owner.trim());
  if (filters.organization_id !== undefined && filters.organization_id !== "") {
    sp.set("organization_id", String(filters.organization_id));
  }
  if (filters.recruiter_contact_id !== undefined && filters.recruiter_contact_id !== "") {
    sp.set("recruiter_contact_id", String(filters.recruiter_contact_id));
  }
  return sp.toString();
}

function cleanApiParams(filters: ReportFilterParams): ReportFilterParams {
  const clean: ReportFilterParams = { preset: filters.preset || "last_30_days" };
  if (clean.preset === "custom") {
    if (filters.date_from) clean.date_from = filters.date_from;
    if (filters.date_to) clean.date_to = filters.date_to;
  }
  if (filters.owner?.trim()) clean.owner = filters.owner.trim();
  if (filters.organization_id !== undefined && filters.organization_id !== "") {
    const n = Number(filters.organization_id);
    clean.organization_id = Number.isFinite(n) ? n : filters.organization_id;
  }
  if (filters.recruiter_contact_id !== undefined && filters.recruiter_contact_id !== "") {
    const n = Number(filters.recruiter_contact_id);
    clean.recruiter_contact_id = Number.isFinite(n) ? n : filters.recruiter_contact_id;
  }
  return clean;
}

function hasAnySectionData(env: ReportEnvelope | null): boolean {
  if (!env) return false;
  const summaryVals = Object.values(env.summary || {});
  if (summaryVals.some((v) => typeof v === "number" && v > 0)) return true;
  if ((env.rows || []).length > 0) return true;
  for (const value of Object.values(env.sections || {})) {
    if (Array.isArray(value) && value.length > 0) {
      if (value.some((row) => {
        if (!row || typeof row !== "object") return true;
        const count = (row as { count?: unknown }).count;
        return typeof count !== "number" || count > 0 || Object.keys(row).length > 1;
      })) return true;
    }
  }
  return false;
}

function sectionRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
}

function ReportTable({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  if (!rows.length) return null;
  const keys = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
      </div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              {keys.map((k) => (
                <th key={k} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">{humanizeKey(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/80">
                {keys.map((k) => (
                  <td key={k} className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                    {renderLinkedCell(k, row[k], row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile stacked cards */}
      <div className="sm:hidden divide-y divide-slate-100">
        {rows.map((row, i) => (
          <div key={i} className="px-4 py-3 space-y-1.5">
            {keys.map((k) => (
              <div key={k} className="flex justify-between gap-3 text-sm">
                <span className="text-slate-500 shrink-0">{humanizeKey(k)}</span>
                <span className="text-slate-800 text-right">{renderLinkedCell(k, row[k], row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderLinkedCell(key: string, value: unknown, row: Record<string, unknown>): React.ReactNode {
  const text = formatCell(value);
  if (key === "contact_id" || key === "recruiter_contact_id") {
    const id = Number(row.contact_id ?? row.recruiter_contact_id ?? value);
    if (Number.isFinite(id) && id > 0) {
      return <Link href={`/ats/contacts/${id}`} className="text-indigo-600 hover:underline">{text}</Link>;
    }
  }
  if (key === "organization_id" || key === "client_id") {
    const id = Number(row.organization_id ?? row.client_id ?? value);
    if (Number.isFinite(id) && id > 0) {
      return <Link href={`/ats/contacts/companies/${id}`} className="text-indigo-600 hover:underline">{text}</Link>;
    }
  }
  if (key === "employee_id") {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) {
      return <Link href={`/ats/candidates/${id}`} className="text-indigo-600 hover:underline">{text}</Link>;
    }
  }
  if (key === "job_requirement_id" || key === "job_id") {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) {
      return <Link href={`/ats/jobs/${id}`} className="text-indigo-600 hover:underline">{text}</Link>;
    }
  }
  if (key === "submission_id") {
    const id = Number(value);
    if (Number.isFinite(id) && id > 0) {
      return <Link href={`/ats/pipeline/${id}`} className="text-indigo-600 hover:underline">{text}</Link>;
    }
  }
  if (key === "contact_name" && row.contact_id) {
    return <Link href={`/ats/contacts/${row.contact_id}`} className="text-indigo-600 hover:underline">{text}</Link>;
  }
  if ((key === "organization_name" || key === "client_name") && (row.organization_id || row.client_id)) {
    const id = row.organization_id || row.client_id;
    return <Link href={`/ats/contacts/companies/${id}`} className="text-indigo-600 hover:underline">{text}</Link>;
  }
  if (key === "recruiter_name" && row.recruiter_contact_id) {
    return <Link href={`/ats/contacts/${row.recruiter_contact_id}`} className="text-indigo-600 hover:underline">{text}</Link>;
  }
  return text;
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-sm text-slate-500">No report data matches the selected filters.</p>
      <button type="button" onClick={onClear} className="mt-3 text-sm text-indigo-600 hover:underline">
        Clear Filters
      </button>
    </div>
  );
}

function SimpleBarChart({ data, nameKey, title }: { data: { name: string; count: number }[]; nameKey?: string; title: string }) {
  if (!data.length || data.every((d) => !d.count)) {
    return (
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-3">{title}</h3>
        <p className="text-sm text-slate-400 py-8 text-center">No data for this chart.</p>
      </div>
    );
  }
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-900 text-sm mb-3">{title}</h3>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={nameKey || "name"} tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={50} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
            <Tooltip />
            <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SimpleDonutChart({ data, title }: { data: { name: string; count: number }[]; title: string }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) {
    return (
      <div className="card p-5">
        <h3 className="font-semibold text-slate-900 text-sm mb-3">{title}</h3>
        <p className="text-sm text-slate-400 py-8 text-center">No data for this chart.</p>
      </div>
    );
  }
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-900 text-sm mb-3">{title}</h3>
      <div className="h-56 w-full flex items-center gap-4">
        <div className="w-40 h-40 shrink-0 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="count" nameKey="name" innerRadius="58%" outerRadius="100%" paddingAngle={2} strokeWidth={0}>
                {data.map((slice, i) => (
                  <Cell key={slice.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-slate-900">{total}</span>
            <span className="text-[10px] text-slate-400">Total</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 min-w-0 max-h-48 overflow-y-auto">
          {data.map((slice, i) => (
            <div key={slice.name} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-slate-600 truncate">{slice.name}</span>
              </div>
              <span className="font-semibold text-slate-800 shrink-0">{slice.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function fetchReport(tab: ReportTab, params: ReportFilterParams): Promise<ReportEnvelope> {
  switch (tab) {
    case "overview": return api.getReportsOverview(params);
    case "jobs": return api.getReportsJobs(params);
    case "candidates": return api.getReportsCandidates(params);
    case "pipeline": return api.getReportsPipeline(params);
    case "contacts": return api.getReportsContacts(params);
    case "activity": return api.getReportsActivity(params);
    case "follow-ups": return api.getReportsFollowUps(params);
  }
}

function ReportsPageInner() {
  // canWrite available for future mutations; CSV export is allowed for all viewers including read_only.
  useAtsRole();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const tab: ReportTab = isReportTab(tabParam) ? tabParam : "overview";
  const appliedFilters = useMemo(() => filtersFromSearch(searchParams), [searchParams]);

  const [draft, setDraft] = useState<ReportFilterParams>(appliedFilters);
  const [data, setData] = useState<ReportEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setDraft(appliedFilters);
  }, [appliedFilters]);

  const load = useCallback(async (nextTab: ReportTab, filters: ReportFilterParams) => {
    setLoading(true);
    setError(null);
    try {
      const env = await fetchReport(nextTab, cleanApiParams(filters));
      setData(env);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab, appliedFilters);
  }, [tab, appliedFilters, load]);

  const pushFilters = (nextTab: ReportTab, filters: ReportFilterParams) => {
    router.push(`/ats/reports?${filtersToQuery(nextTab, filters)}`);
  };

  const applyFilters = () => {
    const next = { ...draft, preset: draft.preset || "last_30_days" };
    if (next.preset !== "custom") {
      delete next.date_from;
      delete next.date_to;
    }
    pushFilters(tab, next);
  };

  const clearFilters = () => {
    const cleared: ReportFilterParams = { preset: "last_30_days" };
    setDraft(cleared);
    pushFilters(tab, cleared);
  };

  const onTabChange = (next: ReportTab) => {
    pushFilters(next, appliedFilters);
  };

  const onExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await api.exportReport(tab, cleanApiParams(appliedFilters));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const summary = (data?.summary || {}) as ReportOverviewSummary;
  const sections = data?.sections || {};
  const dateBasisNote = data?.date_basis
    ? Object.values(data.date_basis).slice(0, 2).join(" · ")
    : null;
  const rangeLabel = data?.date_range
    ? `${PRESET_LABELS[(data.date_range.preset as ReportDatePreset)] || data.date_range.preset}: ${formatDateLabel(data.date_range.date_from)} – ${formatDateLabel(data.date_range.date_to)}`
    : PRESET_LABELS[(appliedFilters.preset as ReportDatePreset) || "last_30_days"] || "Last 30 Days";

  const pipelineChart = sectionRows(sections.pipeline_stages || sections.by_stage).map((r) => ({
    name: String(r.stage ?? "—"),
    count: Number(r.count) || 0,
  }));
  const jobsStatusChart = sectionRows(sections.jobs_by_status || sections.by_status).map((r) => ({
    name: String(r.status ?? "—"),
    count: Number(r.count) || 0,
  }));
  const activityChart = sectionRows(sections.activity_by_type || sections.by_type).map((r) => ({
    name: String(r.activity_type ?? r.type ?? "—"),
    count: Number(r.count) || 0,
  }));

  const empty = !loading && !error && !hasAnySectionData(data);

  return (
    <div className="p-4 sm:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title flex items-center gap-2">
            <BarChart3 size={22} className="text-indigo-600" /> Reports
          </h1>
          <p className="page-subtitle">
            Operational summaries linked back to Jobs, Candidates, Pipeline, and Contacts.
            {data?.scope ? ` Scope: ${data.scope === "own" ? "your records" : "organization-wide"}.` : ""}
          </p>
          <p className="text-xs text-slate-400 mt-1">{rangeLabel}{dateBasisNote ? ` · ${dateBasisNote}` : ""}</p>
        </div>
        {tab !== "overview" && (
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={exporting || loading}
            className="btn-primary inline-flex items-center gap-1.5 self-start"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export CSV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        <div className="flex gap-1 min-w-max border-b border-slate-200">
          {REPORT_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTabChange(t)}
              className={clsx(
                "px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
                tab === t
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="card p-3 sm:p-4 mb-5">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-500 min-w-[140px]">
            Date range
            <select
              className="input text-sm"
              value={draft.preset || "last_30_days"}
              onChange={(e) => setDraft((d) => ({ ...d, preset: e.target.value }))}
            >
              {REPORT_DATE_PRESETS.map((p) => (
                <option key={p} value={p}>{PRESET_LABELS[p]}</option>
              ))}
            </select>
          </label>
          {draft.preset === "custom" && (
            <>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                From
                <input
                  type="date"
                  className="input text-sm"
                  value={draft.date_from || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, date_from: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                To
                <input
                  type="date"
                  className="input text-sm"
                  value={draft.date_to || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, date_to: e.target.value }))}
                />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 text-xs text-slate-500 w-[120px]">
            Owner
            <input
              className="input text-sm"
              placeholder="user id"
              value={draft.owner || ""}
              onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 w-[100px]">
            Org ID
            <input
              className="input text-sm"
              inputMode="numeric"
              placeholder="id"
              value={draft.organization_id ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, organization_id: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 w-[110px]">
            Recruiter ID
            <input
              className="input text-sm"
              inputMode="numeric"
              placeholder="id"
              value={draft.recruiter_contact_id ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, recruiter_contact_id: e.target.value }))}
            />
          </label>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={clearFilters} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">
              Clear Filters
            </button>
            <button type="button" onClick={applyFilters} className="btn-primary text-sm">
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={() => void load(tab, appliedFilters)}
          className="mb-4"
        />
      )}

      {loading && (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 size={24} className="animate-spin text-indigo-500" />
        </div>
      )}

      {!loading && empty && <EmptyState onClear={clearFilters} />}

      {!loading && !empty && data && tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {OVERVIEW_CARDS.map(({ key, label, href, icon: Icon, tone }) => (
              <Link key={key} href={href} className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-slate-900">{Number(summary[key] ?? 0)}</p>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mt-0.5 truncate">{label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{rangeLabel}</p>
                  </div>
                  <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", tone)}>
                    <Icon size={16} />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SimpleBarChart title="Pipeline stages" data={pipelineChart} />
            <SimpleDonutChart title="Jobs by status" data={jobsStatusChart} />
            <SimpleBarChart title="Activity by type" data={activityChart} />
          </div>

          <ReportTable title="Top clients" rows={sectionRows(sections.top_clients)} />
          <ReportTable title="Top recruiters" rows={sectionRows(sections.top_recruiters)} />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export overview CSV
            </button>
          </div>
        </div>
      )}

      {!loading && !empty && data && tab !== "overview" && (
        <div className="space-y-4">
          {Object.keys(data.summary || {}).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(data.summary).map(([k, v]) => (
                <div key={k} className="card p-4">
                  <p className="text-xl font-bold text-slate-900">{typeof v === "number" ? v : formatCell(v)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{humanizeKey(k)}</p>
                </div>
              ))}
            </div>
          )}
          {Object.entries(sections).map(([key, value]) => (
            <ReportTable
              key={key}
              title={SECTION_TITLES[key] || humanizeKey(key)}
              rows={sectionRows(value)}
            />
          ))}
          {(data.rows || []).length > 0 && (
            <ReportTable title="Detail" rows={data.rows} />
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <Loader2 size={24} className="animate-spin text-indigo-500" />
        </div>
      }
    >
      <ReportsPageInner />
    </Suspense>
  );
}
