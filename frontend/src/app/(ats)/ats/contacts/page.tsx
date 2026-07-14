"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { CRMContact, CRMOrganization, CRMContactListParams, CRMOrganizationListParams } from "@/types";
import {
  CONTACT_DISPLAY_TYPES,
  CONTACT_DISPLAY_STATUSES,
  COMPANY_DISPLAY_TYPES,
  COMPANY_DISPLAY_STATUSES,
  CONTACT_SORT_OPTIONS,
  COMPANY_SORT_OPTIONS,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

type ViewMode = "people" | "companies";

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Inactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Archived: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
  Prospect: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  Blocked: "bg-red-50 text-red-700 ring-1 ring-red-200",
  "Do Not Contact": "bg-red-50 text-red-700 ring-1 ring-red-200",
  "Do Not Work With": "bg-red-50 text-red-700 ring-1 ring-red-200",
  "Bounced Email": "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Unsubscribed: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

function formatRelative(iso: string | null | undefined) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function titleCaseType(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  // Recruiter, client, Client Contact, etc.
  if (t.toLowerCase() === "recruiter") return "Recruiter";
  if (t.toLowerCase() === "client") return "Client";
  if (t.toLowerCase() === "vendor") return "Vendor";
  if (t.toLowerCase() === "end client" || t.toLowerCase() === "end_client") return "End Client";
  return t;
}

function contactDisplayName(c: CRMContact): string {
  return c.display_name
    || [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
    || c.email
    || "(no name)";
}

function ContactsPageInner() {
  const router = useRouter();
  const { canWrite } = useAtsRole();
  const searchParams = useSearchParams();

  const view: ViewMode = searchParams.get("view") === "companies" ? "companies" : "people";
  const typeParam = titleCaseType(searchParams.get("type") || searchParams.get("contact_type") || "");

  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const [peopleFilters, setPeopleFilters] = useState<CRMContactListParams>(() => ({
    q: searchParams.get("q") || "",
    contact_type: typeParam || "",
    status: searchParams.get("status") || "",
    sort: searchParams.get("sort") || "last_activity",
    page: Number(searchParams.get("page") || "1") || 1,
    page_size: 20,
    has_open_jobs: searchParams.get("has_open_jobs") === "true" ? true
      : searchParams.get("has_open_jobs") === "false" ? false : undefined,
    has_pipeline: searchParams.get("has_pipeline") === "true" ? true
      : searchParams.get("has_pipeline") === "false" ? false : undefined,
  }));
  const [companyFilters, setCompanyFilters] = useState<CRMOrganizationListParams>(() => ({
    q: searchParams.get("q") || "",
    type: typeParam || "",
    status: searchParams.get("status") || "",
    sort: searchParams.get("sort") || "last_activity",
    page: Number(searchParams.get("page") || "1") || 1,
    page_size: 20,
    has_open_jobs: searchParams.get("has_open_jobs") === "true" ? true
      : searchParams.get("has_open_jobs") === "false" ? false : undefined,
    has_active_pipeline: searchParams.get("has_pipeline") === "true" ? true
      : searchParams.get("has_pipeline") === "false" ? false : undefined,
  }));

  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [companies, setCompanies] = useState<CRMOrganization[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const syncUrl = useCallback((mode: ViewMode, people: CRMContactListParams, companiesParams: CRMOrganizationListParams) => {
    const sp = new URLSearchParams();
    if (mode === "companies") sp.set("view", "companies");
    const filters = mode === "people" ? people : companiesParams;
    const typeVal = mode === "people" ? people.contact_type : companiesParams.type;
    if (filters.q?.trim()) sp.set("q", filters.q.trim());
    if (typeVal) sp.set("type", String(typeVal).toLowerCase() === "end client" ? "end client" : String(typeVal).toLowerCase());
    if (filters.status) sp.set("status", String(filters.status));
    if (filters.sort && filters.sort !== "last_activity") sp.set("sort", String(filters.sort));
    if (filters.page && filters.page > 1) sp.set("page", String(filters.page));
    if (mode === "people") {
      if (people.has_open_jobs !== undefined) sp.set("has_open_jobs", String(people.has_open_jobs));
      if (people.has_pipeline !== undefined) sp.set("has_pipeline", String(people.has_pipeline));
    } else {
      if (companiesParams.has_open_jobs !== undefined) sp.set("has_open_jobs", String(companiesParams.has_open_jobs));
      if (companiesParams.has_active_pipeline !== undefined) sp.set("has_pipeline", String(companiesParams.has_active_pipeline));
    }
    const qs = sp.toString();
    router.replace(qs ? `/ats/contacts?${qs}` : "/ats/contacts", { scroll: false });
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "people") {
        const params: CRMContactListParams = {
          page: peopleFilters.page ?? 1,
          page_size: peopleFilters.page_size ?? 20,
          sort: peopleFilters.sort || "last_activity",
        };
        if (peopleFilters.q?.trim()) params.q = peopleFilters.q.trim();
        if (peopleFilters.contact_type) params.contact_type = peopleFilters.contact_type;
        if (peopleFilters.status) params.status = peopleFilters.status;
        if (peopleFilters.has_open_jobs !== undefined) params.has_open_jobs = peopleFilters.has_open_jobs;
        if (peopleFilters.has_pipeline !== undefined) params.has_pipeline = peopleFilters.has_pipeline;
        const res = await api.getContacts(params);
        setContacts(res.items);
        setTotal(res.total);
        setTotalPages(res.total_pages || 1);
        syncUrl("people", peopleFilters, companyFilters);
      } else {
        const params: CRMOrganizationListParams = {
          page: companyFilters.page ?? 1,
          page_size: companyFilters.page_size ?? 20,
          sort: companyFilters.sort || "last_activity",
        };
        if (companyFilters.q?.trim()) params.q = companyFilters.q.trim();
        if (companyFilters.type) params.type = companyFilters.type;
        if (companyFilters.status) params.status = companyFilters.status;
        if (companyFilters.has_open_jobs !== undefined) params.has_open_jobs = companyFilters.has_open_jobs;
        if (companyFilters.has_active_pipeline !== undefined) params.has_active_pipeline = companyFilters.has_active_pipeline;
        const res = await api.getCompanies(params);
        setCompanies(res.items);
        setTotal(res.total);
        setTotalPages(res.total_pages || 1);
        syncUrl("companies", peopleFilters, companyFilters);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [view, peopleFilters, companyFilters, syncUrl]);

  useEffect(() => { load(); }, [load]);

  const setView = (mode: ViewMode) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (mode === "companies") sp.set("view", "companies");
    else sp.delete("view");
    sp.delete("page");
    // Keep type only if it makes sense for the destination view
    const qs = sp.toString();
    router.replace(qs ? `/ats/contacts?${qs}` : "/ats/contacts", { scroll: false });
    if (mode === "people") setPeopleFilters((f) => ({ ...f, page: 1 }));
    else setCompanyFilters((f) => ({ ...f, page: 1 }));
  };

  const applySearch = () => {
    if (view === "people") setPeopleFilters((f) => ({ ...f, q: searchInput, page: 1 }));
    else setCompanyFilters((f) => ({ ...f, q: searchInput, page: 1 }));
  };

  const clearFilters = () => {
    setSearchInput("");
    if (view === "people") {
      setPeopleFilters({ q: "", contact_type: "", status: "", sort: "last_activity", page: 1, page_size: 20 });
    } else {
      setCompanyFilters({ q: "", type: "", status: "", sort: "last_activity", page: 1, page_size: 20 });
    }
  };

  const page = view === "people" ? (peopleFilters.page ?? 1) : (companyFilters.page ?? 1);
  const sort = view === "people" ? (peopleFilters.sort || "last_activity") : (companyFilters.sort || "last_activity");
  const statusFilter = view === "people" ? (peopleFilters.status || "") : (companyFilters.status || "");
  const typeFilter = view === "people" ? (peopleFilters.contact_type || "") : (companyFilters.type || "");

  return (
    <div className="p-4 sm:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">CRM</p>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">People and companies linked to jobs and pipeline.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {view === "companies" ? (
              <Link href="/ats/contacts/companies/new" className="btn-primary flex items-center gap-2">
                <Plus size={16} /> Add Company
              </Link>
            ) : (
              <Link href="/ats/contacts/new" className="btn-primary flex items-center gap-2">
                <Plus size={16} /> Add Contact
              </Link>
            )}
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      {/* People / Companies toggle */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {(["people", "companies"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            className={clsx(
              "px-4 py-2 text-sm font-semibold border-b-2 -mb-px capitalize transition-colors",
              view === mode
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder={view === "people" ? "Search name, email, phone, company…" : "Search company name…"}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
          />
        </div>
        <select
          className="input sm:w-44"
          value={typeFilter}
          onChange={(e) => {
            if (view === "people") setPeopleFilters((f) => ({ ...f, contact_type: e.target.value, page: 1 }));
            else setCompanyFilters((f) => ({ ...f, type: e.target.value, page: 1 }));
          }}
        >
          <option value="">All types</option>
          {(view === "people" ? CONTACT_DISPLAY_TYPES : COMPANY_DISPLAY_TYPES).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          className="input sm:w-40"
          value={statusFilter}
          onChange={(e) => {
            if (view === "people") setPeopleFilters((f) => ({ ...f, status: e.target.value, page: 1 }));
            else setCompanyFilters((f) => ({ ...f, status: e.target.value, page: 1 }));
          }}
        >
          <option value="">All statuses</option>
          {(view === "people" ? CONTACT_DISPLAY_STATUSES : COMPANY_DISPLAY_STATUSES).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="input sm:w-44"
          value={sort}
          onChange={(e) => {
            if (view === "people") setPeopleFilters((f) => ({ ...f, sort: e.target.value, page: 1 }));
            else setCompanyFilters((f) => ({ ...f, sort: e.target.value, page: 1 }));
          }}
        >
          {(view === "people" ? CONTACT_SORT_OPTIONS : COMPANY_SORT_OPTIONS).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button type="button" className="btn-secondary" onClick={applySearch}>Search</button>
        {(searchInput || typeFilter || statusFilter) && (
          <button type="button" className="btn-secondary" onClick={clearFilters}>Clear</button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : view === "people" ? (
          contacts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-slate-500 font-medium">No contacts found.</p>
              {canWrite && (
                <Link href="/ats/contacts/new" className="text-indigo-600 text-sm mt-2 inline-block hover:underline">
                  Add your first contact
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["Name", "Type", "Company", "Email", "Jobs", "Pipeline", "Last contacted", "Status"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/ats/contacts/${c.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">
                            {contactDisplayName(c)}
                          </Link>
                          {c.needs_review && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">Needs Review</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{c.contact_type_display || c.contact_type}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {c.organization_id ? (
                            <Link href={`/ats/contacts/companies/${c.organization_id}`} className="hover:text-indigo-600">
                              {c.organization_name ?? "—"}
                            </Link>
                          ) : (c.organization_name ?? "—")}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{c.email ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums">{c.open_job_count ?? 0}</td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums">{c.active_pipeline_count ?? 0}</td>
                        <td className="px-4 py-3 text-slate-500">{formatRelative(c.last_contacted_at || c.last_activity_at)}</td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                            STATUS_COLORS[c.status_display || c.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                          )}>
                            {c.status_display || c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <ul className="md:hidden divide-y divide-slate-100">
                {contacts.map((c) => (
                  <li key={c.id} className="p-4">
                    <Link href={`/ats/contacts/${c.id}`} className="font-semibold text-indigo-600">{contactDisplayName(c)}</Link>
                    <p className="text-xs text-slate-500 mt-1">
                      {[c.contact_type_display || c.contact_type, c.organization_name].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{c.email || "—"}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span>{c.open_job_count ?? 0} jobs</span>
                      <span>{c.active_pipeline_count ?? 0} pipeline</span>
                      <span className={clsx(
                        "ml-auto inline-flex px-2 py-0.5 rounded-full font-semibold",
                        STATUS_COLORS[c.status_display || c.status] ?? "bg-slate-100 text-slate-600",
                      )}>
                        {c.status_display || c.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : companies.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-500 font-medium">No companies found.</p>
            {canWrite && (
              <Link href="/ats/contacts/companies/new" className="text-indigo-600 text-sm mt-2 inline-block hover:underline">
                Add your first company
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Company", "Type", "People", "Jobs", "Pipeline", "Last activity", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/ats/contacts/companies/${o.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">
                          {o.organization_name}
                        </Link>
                        {o.needs_review && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">Needs Review</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{o.organization_type_display || o.organization_type}</td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">{o.contact_count ?? 0}</td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">{o.open_job_count ?? 0}</td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">{o.active_pipeline_count ?? 0}</td>
                      <td className="px-4 py-3 text-slate-500">{formatRelative(o.last_activity_at)}</td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                          STATUS_COLORS[o.status_display || o.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                        )}>
                          {o.status_display || o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-slate-100">
              {companies.map((o) => (
                <li key={o.id} className="p-4">
                  <Link href={`/ats/contacts/companies/${o.id}`} className="font-semibold text-indigo-600">{o.organization_name}</Link>
                  <p className="text-xs text-slate-500 mt-1">{o.organization_type_display || o.organization_type}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span>{o.contact_count ?? 0} people</span>
                    <span>{o.open_job_count ?? 0} jobs</span>
                    <span className={clsx(
                      "ml-auto inline-flex px-2 py-0.5 rounded-full font-semibold",
                      STATUS_COLORS[o.status_display || o.status] ?? "bg-slate-100 text-slate-600",
                    )}>
                      {o.status_display || o.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
          <p>{total.toLocaleString()} total</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary !px-2 !py-1.5 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => {
                if (view === "people") setPeopleFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }));
                else setCompanyFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }));
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              type="button"
              className="btn-secondary !px-2 !py-1.5 disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => {
                if (view === "people") setPeopleFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }));
                else setCompanyFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }));
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <ContactsPageInner />
    </Suspense>
  );
}
