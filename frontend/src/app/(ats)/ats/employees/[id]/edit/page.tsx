"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Employee, EmployeeUpdate } from "@/types";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, EMPLOYEE_AVAILABILITIES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

export default function EditEmployeePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const employeeId = Number(params.id);

  const [form, setForm] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setForm(await api.getEmployee(employeeId));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load employee.");
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  const update = (field: keyof Employee) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => (f ? { ...f, [field]: e.target.value } : f));

  const save = async () => {
    if (!form) return;
    if (!form.name || !form.email) { setError("Name and email are required."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: EmployeeUpdate = {
        name: form.name, email: form.email,
        first_name: form.first_name, last_name: form.last_name,
        phone: form.phone, location: form.location, current_location: form.current_location,
        work_authorization: form.work_authorization, visa_status: form.visa_status,
        employment_type: form.employment_type, primary_skill: form.primary_skill,
        secondary_skills: form.secondary_skills, total_experience: form.total_experience,
        availability: form.availability, expected_rate: form.expected_rate, rate_type: form.rate_type,
        remote_preference: form.remote_preference, status: form.status,
        linkedin_url: form.linkedin_url, notes: form.notes,
      };
      await api.updateEmployee(employeeId, payload);
      router.push(`/ats/employees/${employeeId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes.");
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }
  if (!form) {
    return <div className="p-8 max-w-3xl mx-auto">{error && <ErrorBanner message={error} />}</div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href={`/ats/employees/${employeeId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back
      </Link>

      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Edit Employee</h1>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="label">Name *</label><input className="input" value={form.name} onChange={update("name")} /></div>
          <div><label className="label">Email *</label><input className="input" type="email" value={form.email} onChange={update("email")} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone ?? ""} onChange={update("phone")} /></div>
          <div><label className="label">Location</label><input className="input" value={form.location ?? ""} onChange={update("location")} /></div>
          <div><label className="label">Work Authorization</label><input className="input" value={form.work_authorization ?? ""} onChange={update("work_authorization")} /></div>
          <div><label className="label">Visa Status</label><input className="input" value={form.visa_status ?? ""} onChange={update("visa_status")} /></div>
          <div>
            <label className="label">Employment Type</label>
            <select className="input" value={form.employment_type ?? ""} onChange={update("employment_type")}>
              <option value="">— Select —</option>
              {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Availability</label>
            <select className="input" value={form.availability ?? ""} onChange={update("availability")}>
              <option value="">— Select —</option>
              {EMPLOYEE_AVAILABILITIES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div><label className="label">Primary Skill</label><input className="input" value={form.primary_skill ?? ""} onChange={update("primary_skill")} /></div>
          <div><label className="label">Total Experience</label><input className="input" value={form.total_experience ?? ""} onChange={update("total_experience")} /></div>
          <div><label className="label">Expected Rate</label><input className="input" value={form.expected_rate ?? ""} onChange={update("expected_rate")} /></div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={update("status")}>
              {EMPLOYEE_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Secondary Skills</label><input className="input" value={form.secondary_skills ?? ""} onChange={update("secondary_skills")} /></div>
        <div><label className="label">Notes</label><textarea className="textarea" rows={4} value={form.notes ?? ""} onChange={update("notes")} /></div>
      </div>

      <div className="flex gap-3 justify-end mt-5">
        <button className="btn-secondary" onClick={() => router.push(`/ats/employees/${employeeId}`)}>Cancel</button>
        <button className="btn-primary flex items-center gap-2" disabled={saving} onClick={save}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
