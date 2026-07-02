"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, X } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { JobRequirement, JobRequirementUpdate } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

const WORK_TYPES = ["Remote", "Hybrid", "Onsite"] as const;
const STATUSES = ["New", "Parsed", "Ready for Match", "Matched", "Sent to Employee", "Interested", "Submitted", "Interview", "Selected", "Rejected", "Closed"] as const;
const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;

const STATUS_COLORS: Record<string, string> = {
  New: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Parsed: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  "Ready for Match": "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  Matched: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  "Sent to Employee": "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  Interested: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  Submitted: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  Interview: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Selected: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
  Closed: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  Low: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Medium: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  High: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Urgent: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5">{value || "—"}</p>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-sm text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
          {item}
        </span>
      ))}
    </div>
  );
}

const splitSkills = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

interface EditFormState {
  job_title: string; vendor: string; recruiter_name: string; recruiter_email: string; recruiter_phone: string;
  client: string; end_client: string; location: string; work_type: string; rate: string; duration: string;
  visa_requirement: string; required_skills: string; preferred_skills: string; job_description: string;
  submission_deadline: string; status: string; priority: string; notes: string;
}

function toEditForm(job: JobRequirement): EditFormState {
  return {
    job_title: job.job_title, vendor: job.vendor ?? "", recruiter_name: job.recruiter_name ?? "",
    recruiter_email: job.recruiter_email ?? "", recruiter_phone: job.recruiter_phone ?? "",
    client: job.client ?? "", end_client: job.end_client ?? "", location: job.location ?? "",
    work_type: job.work_type ?? "", rate: job.rate ?? "", duration: job.duration ?? "",
    visa_requirement: job.visa_requirement ?? "", required_skills: job.required_skills.join(", "),
    preferred_skills: job.preferred_skills.join(", "), job_description: job.job_description ?? "",
    submission_deadline: job.submission_deadline ?? "", status: job.status, priority: job.priority,
    notes: job.notes ?? "",
  };
}

export default function JobRequirementDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const jobId = Number(params.id);

  const [job, setJob] = useState<JobRequirement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getJobRequirement(jobId);
      setJob(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job requirement.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [jobId]);

  const startEdit = () => {
    if (!job) return;
    setForm(toEditForm(job));
    setEditing(true);
  };

  const update = (field: keyof EditFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => (f ? { ...f, [field]: e.target.value } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const payload: JobRequirementUpdate = {
        ...form,
        vendor: form.vendor || null,
        recruiter_name: form.recruiter_name || null,
        recruiter_email: form.recruiter_email || null,
        recruiter_phone: form.recruiter_phone || null,
        client: form.client || null,
        end_client: form.end_client || null,
        location: form.location || null,
        work_type: form.work_type || null,
        rate: form.rate || null,
        duration: form.duration || null,
        visa_requirement: form.visa_requirement || null,
        required_skills: splitSkills(form.required_skills),
        preferred_skills: splitSkills(form.preferred_skills),
        job_description: form.job_description || null,
        submission_deadline: form.submission_deadline || null,
        notes: form.notes || null,
      };
      const updated = await api.updateJobRequirement(jobId, payload);
      setJob(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <ErrorBanner message={error} onRetry={load} />
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href="/ats/jobs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Job Requirements
      </Link>

      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">{job.job_title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", STATUS_COLORS[job.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200")}>
              {job.status}
            </span>
            <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", PRIORITY_COLORS[job.priority] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200")}>
              {job.priority}
            </span>
          </div>
        </div>
        {!editing && (
          <button type="button" onClick={startEdit} className="btn-secondary flex items-center gap-2 shrink-0">
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      {editing && form ? (
        <div className="card p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-title" className="label">Job Title</label>
              <input id="edit-title" className="input" value={form.job_title} onChange={update("job_title")} />
            </div>
            <div>
              <label htmlFor="edit-vendor" className="label">Vendor</label>
              <input id="edit-vendor" className="input" value={form.vendor} onChange={update("vendor")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="edit-recruiter-name" className="label">Recruiter Name</label>
              <input id="edit-recruiter-name" className="input" value={form.recruiter_name} onChange={update("recruiter_name")} />
            </div>
            <div>
              <label htmlFor="edit-recruiter-email" className="label">Recruiter Email</label>
              <input id="edit-recruiter-email" type="email" className="input" value={form.recruiter_email} onChange={update("recruiter_email")} />
            </div>
            <div>
              <label htmlFor="edit-recruiter-phone" className="label">Recruiter Phone</label>
              <input id="edit-recruiter-phone" className="input" value={form.recruiter_phone} onChange={update("recruiter_phone")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-client" className="label">Client</label>
              <input id="edit-client" className="input" value={form.client} onChange={update("client")} />
            </div>
            <div>
              <label htmlFor="edit-end-client" className="label">End Client</label>
              <input id="edit-end-client" className="input" value={form.end_client} onChange={update("end_client")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-location" className="label">Location</label>
              <input id="edit-location" className="input" value={form.location} onChange={update("location")} />
            </div>
            <div>
              <label htmlFor="edit-work-type" className="label">Work Type</label>
              <select id="edit-work-type" className="input" value={form.work_type} onChange={update("work_type")}>
                <option value="">— Select —</option>
                {WORK_TYPES.map((w) => <option key={w}>{w}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-rate" className="label">Rate</label>
              <input id="edit-rate" className="input" value={form.rate} onChange={update("rate")} />
            </div>
            <div>
              <label htmlFor="edit-duration" className="label">Duration</label>
              <input id="edit-duration" className="input" value={form.duration} onChange={update("duration")} />
            </div>
          </div>

          <div>
            <label htmlFor="edit-visa" className="label">Visa Requirement</label>
            <input id="edit-visa" className="input" value={form.visa_requirement} onChange={update("visa_requirement")} />
          </div>

          <div>
            <label htmlFor="edit-required-skills" className="label">Required Skills (comma-separated)</label>
            <input id="edit-required-skills" className="input" value={form.required_skills} onChange={update("required_skills")} />
          </div>
          <div>
            <label htmlFor="edit-preferred-skills" className="label">Preferred Skills (comma-separated)</label>
            <input id="edit-preferred-skills" className="input" value={form.preferred_skills} onChange={update("preferred_skills")} />
          </div>

          <div>
            <label htmlFor="edit-description" className="label">Job Description</label>
            <textarea id="edit-description" className="textarea" rows={5} value={form.job_description} onChange={update("job_description")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="edit-deadline" className="label">Submission Deadline</label>
              <input id="edit-deadline" className="input" value={form.submission_deadline} onChange={update("submission_deadline")} />
            </div>
            <div>
              <label htmlFor="edit-status" className="label">Status</label>
              <select id="edit-status" className="input" value={form.status} onChange={update("status")}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="edit-priority" className="label">Priority</label>
              <select id="edit-priority" className="input" value={form.priority} onChange={update("priority")}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="edit-notes" className="label">Notes</label>
            <textarea id="edit-notes" className="textarea" rows={3} value={form.notes} onChange={update("notes")} />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex items-center gap-2">
              <X size={14} /> Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Save Changes"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Vendor" value={job.vendor} />
              <Field label="Recruiter" value={[job.recruiter_name, job.recruiter_email, job.recruiter_phone].filter(Boolean).join(" · ") || null} />
              <Field label="Client" value={job.client} />
              <Field label="End Client" value={job.end_client} />
              <Field label="Location" value={job.location} />
              <Field label="Work Type" value={job.work_type} />
              <Field label="Rate" value={job.rate} />
              <Field label="Duration" value={job.duration} />
              <Field label="Visa Requirement" value={job.visa_requirement} />
              <Field label="Submission Deadline" value={job.submission_deadline} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Required Skills</p>
              <TagList items={job.required_skills} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Preferred Skills</p>
              <TagList items={job.preferred_skills} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Job Description</p>
              <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{job.job_description || "—"}</p>
            </div>
            {job.raw_email_text && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Raw Email Text</p>
                <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2.5">{job.raw_email_text}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</p>
              <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{job.notes || "—"}</p>
            </div>
          </div>

          <div className="card p-6 mt-5">
            <h2 className="font-bold text-slate-800 mb-1">Employee Matches</h2>
            <p className="text-sm text-slate-500">Employee matching will be added in the next step.</p>
          </div>

          <div className="card p-6 mt-5">
            <h2 className="font-bold text-slate-800 mb-1">Submissions</h2>
            <p className="text-sm text-slate-500">Submission tracking will be added later.</p>
          </div>

          <div className="card p-6 mt-5">
            <h2 className="font-bold text-slate-800 mb-1">Employee Notifications</h2>
            <p className="text-sm text-slate-500">Send-to-employee workflow will be added later.</p>
          </div>
        </>
      )}
    </div>
  );
}
