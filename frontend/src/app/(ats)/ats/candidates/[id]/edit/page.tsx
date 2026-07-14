"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Employee, EmployeeUpdate } from "@/types";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, EMPLOYEE_AVAILABILITIES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

export default function EditCandidatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const candidateId = Number(params.id);

  const [form, setForm] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setForm(await api.getCandidate(candidateId));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load candidate.");
      } finally {
        setLoading(false);
      }
    })();
  }, [candidateId]);

  const update = (field: keyof Employee) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => (f ? { ...f, [field]: e.target.value } : f));

  const save = async () => {
    if (!form) return;
    if (!form.name?.trim() || !form.email?.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: EmployeeUpdate = {
        name: form.name,
        email: form.email,
        preferred_name: form.preferred_name,
        phone: form.phone,
        location: form.location,
        current_location: form.current_location,
        current_job_title: form.current_job_title,
        primary_skill: form.primary_skill,
        secondary_skills: form.secondary_skills,
        total_experience: form.total_experience,
        work_authorization: form.work_authorization,
        visa_status: form.visa_status,
        availability: form.availability,
        expected_rate: form.expected_rate,
        remote_preference: form.remote_preference,
        preferred_locations: form.preferred_locations,
        employment_type: form.employment_type,
        source: form.source,
        status: form.status,
        linkedin_url: form.linkedin_url,
        portfolio_url: form.portfolio_url,
        notes: form.notes,
      };
      await api.updateCandidate(candidateId, payload);
      router.push(`/ats/candidates/${candidateId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save candidate.");
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>;
  }
  if (!form) {
    return <div className="p-8 max-w-3xl mx-auto"><ErrorBanner message={error || "Candidate not found."} onRetry={() => router.refresh()} /></div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href={`/ats/candidates/${candidateId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Candidate
      </Link>
      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Edit Candidate</h1>
        <p className="page-subtitle">{form.name}</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="name">Full name *</label>
            <input id="name" className="input" value={form.name} onChange={update("name")} />
          </div>
          <div>
            <label className="label" htmlFor="preferred_name">Preferred name</label>
            <input id="preferred_name" className="input" value={form.preferred_name ?? ""} onChange={update("preferred_name")} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email *</label>
            <input id="email" type="email" className="input" value={form.email} onChange={update("email")} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" className="input" value={form.phone ?? ""} onChange={update("phone")} />
          </div>
          <div>
            <label className="label" htmlFor="current_job_title">Current title</label>
            <input id="current_job_title" className="input" value={form.current_job_title ?? ""} onChange={update("current_job_title")} />
          </div>
          <div>
            <label className="label" htmlFor="location">Location</label>
            <input id="location" className="input" value={form.current_location || form.location || ""} onChange={update("current_location")} />
          </div>
          <div>
            <label className="label" htmlFor="primary_skill">Primary skill</label>
            <input id="primary_skill" className="input" value={form.primary_skill ?? ""} onChange={update("primary_skill")} />
          </div>
          <div>
            <label className="label" htmlFor="total_experience">Experience</label>
            <input id="total_experience" className="input" value={form.total_experience ?? ""} onChange={update("total_experience")} />
          </div>
          <div>
            <label className="label" htmlFor="work_authorization">Work authorization</label>
            <input id="work_authorization" className="input" value={form.work_authorization ?? ""} onChange={update("work_authorization")} />
          </div>
          <div>
            <label className="label" htmlFor="visa_status">Visa type</label>
            <input id="visa_status" className="input" value={form.visa_status ?? ""} onChange={update("visa_status")} />
          </div>
          <div>
            <label className="label" htmlFor="expected_rate">Desired rate</label>
            <input id="expected_rate" className="input" value={form.expected_rate ?? ""} onChange={update("expected_rate")} />
          </div>
          <div>
            <label className="label" htmlFor="availability">Availability</label>
            <select id="availability" className="input" value={form.availability ?? ""} onChange={update("availability")}>
              <option value="">—</option>
              {EMPLOYEE_AVAILABILITIES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="employment_type">Employment type</label>
            <select id="employment_type" className="input" value={form.employment_type ?? ""} onChange={update("employment_type")}>
              <option value="">—</option>
              {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" className="input" value={form.status} onChange={update("status")}>
              {EMPLOYEE_STATUSES.map((s) => <option key={s}>{s}</option>)}
              <option value="New">New</option>
              <option value="Submitted">Submitted</option>
              <option value="Interviewing">Interviewing</option>
              <option value="Offered">Offered</option>
              <option value="Placed">Placed</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="source">Source</label>
            <input id="source" className="input" value={form.source ?? ""} onChange={update("source")} />
          </div>
          <div>
            <label className="label" htmlFor="linkedin_url">LinkedIn</label>
            <input id="linkedin_url" className="input" value={form.linkedin_url ?? ""} onChange={update("linkedin_url")} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="secondary_skills">Skills</label>
          <input id="secondary_skills" className="input" value={form.secondary_skills ?? ""} onChange={update("secondary_skills")} />
        </div>
        <div>
          <label className="label" htmlFor="notes">Summary / notes</label>
          <textarea id="notes" className="textarea" rows={4} value={form.notes ?? ""} onChange={update("notes")} />
        </div>
      </div>

      <div className="flex gap-3 justify-end mt-5">
        <button type="button" className="btn-secondary" onClick={() => router.push(`/ats/candidates/${candidateId}`)}>Cancel</button>
        <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={save}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Candidate"}
        </button>
      </div>
    </div>
  );
}
