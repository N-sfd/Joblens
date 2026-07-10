"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, Search, X } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { CRMContact, CRMContactCreate, CRMOrganization } from "@/types";
import { CONTACT_TYPES, CONTACT_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Inactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  "Do Not Contact": "bg-red-50 text-red-700 ring-1 ring-red-200",
  "Bounced Email": "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Unsubscribed: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

export default function ContactsView({
  title,
  subtitle,
  detailBasePath,
  fixedType,
}: {
  title: string;
  subtitle: string;
  detailBasePath: string; // e.g. /crm/recruiters or /crm/contacts
  fixedType?: string; // if set, only show/create this contact_type
}) {
  const { canWrite } = useAtsRole();
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [orgs, setOrgs] = useState<CRMOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, o] = await Promise.all([
        api.getContacts(fixedType ? { contact_type: fixedType } : undefined),
        api.getOrganizations(),
      ]);
      setContacts(c);
      setOrgs(o);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fixedType]);

  const filtered = contacts.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const hay = `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.email ?? ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">CRM</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary flex items-center gap-2 shrink-0">
            {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> Add</>}
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      {canWrite && showForm && (
        <NewContactForm
          orgs={orgs}
          fixedType={fixedType}
          onCreated={() => { setShowForm(false); load(); }}
          onError={setError}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input sm:w-56" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {CONTACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        {(search || statusFilter) && (
          <button className="btn-secondary" onClick={() => { setSearch(""); setStatusFilter(""); }}>Clear</button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-500 font-medium">No contacts found.</p>
            <p className="text-slate-400 text-sm mt-1">Add your first one to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Name", "Type", "Organization", "Email", "Phone", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`${detailBasePath}/${c.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || "(no name)"}
                      </Link>
                      {c.needs_review && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">Needs Review</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.contact_type}</td>
                    <td className="px-4 py-3 text-slate-500">{c.organization_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                        STATUS_COLORS[c.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                      )}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`${detailBasePath}/${c.id}`} className="text-slate-400 hover:text-indigo-600 text-sm">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NewContactForm({
  orgs,
  fixedType,
  onCreated,
  onError,
}: {
  orgs: CRMOrganization[];
  fixedType?: string;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState<CRMContactCreate>({
    first_name: "", last_name: "", email: "", phone: "",
    contact_type: fixedType ?? "Recruiter", status: "Active", organization_id: null,
  });
  const [saving, setSaving] = useState(false);

  const update = (field: keyof CRMContactCreate) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, [field]: field === "organization_id" ? (val ? Number(val) : null) : val }));
  };

  const save = async () => {
    if (!form.first_name?.trim() && !form.last_name?.trim() && !form.email?.trim()) {
      onError("Enter at least a name or email."); return;
    }
    setSaving(true);
    try {
      await api.createContact(form);
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to create contact.");
      setSaving(false);
    }
  };

  return (
    <div className="card p-5 mb-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">First Name</label>
          <input className="input" value={form.first_name ?? ""} onChange={update("first_name")} />
        </div>
        <div>
          <label className="label">Last Name</label>
          <input className="input" value={form.last_name ?? ""} onChange={update("last_name")} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email ?? ""} onChange={update("email")} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone ?? ""} onChange={update("phone")} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.contact_type} onChange={update("contact_type")} disabled={!!fixedType}>
            {CONTACT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={update("status")}>
            {CONTACT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Organization</label>
          <select className="input" value={form.organization_id ?? ""} onChange={update("organization_id")}>
            <option value="">— None —</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.organization_name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Job Title</label>
        <input className="input" value={form.job_title ?? ""} onChange={update("job_title")} placeholder="Senior Technical Recruiter" />
      </div>
      <div className="flex justify-end gap-3">
        <button className="btn-primary flex items-center gap-2" disabled={saving} onClick={save}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Create"}
        </button>
      </div>
    </div>
  );
}
