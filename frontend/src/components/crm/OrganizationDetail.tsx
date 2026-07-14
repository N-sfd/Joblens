"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft, Trash2, Save, Archive, Unlink } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { CRMOrganization, CRMContact, JobRequirement, Submission, CRMActivity } from "@/types";
import {
  COMPANY_DISPLAY_TYPES,
  COMPANY_DISPLAY_STATUSES,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const TABS = ["Overview", "People", "Jobs", "Pipeline", "Activity"] as const;
type Tab = (typeof TABS)[number];

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function contactName(c: CRMContact) {
  return c.display_name
    || [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
    || c.email
    || "(no name)";
}

export default function OrganizationDetail({ id, backPath }: { id: number; backPath: string }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <OrganizationDetailInner id={id} backPath={backPath} />
    </Suspense>
  );
}

function OrganizationDetailInner({ id, backPath }: { id: number; backPath: string }) {
  const { isAdmin, canWrite } = useAtsRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "Overview";
  const tab = (TABS.includes(tabParam as Tab) ? tabParam : "Overview") as Tab;

  const [org, setOrg] = useState<CRMOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [people, setPeople] = useState<CRMContact[]>([]);
  const [jobs, setJobs] = useState<JobRequirement[]>([]);
  const [pipeline, setPipeline] = useState<Submission[]>([]);
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [linkContactId, setLinkContactId] = useState("");
  const [allContacts, setAllContacts] = useState<CRMContact[]>([]);

  const setTab = (t: Tab) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (t === "Overview") sp.delete("tab");
    else sp.set("tab", t);
    const qs = sp.toString();
    router.replace(qs ? `/ats/contacts/companies/${id}?${qs}` : `/ats/contacts/companies/${id}`, { scroll: false });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const o = await api.getCompany(id);
      setOrg(o);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load company.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!org || tab === "Overview") return;
    let cancelled = false;
    (async () => {
      setTabLoading(true);
      setTabError(null);
      try {
        if (tab === "People") {
          const [rows, pool] = await Promise.all([
            api.getCompanyContacts(id),
            canWrite
              ? api.getContacts({ page_size: 100 }).then((r) => r.items).catch(() => [] as CRMContact[])
              : Promise.resolve([] as CRMContact[]),
          ]);
          if (!cancelled) {
            setPeople(rows);
            setAllContacts(pool);
          }
        } else if (tab === "Jobs") {
          const rows = await api.getCompanyJobs(id);
          if (!cancelled) setJobs(rows);
        } else if (tab === "Pipeline") {
          const rows = await api.getCompanyPipeline(id);
          if (!cancelled) setPipeline(rows);
        } else if (tab === "Activity") {
          const rows = await api.getCompanyActivities(id);
          if (!cancelled) setActivities(rows);
        }
      } catch (e) {
        if (!cancelled) setTabError(e instanceof Error ? e.message : "Failed to load tab.");
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, org, id, canWrite]);

  const update = (field: keyof CRMOrganization) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setOrg((o) => (o ? { ...o, [field]: e.target.value } : o));

  const save = async () => {
    if (!org) return;
    setSaving(true);
    try {
      const updated = await api.updateCompany(id, {
        organization_name: org.organization_name,
        organization_type: org.organization_type,
        website: org.website,
        industry: org.industry,
        address: org.address,
        city: org.city,
        state: org.state,
        country: org.country,
        phone: org.phone,
        status: org.status,
        preferred_vendor_status: org.preferred_vendor_status,
        payment_terms: org.payment_terms,
        contract_status: org.contract_status,
        msa_status: org.msa_status,
        needs_review: false,
        notes: org.notes,
      });
      setOrg(updated);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!confirm("Archive this company?")) return;
    try {
      const updated = await api.updateCompanyStatus(id, "Archived");
      setOrg(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive.");
    }
  };

  const remove = async () => {
    if (!confirm("Delete this company? This cannot be undone if allowed.")) return;
    try {
      await api.deleteCompany(id);
      router.push(backPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    }
  };

  const unlink = async (contactId: number) => {
    try {
      await api.unlinkCompanyContact(id, contactId);
      setPeople((rows) => rows.filter((c) => c.id !== contactId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlink contact.");
    }
  };

  const link = async () => {
    const cid = Number(linkContactId);
    if (!cid) return;
    try {
      const linked = await api.linkCompanyContact(id, cid);
      setPeople((rows) => [...rows.filter((c) => c.id !== linked.id), linked]);
      setLinkContactId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link contact.");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }
  if (!org) {
    return <div className="p-8 max-w-4xl mx-auto">{error && <ErrorBanner message={error} />}</div>;
  }

  const linkable = allContacts.filter((c) => c.organization_id !== id && !people.some((p) => p.id === c.id));

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Link href={backPath} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft size={15} /> Back to Companies
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <p className="page-kicker">{org.organization_type_display || org.organization_type}</p>
          <h1 className="page-title">{org.organization_name}</h1>
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
            <span>{org.contact_count ?? 0} people</span>
            <span>{org.open_job_count ?? 0} open jobs</span>
            <span>{org.active_pipeline_count ?? 0} active pipeline</span>
          </div>
          {org.needs_review && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 mt-2">Needs Review</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {canWrite && (
            <>
              <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={save}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
              <button type="button" className="btn-secondary flex items-center gap-2" onClick={archive}>
                <Archive size={14} /> Archive
              </button>
            </>
          )}
          {isAdmin && (
            <button type="button" className="btn-danger flex items-center gap-2" onClick={remove}>
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={clsx(
              "px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors",
              tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tabError && <ErrorBanner message={tabError} onDismiss={() => setTabError(null)} className="mb-4" />}

      {tab === "Overview" && (
        <div className="space-y-5">
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Company Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Name</label><input className="input" value={org.organization_name} onChange={update("organization_name")} disabled={!canWrite} /></div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={org.organization_type} onChange={update("organization_type")} disabled={!canWrite}>
                  {COMPANY_DISPLAY_TYPES.map((t) => <option key={t}>{t}</option>)}
                  {!COMPANY_DISPLAY_TYPES.includes(org.organization_type as typeof COMPANY_DISPLAY_TYPES[number]) && (
                    <option value={org.organization_type}>{org.organization_type}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={org.status} onChange={update("status")} disabled={!canWrite}>
                  {COMPANY_DISPLAY_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  {!COMPANY_DISPLAY_STATUSES.includes(org.status as typeof COMPANY_DISPLAY_STATUSES[number]) && (
                    <option value={org.status}>{org.status}</option>
                  )}
                </select>
              </div>
              <div><label className="label">Industry</label><input className="input" value={org.industry ?? ""} onChange={update("industry")} disabled={!canWrite} /></div>
              <div><label className="label">Website</label><input className="input" value={org.website ?? ""} onChange={update("website")} disabled={!canWrite} /></div>
              <div><label className="label">Phone</label><input className="input" value={org.phone ?? ""} onChange={update("phone")} disabled={!canWrite} /></div>
              <div><label className="label">City</label><input className="input" value={org.city ?? ""} onChange={update("city")} disabled={!canWrite} /></div>
              <div><label className="label">State</label><input className="input" value={org.state ?? ""} onChange={update("state")} disabled={!canWrite} /></div>
            </div>
          </div>
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Contract & Terms</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Preferred Vendor Status</label><input className="input" value={org.preferred_vendor_status ?? ""} onChange={update("preferred_vendor_status")} disabled={!canWrite} /></div>
              <div><label className="label">Payment Terms</label><input className="input" value={org.payment_terms ?? ""} onChange={update("payment_terms")} disabled={!canWrite} /></div>
              <div><label className="label">Contract Status</label><input className="input" value={org.contract_status ?? ""} onChange={update("contract_status")} disabled={!canWrite} /></div>
              <div><label className="label">MSA Status</label><input className="input" value={org.msa_status ?? ""} onChange={update("msa_status")} disabled={!canWrite} /></div>
            </div>
            <div><label className="label">Notes</label><textarea className="textarea" rows={3} value={org.notes ?? ""} onChange={update("notes")} disabled={!canWrite} /></div>
          </div>
        </div>
      )}

      {tab === "People" && (
        <div className="card p-5 space-y-4">
          {canWrite && (
            <div className="flex flex-col sm:flex-row gap-2">
              <select className="input flex-1" value={linkContactId} onChange={(e) => setLinkContactId(e.target.value)}>
                <option value="">Link existing contact…</option>
                {linkable.map((c) => (
                  <option key={c.id} value={c.id}>{contactName(c)}</option>
                ))}
              </select>
              <button type="button" className="btn-secondary" disabled={!linkContactId} onClick={link}>Link</button>
              <Link href={`/ats/contacts/new?company_id=${id}`} className="btn-primary text-center">Add Contact</Link>
            </div>
          )}
          {tabLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
          ) : people.length === 0 ? (
            <p className="text-sm text-slate-400">No people linked to this company.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {people.map((c) => (
                <li key={c.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <Link href={`/ats/contacts/${c.id}`} className="font-medium text-indigo-600 hover:text-indigo-800 text-sm">
                      {contactName(c)}
                    </Link>
                    <span className="text-xs text-slate-400 ml-2">{c.contact_type_display || c.contact_type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">{c.email ?? ""}</span>
                    {canWrite && (
                      <button type="button" className="text-slate-400 hover:text-red-600" title="Unlink" onClick={() => unlink(c.id)}>
                        <Unlink size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "Jobs" && (
        <div className="card overflow-hidden">
          {tabLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate-400 p-6">No jobs linked to this company.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Location</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/ats/jobs/${j.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">{j.job_title}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{j.location || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{j.status_display || j.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "Pipeline" && (
        <div className="card overflow-hidden">
          {tabLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
          ) : pipeline.length === 0 ? (
            <p className="text-sm text-slate-400 p-6">No pipeline records for this company.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Candidate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Job</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pipeline.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/ats/pipeline/${s.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                        {s.employee_name || `#${s.employee_id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.job_title || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{s.status_display || s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "Activity" && (
        <div className="card p-5">
          {tabLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
          ) : activities.length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activities.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{a.subject || a.activity_type}</p>
                      {a.description && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{a.description}</p>}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{formatDateTime(a.activity_date)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
