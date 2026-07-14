"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { CRMContactCreate, CRMOrganization, ContactDuplicateMatch } from "@/types";
import { CONTACT_DISPLAY_TYPES, CONTACT_DISPLAY_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

function NewContactInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canWrite, loading: roleLoading } = useAtsRole();
  const companyIdParam = searchParams.get("company_id");

  const [orgs, setOrgs] = useState<CRMOrganization[]>([]);
  const [form, setForm] = useState<CRMContactCreate>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    contact_type: "Recruiter",
    status: "Active",
    organization_id: companyIdParam ? Number(companyIdParam) : null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<ContactDuplicateMatch[]>([]);
  const [forceNew, setForceNew] = useState(false);

  useEffect(() => {
    api.getCompanies({ page_size: 100 })
      .then((r) => setOrgs(r.items))
      .catch(() => setOrgs([]));
  }, []);

  const update = (field: keyof CRMContactCreate) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, [field]: field === "organization_id" ? (val ? Number(val) : null) : val }));
  };

  const save = async () => {
    if (!form.first_name?.trim() && !form.last_name?.trim() && !form.email?.trim()) {
      setError("Enter at least a name or email.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!forceNew && (form.email || form.phone)) {
        const dup = await api.checkContactDuplicates({
          email: form.email,
          phone: form.phone,
        });
        if (dup.matches?.length) {
          setDuplicates(dup.matches);
          setSaving(false);
          return;
        }
      }
      const created = await api.createContact(form, { forceNew });
      router.push(`/ats/contacts/${created.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const detail = e.detail as { matches?: ContactDuplicateMatch[]; message?: string } | undefined;
        if (detail?.matches?.length) {
          setDuplicates(detail.matches);
          setError(detail.message || "A possible existing contact was found.");
        } else {
          setError(e.message);
        }
      } else {
        setError(e instanceof Error ? e.message : "Failed to create contact.");
      }
      setSaving(false);
    }
  };

  if (roleLoading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  if (!canWrite) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <ErrorBanner message="You do not have permission to add contacts." />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      <Link href="/ats/contacts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft size={15} /> Back to Contacts
      </Link>
      <p className="page-kicker">CRM</p>
      <h1 className="page-title mb-6">Add Contact</h1>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      {duplicates.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900 mb-2">Possible duplicates found</p>
          <ul className="space-y-1 mb-3">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/ats/contacts/${d.id}`} className="text-sm text-indigo-700 hover:underline">
                  {d.display_name} {d.email ? `(${d.email})` : ""} — {d.match_reason}
                </Link>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm text-amber-900">
            <input type="checkbox" checked={forceNew} onChange={(e) => setForceNew(e.target.checked)} />
            Create as new anyway (admin)
          </label>
        </div>
      )}

      <div className="card p-5 space-y-4">
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
            <select className="input" value={form.contact_type} onChange={update("contact_type")}>
              {CONTACT_DISPLAY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={update("status")}>
              {CONTACT_DISPLAY_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Company</label>
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
        <p className="text-xs text-slate-500">
          Need a new company?{" "}
          <Link href="/ats/contacts/companies/new" className="text-indigo-600 hover:underline">Add Company</Link>
        </p>
        <div className="flex justify-end gap-3">
          <Link href="/ats/contacts" className="btn-secondary">Cancel</Link>
          <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={save}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Create Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewContactPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <NewContactInner />
    </Suspense>
  );
}
