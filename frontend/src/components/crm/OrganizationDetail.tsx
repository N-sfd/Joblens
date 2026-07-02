"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Trash2, Save } from "lucide-react";
import { api } from "@/lib/api";
import type { CRMOrganization, CRMContact } from "@/types";
import { ORGANIZATION_TYPES, ORGANIZATION_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import ActivityTimeline from "@/components/crm/ActivityTimeline";

export default function OrganizationDetail({ id, backPath }: { id: number; backPath: string }) {
  const router = useRouter();
  const [org, setOrg] = useState<CRMOrganization | null>(null);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [o, c] = await Promise.all([api.getOrganization(id), api.getContacts({ organization_id: id })]);
      setOrg(o);
      setContacts(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organization.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const update = (field: keyof CRMOrganization) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setOrg((o) => (o ? { ...o, [field]: e.target.value } : o));

  const save = async () => {
    if (!org) return;
    setSaving(true);
    try {
      const updated = await api.updateOrganization(id, {
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

  const remove = async () => {
    if (!confirm("Delete this organization? This cannot be undone.")) return;
    try {
      await api.deleteOrganization(id);
      router.push(backPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }
  if (!org) {
    return <div className="p-8 max-w-4xl mx-auto">{error && <ErrorBanner message={error} />}</div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Link href={backPath} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft size={15} /> Back
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">{org.organization_type}</p>
          <h1 className="page-title">{org.organization_name}</h1>
          {org.needs_review && (
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
            <h3 className="font-semibold text-slate-900">Organization Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Name</label><input className="input" value={org.organization_name} onChange={update("organization_name")} /></div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={org.organization_type} onChange={update("organization_type")}>
                  {ORGANIZATION_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={org.status} onChange={update("status")}>
                  {ORGANIZATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="label">Industry</label><input className="input" value={org.industry ?? ""} onChange={update("industry")} /></div>
              <div><label className="label">Website</label><input className="input" value={org.website ?? ""} onChange={update("website")} /></div>
              <div><label className="label">Phone</label><input className="input" value={org.phone ?? ""} onChange={update("phone")} /></div>
              <div><label className="label">City</label><input className="input" value={org.city ?? ""} onChange={update("city")} /></div>
              <div><label className="label">State</label><input className="input" value={org.state ?? ""} onChange={update("state")} /></div>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Contract & Terms</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Preferred Vendor Status</label><input className="input" value={org.preferred_vendor_status ?? ""} onChange={update("preferred_vendor_status")} /></div>
              <div><label className="label">Payment Terms</label><input className="input" value={org.payment_terms ?? ""} onChange={update("payment_terms")} placeholder="Net 30" /></div>
              <div><label className="label">Contract Status</label><input className="input" value={org.contract_status ?? ""} onChange={update("contract_status")} /></div>
              <div><label className="label">MSA Status</label><input className="input" value={org.msa_status ?? ""} onChange={update("msa_status")} /></div>
            </div>
            <div><label className="label">Notes</label><textarea className="textarea" rows={3} value={org.notes ?? ""} onChange={update("notes")} /></div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Related Contacts</h3>
            {contacts.length === 0 ? (
              <p className="text-sm text-slate-400">No contacts linked to this organization.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {contacts.map((c) => (
                  <li key={c.id} className="py-2 flex items-center justify-between">
                    <div>
                      <Link href={`/crm/contacts/${c.id}`} className="font-medium text-indigo-600 hover:text-indigo-800 text-sm">
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || "(no name)"}
                      </Link>
                      <span className="text-xs text-slate-400 ml-2">{c.contact_type}</span>
                    </div>
                    <span className="text-sm text-slate-500">{c.email ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <PlaceholderSections />
        </div>

        <div className="space-y-5">
          <ActivityTimeline scope={{ organization_id: id }} />
        </div>
      </div>
    </div>
  );
}

function PlaceholderSections() {
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-900 mb-3">Related (coming soon)</h3>
      <div className="grid grid-cols-2 gap-2 text-sm text-slate-400">
        <div className="rounded-lg border border-dashed border-slate-200 p-3">Related Jobs</div>
        <div className="rounded-lg border border-dashed border-slate-200 p-3">Submissions</div>
      </div>
    </div>
  );
}
