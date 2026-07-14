"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft, Trash2, Save, Phone, Archive } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { CRMContact, CRMOrganization, JobRequirement, Submission, CRMActivity, MarkContactedPayload } from "@/types";
import {
  CONTACT_DISPLAY_TYPES,
  CONTACT_DISPLAY_STATUSES,
  CONTACT_METHODS,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const TABS = ["Overview", "Jobs", "Pipeline", "Activity"] as const;
type Tab = (typeof TABS)[number];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function displayName(c: CRMContact) {
  return c.display_name
    || [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
    || c.email
    || "(no name)";
}

export default function ContactDetail({ id, backPath }: { id: number; backPath: string }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <ContactDetailInner id={id} backPath={backPath} />
    </Suspense>
  );
}

function ContactDetailInner({ id, backPath }: { id: number; backPath: string }) {
  const { isAdmin, canWrite } = useAtsRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "Overview";
  const tab = (TABS.includes(tabParam as Tab) ? tabParam : "Overview") as Tab;

  const [contact, setContact] = useState<CRMContact | null>(null);
  const [orgs, setOrgs] = useState<CRMOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [jobs, setJobs] = useState<JobRequirement[]>([]);
  const [pipeline, setPipeline] = useState<Submission[]>([]);
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [showMarkContacted, setShowMarkContacted] = useState(false);

  const setTab = (t: Tab) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (t === "Overview") sp.delete("tab");
    else sp.set("tab", t);
    const qs = sp.toString();
    router.replace(qs ? `/ats/contacts/${id}?${qs}` : `/ats/contacts/${id}`, { scroll: false });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, o] = await Promise.all([
        api.getContact(id),
        api.getCompanies({ page_size: 100 }).then((r) => r.items).catch(() => [] as CRMOrganization[]),
      ]);
      setContact(c);
      setOrgs(o);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contact.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!contact || tab === "Overview") return;
    let cancelled = false;
    (async () => {
      setTabLoading(true);
      setTabError(null);
      try {
        if (tab === "Jobs") {
          const rows = await api.getContactJobs(id);
          if (!cancelled) setJobs(rows);
        } else if (tab === "Pipeline") {
          const rows = await api.getContactPipeline(id);
          if (!cancelled) setPipeline(rows);
        } else if (tab === "Activity") {
          const rows = await api.getContactActivities(id);
          if (!cancelled) setActivities(rows);
        }
      } catch (e) {
        if (!cancelled) setTabError(e instanceof Error ? e.message : "Failed to load tab.");
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, contact, id]);

  const update = (field: keyof CRMContact) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const val = e.target.value;
    setContact((c) => (c ? { ...c, [field]: field === "organization_id" ? (val ? Number(val) : null) : val } : c));
  };

  const save = async () => {
    if (!contact) return;
    setSaving(true);
    try {
      const updated = await api.updateContact(id, {
        organization_id: contact.organization_id,
        first_name: contact.first_name,
        last_name: contact.last_name,
        job_title: contact.job_title,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        contact_type: contact.contact_type,
        status: contact.status,
        linkedin_url: contact.linkedin_url,
        preferred_contact_method: contact.preferred_contact_method,
        needs_review: false,
        notes: contact.notes,
      });
      setContact(updated);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!confirm("Archive this contact?")) return;
    try {
      const updated = await api.updateContactStatus(id, "Archived");
      setContact(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive.");
    }
  };

  const remove = async () => {
    if (!confirm("Delete this contact? This cannot be undone if allowed.")) return;
    try {
      await api.deleteContact(id);
      router.push(backPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }
  if (!contact) {
    return <div className="p-8 max-w-4xl mx-auto">{error && <ErrorBanner message={error} />}</div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Link href={backPath} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft size={15} /> Back to Contacts
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <p className="page-kicker">{contact.contact_type_display || contact.contact_type}</p>
          <h1 className="page-title">{displayName(contact)}</h1>
          {contact.organization_id ? (
            <p className="page-subtitle">
              <Link href={`/ats/contacts/companies/${contact.organization_id}`} className="hover:text-indigo-600">
                {contact.organization_name}
              </Link>
            </p>
          ) : contact.organization_name ? (
            <p className="page-subtitle">{contact.organization_name}</p>
          ) : null}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
            <span>{contact.open_job_count ?? 0} open jobs</span>
            <span>{contact.active_pipeline_count ?? 0} active pipeline</span>
            <span>Last contacted {formatDate(contact.last_contacted_at)}</span>
          </div>
          {contact.needs_review && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 mt-2">Needs Review</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {canWrite && (
            <>
              <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => setShowMarkContacted(true)}>
                <Phone size={14} /> Mark Contacted
              </button>
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
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-slate-900">Contact Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">First Name</label><input className="input" value={contact.first_name ?? ""} onChange={update("first_name")} disabled={!canWrite} /></div>
            <div><label className="label">Last Name</label><input className="input" value={contact.last_name ?? ""} onChange={update("last_name")} disabled={!canWrite} /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={contact.email ?? ""} onChange={update("email")} disabled={!canWrite} /></div>
            <div><label className="label">Phone</label><input className="input" value={contact.phone ?? ""} onChange={update("phone")} disabled={!canWrite} /></div>
            <div><label className="label">Mobile</label><input className="input" value={contact.mobile ?? ""} onChange={update("mobile")} disabled={!canWrite} /></div>
            <div><label className="label">Job Title</label><input className="input" value={contact.job_title ?? ""} onChange={update("job_title")} disabled={!canWrite} /></div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={contact.contact_type} onChange={update("contact_type")} disabled={!canWrite}>
                {CONTACT_DISPLAY_TYPES.map((t) => <option key={t}>{t}</option>)}
                {!CONTACT_DISPLAY_TYPES.includes(contact.contact_type as typeof CONTACT_DISPLAY_TYPES[number]) && (
                  <option value={contact.contact_type}>{contact.contact_type}</option>
                )}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={contact.status} onChange={update("status")} disabled={!canWrite}>
                {CONTACT_DISPLAY_STATUSES.map((s) => <option key={s}>{s}</option>)}
                {!CONTACT_DISPLAY_STATUSES.includes(contact.status as typeof CONTACT_DISPLAY_STATUSES[number]) && (
                  <option value={contact.status}>{contact.status}</option>
                )}
              </select>
            </div>
            <div>
              <label className="label">Company</label>
              <select className="input" value={contact.organization_id ?? ""} onChange={update("organization_id")} disabled={!canWrite}>
                <option value="">— None —</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.organization_name}</option>)}
              </select>
            </div>
            <div><label className="label">LinkedIn</label><input className="input" value={contact.linkedin_url ?? ""} onChange={update("linkedin_url")} disabled={!canWrite} /></div>
          </div>
          <div><label className="label">Notes</label><textarea className="textarea" rows={3} value={contact.notes ?? ""} onChange={update("notes")} disabled={!canWrite} /></div>
        </div>
      )}

      {tab === "Jobs" && (
        <div className="card overflow-hidden">
          {tabLoading ? (
            <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate-400 p-6">No jobs linked to this contact.</p>
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
            <p className="text-sm text-slate-400 p-6">No pipeline records for this contact.</p>
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

      {showMarkContacted && (
        <MarkContactedModal
          onClose={() => setShowMarkContacted(false)}
          onSave={async (payload) => {
            const updated = await api.markContacted(id, payload);
            setContact(updated);
            setShowMarkContacted(false);
            if (tab === "Activity") {
              const rows = await api.getContactActivities(id);
              setActivities(rows);
            }
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function MarkContactedModal({
  onClose,
  onSave,
  onError,
}: {
  onClose: () => void;
  onSave: (payload: MarkContactedPayload) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [method, setMethod] = useState("email");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        method,
        subject: subject.trim() || null,
        notes: notes.trim() || null,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to mark contacted.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-slate-900">Mark Contacted</h3>
        <div>
          <label className="label">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {CONTACT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Subject (optional)</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={submit}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
