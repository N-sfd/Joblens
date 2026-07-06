"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { Employee, EmployeeUpdate, EmployeeResume } from "@/types";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, EMPLOYEE_AVAILABILITIES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

// employee field -> parsed_data key (for "Filled from resume" detection)
const RESUME_FIELD_MAP: Record<string, string> = {
  first_name: "first_name",
  middle_name: "middle_name",
  last_name: "last_name",
  personal_email: "email",
  phone: "phone",
  current_location: "current_location",
  current_job_title: "current_job_title",
  primary_skill: "primary_skill",
  secondary_skills: "secondary_skills",
  total_experience: "total_experience_years",
  relevant_experience_years: "relevant_experience_years",
  linkedin_url: "linkedin_url",
  notes: "professional_summary",
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export default function EditEmployeePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const employeeId = Number(params.id);

  const [form, setForm] = useState<Employee | null>(null);
  const [resume, setResume] = useState<EmployeeResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const emp = await api.getEmployee(employeeId);
        setForm(emp);
        setError(null);
        try {
          setResume(await api.getLatestEmployeeResume(employeeId));
        } catch {
          setResume(null); // no resume yet — fine
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load employee.");
      } finally {
        setLoading(false);
      }
    })();
  }, [employeeId]);

  // Fields whose current value matches the latest parsed resume value.
  const filledFromResume = useMemo(() => {
    const set = new Set<string>();
    if (!form || !resume?.parsed_data) return set;
    const pd = resume.parsed_data as Record<string, unknown>;
    for (const [field, key] of Object.entries(RESUME_FIELD_MAP)) {
      let resumeVal = pd[key];
      if (key === "secondary_skills" && Array.isArray(resumeVal)) resumeVal = resumeVal.join(", ");
      const current = (form as unknown as Record<string, unknown>)[field];
      if (norm(current) && norm(current) === norm(resumeVal)) set.add(field);
    }
    return set;
  }, [form, resume]);

  const update = (field: keyof Employee) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => (f ? { ...f, [field]: e.target.value } : f));

  // Label wraps its control so the field is programmatically associated.
  const Field = ({ text, field, children }: { text: string; field?: string; children: ReactElement }) => (
    <label className="block">
      <span className="label flex items-center gap-2">
        {text}
        {field && filledFromResume.has(field) && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
            <Sparkles size={9} /> Filled from resume
          </span>
        )}
      </span>
      {children}
    </label>
  );

  const save = async () => {
    if (!form) return;
    if (!form.name || !form.email) { setError("Name and email are required."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: EmployeeUpdate = {
        name: form.name, email: form.email,
        first_name: form.first_name, middle_name: form.middle_name, last_name: form.last_name,
        personal_email: form.personal_email, company_email: form.company_email,
        phone: form.phone, alternate_phone: form.alternate_phone,
        location: form.location, current_location: form.current_location,
        current_employer: form.current_employer, current_job_title: form.current_job_title,
        work_authorization: form.work_authorization, visa_status: form.visa_status,
        visa_expiration_date: form.visa_expiration_date,
        employment_type: form.employment_type, primary_skill: form.primary_skill,
        secondary_skills: form.secondary_skills, total_experience: form.total_experience,
        relevant_experience_years: form.relevant_experience_years,
        availability: form.availability, available_from: form.available_from,
        current_rate: form.current_rate, expected_rate: form.expected_rate, rate_type: form.rate_type,
        remote_preference: form.remote_preference, status: form.status,
        linkedin_url: form.linkedin_url, portfolio_url: form.portfolio_url, notes: form.notes,
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
        <p className="page-subtitle">Fields marked <span className="text-indigo-600 font-medium">Filled from resume</span> were populated automatically — edit anything before saving.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 text-sm">Identity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field text="Name *"><input title="Name" className="input" value={form.name} onChange={update("name")} /></Field>
          <Field text="Employee Code"><input title="Employee Code" className="input" value={form.employee_code ?? ""} onChange={update("employee_code")} /></Field>
          <Field text="First Name" field="first_name"><input title="First Name" className="input" value={form.first_name ?? ""} onChange={update("first_name")} /></Field>
          <Field text="Middle Name" field="middle_name"><input title="Middle Name" className="input" value={form.middle_name ?? ""} onChange={update("middle_name")} /></Field>
          <Field text="Last Name" field="last_name"><input title="Last Name" className="input" value={form.last_name ?? ""} onChange={update("last_name")} /></Field>
        </div>

        <h3 className="font-semibold text-slate-800 text-sm pt-2">Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field text="Email *"><input title="Email" className="input" type="email" value={form.email} onChange={update("email")} /></Field>
          <Field text="Personal Email" field="personal_email"><input title="Personal Email" className="input" type="email" value={form.personal_email ?? ""} onChange={update("personal_email")} /></Field>
          <Field text="Company Email"><input title="Company Email" className="input" type="email" value={form.company_email ?? ""} onChange={update("company_email")} /></Field>
          <Field text="Phone" field="phone"><input title="Phone" className="input" value={form.phone ?? ""} onChange={update("phone")} /></Field>
          <Field text="Alternate Phone"><input title="Alternate Phone" className="input" value={form.alternate_phone ?? ""} onChange={update("alternate_phone")} /></Field>
          <Field text="Current Location" field="current_location"><input title="Current Location" className="input" value={form.current_location ?? ""} onChange={update("current_location")} /></Field>
          <Field text="Location"><input title="Location" className="input" value={form.location ?? ""} onChange={update("location")} /></Field>
          <Field text="LinkedIn URL" field="linkedin_url"><input title="LinkedIn URL" className="input" value={form.linkedin_url ?? ""} onChange={update("linkedin_url")} /></Field>
        </div>

        <h3 className="font-semibold text-slate-800 text-sm pt-2">Skills &amp; Experience</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field text="Current Job Title" field="current_job_title"><input title="Current Job Title" className="input" value={form.current_job_title ?? ""} onChange={update("current_job_title")} /></Field>
          <Field text="Current Employer"><input title="Current Employer" className="input" value={form.current_employer ?? ""} onChange={update("current_employer")} /></Field>
          <Field text="Primary Skill" field="primary_skill"><input title="Primary Skill" className="input" value={form.primary_skill ?? ""} onChange={update("primary_skill")} /></Field>
          <Field text="Total Experience (years)" field="total_experience"><input title="Total Experience" className="input" value={form.total_experience ?? ""} onChange={update("total_experience")} /></Field>
          <Field text="Relevant Experience (years)" field="relevant_experience_years"><input title="Relevant Experience" className="input" value={form.relevant_experience_years ?? ""} onChange={update("relevant_experience_years")} /></Field>
          <Field text="Employment Type">
            <select title="Employment Type" className="input" value={form.employment_type ?? ""} onChange={update("employment_type")}>
              <option value="">— Select —</option>
              {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field text="Secondary Skills" field="secondary_skills"><input title="Secondary Skills" className="input" value={form.secondary_skills ?? ""} onChange={update("secondary_skills")} /></Field>

        <h3 className="font-semibold text-slate-800 text-sm pt-2">Work Authorization <span className="font-normal text-slate-400">(never auto-filled)</span></h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field text="Work Authorization"><input title="Work Authorization" className="input" value={form.work_authorization ?? ""} onChange={update("work_authorization")} /></Field>
          <Field text="Visa Status"><input title="Visa Status" className="input" value={form.visa_status ?? ""} onChange={update("visa_status")} /></Field>
          <Field text="Visa Expiration"><input title="Visa Expiration" className="input" value={form.visa_expiration_date ?? ""} onChange={update("visa_expiration_date")} /></Field>
        </div>

        <h3 className="font-semibold text-slate-800 text-sm pt-2">Rate &amp; Availability <span className="font-normal text-slate-400">(never auto-filled)</span></h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field text="Availability">
            <select title="Availability" className="input" value={form.availability ?? ""} onChange={update("availability")}>
              <option value="">— Select —</option>
              {EMPLOYEE_AVAILABILITIES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <Field text="Available From"><input title="Available From" className="input" value={form.available_from ?? ""} onChange={update("available_from")} /></Field>
          <Field text="Current Rate"><input title="Current Rate" className="input" value={form.current_rate ?? ""} onChange={update("current_rate")} /></Field>
          <Field text="Expected Rate"><input title="Expected Rate" className="input" value={form.expected_rate ?? ""} onChange={update("expected_rate")} /></Field>
          <Field text="Rate Type"><input title="Rate Type" className="input" value={form.rate_type ?? ""} onChange={update("rate_type")} /></Field>
          <Field text="Remote Preference"><input title="Remote Preference" className="input" value={form.remote_preference ?? ""} onChange={update("remote_preference")} /></Field>
          <Field text="Status">
            <select title="Status" className="input" value={form.status} onChange={update("status")}>
              {EMPLOYEE_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field text="Notes / Professional Summary" field="notes"><textarea title="Notes" className="textarea" rows={4} value={form.notes ?? ""} onChange={update("notes")} /></Field>
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
