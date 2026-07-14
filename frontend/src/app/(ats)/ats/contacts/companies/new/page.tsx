"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { CRMOrganizationCreate, CompanyDuplicateMatch } from "@/types";
import { COMPANY_DISPLAY_TYPES, COMPANY_DISPLAY_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

export default function NewCompanyPage() {
  const router = useRouter();
  const { canWrite, loading: roleLoading } = useAtsRole();
  const [form, setForm] = useState<CRMOrganizationCreate>({
    organization_name: "",
    organization_type: "Client",
    status: "Active",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<CompanyDuplicateMatch[]>([]);
  const [forceNew, setForceNew] = useState(false);

  const update = (field: keyof CRMOrganizationCreate) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async () => {
    if (!form.organization_name?.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!forceNew) {
        const dup = await api.checkCompanyDuplicates({
          organization_name: form.organization_name,
          website: form.website,
          email_domain: form.email_domain,
        });
        if (dup.matches?.length) {
          setDuplicates(dup.matches);
          setSaving(false);
          return;
        }
      }
      const created = await api.createCompany(form, { forceNew });
      router.push(`/ats/contacts/companies/${created.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const detail = e.detail as { matches?: CompanyDuplicateMatch[]; message?: string } | undefined;
        if (detail?.matches?.length) {
          setDuplicates(detail.matches);
          setError(detail.message || "A possible existing company was found.");
        } else {
          setError(e.message);
        }
      } else {
        setError(e instanceof Error ? e.message : "Failed to create company.");
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
        <ErrorBanner message="You do not have permission to add companies." />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      <Link href="/ats/contacts?view=companies" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft size={15} /> Back to Companies
      </Link>
      <p className="page-kicker">CRM</p>
      <h1 className="page-title mb-6">Add Company</h1>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      {duplicates.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900 mb-2">Possible duplicates found</p>
          <ul className="space-y-1 mb-3">
            {duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/ats/contacts/companies/${d.id}`} className="text-sm text-indigo-700 hover:underline">
                  {d.organization_name} — {d.match_reason}
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
        <div>
          <label className="label">Company Name</label>
          <input className="input" value={form.organization_name} onChange={update("organization_name")} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.organization_type} onChange={update("organization_type")}>
              {COMPANY_DISPLAY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={update("status")}>
              {COMPANY_DISPLAY_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Website</label>
            <input className="input" value={form.website ?? ""} onChange={update("website")} placeholder="https://" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone ?? ""} onChange={update("phone")} />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Link href="/ats/contacts?view=companies" className="btn-secondary">Cancel</Link>
          <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={save}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Create Company"}
          </button>
        </div>
      </div>
    </div>
  );
}
