"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Trash2, Save } from "lucide-react";
import { api } from "@/lib/api";
import type { CRMContact, CRMOrganization } from "@/types";
import { CONTACT_TYPES, CONTACT_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import ActivityTimeline from "@/components/crm/ActivityTimeline";
import RelatedJobs from "@/components/crm/RelatedJobs";

export default function ContactDetail({ id, backPath }: { id: number; backPath: string }) {
  const router = useRouter();
  const [contact, setContact] = useState<CRMContact | null>(null);
  const [orgs, setOrgs] = useState<CRMOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, o] = await Promise.all([api.getContact(id), api.getOrganizations()]);
      setContact(c);
      setOrgs(o);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contact.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

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

  const remove = async () => {
    if (!confirm("Delete this contact? This cannot be undone.")) return;
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

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "(no name)";

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Link href={backPath} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft size={15} /> Back
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">{contact.contact_type}</p>
          <h1 className="page-title">{fullName}</h1>
          {contact.organization_name && <p className="page-subtitle">{contact.organization_name}</p>}
          {contact.needs_review && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 mt-2">Needs Review</span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="btn-primary flex items-center gap-2" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
          <button className="btn-danger flex items-center gap-2" onClick={remove}><Trash2 size={14} /> Delete</button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Contact Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">First Name</label><input className="input" value={contact.first_name ?? ""} onChange={update("first_name")} /></div>
              <div><label className="label">Last Name</label><input className="input" value={contact.last_name ?? ""} onChange={update("last_name")} /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={contact.email ?? ""} onChange={update("email")} /></div>
              <div><label className="label">Phone</label><input className="input" value={contact.phone ?? ""} onChange={update("phone")} /></div>
              <div><label className="label">Mobile</label><input className="input" value={contact.mobile ?? ""} onChange={update("mobile")} /></div>
              <div><label className="label">Job Title</label><input className="input" value={contact.job_title ?? ""} onChange={update("job_title")} /></div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={contact.contact_type} onChange={update("contact_type")}>
                  {CONTACT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={contact.status} onChange={update("status")}>
                  {CONTACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Organization</label>
                <select className="input" value={contact.organization_id ?? ""} onChange={update("organization_id")}>
                  <option value="">— None —</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.organization_name}</option>)}
                </select>
              </div>
              <div><label className="label">LinkedIn</label><input className="input" value={contact.linkedin_url ?? ""} onChange={update("linkedin_url")} /></div>
            </div>
            <div><label className="label">Notes</label><textarea className="textarea" rows={3} value={contact.notes ?? ""} onChange={update("notes")} /></div>
          </div>

          <RelatedJobs recruiterContactId={id} />
        </div>

        <div className="space-y-5">
          <ActivityTimeline scope={{ contact_id: id, organization_id: contact.organization_id ?? undefined }} />
        </div>
      </div>
    </div>
  );
}
