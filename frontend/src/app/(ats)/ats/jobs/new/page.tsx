"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { JobRequirementCreate } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

const WORK_TYPES = ["Remote", "Hybrid", "Onsite"] as const;
const STATUSES = ["New", "Parsed", "Ready for Match", "Matched", "Sent to Employee", "Interested", "Submitted", "Interview", "Selected", "Rejected", "Closed"] as const;
const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
const SOURCES = ["Manual", "Email Copy/Paste", "Zoho Mail Later", "Chrome Extension Later"] as const;

interface FormState {
  job_title: string;
  vendor: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_phone: string;
  client: string;
  end_client: string;
  location: string;
  work_type: string;
  rate: string;
  duration: string;
  visa_requirement: string;
  required_skills: string;   // comma-separated in the form, converted to string[] on save
  preferred_skills: string;
  job_description: string;
  submission_deadline: string;
  status: string;
  priority: string;
  source: string;
  notes: string;
}

const emptyForm: FormState = {
  job_title: "", vendor: "", recruiter_name: "", recruiter_email: "", recruiter_phone: "",
  client: "", end_client: "", location: "", work_type: "", rate: "", duration: "",
  visa_requirement: "", required_skills: "", preferred_skills: "", job_description: "",
  submission_deadline: "", status: "New", priority: "Medium", source: "Email Copy/Paste", notes: "",
};

const splitSkills = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function NewJobRequirementPage() {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const update = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleParse = async () => {
    if (rawText.trim().length < 20) {
      setParseError("Paste more of the job email or description to parse.");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const parsed = await api.parseJobRequirement(rawText);
      setForm((f) => ({
        ...f,
        job_title: parsed.job_title || f.job_title,
        vendor: parsed.vendor || f.vendor,
        recruiter_name: parsed.recruiter_name || f.recruiter_name,
        recruiter_email: parsed.recruiter_email || f.recruiter_email,
        recruiter_phone: parsed.recruiter_phone || f.recruiter_phone,
        client: parsed.client || f.client,
        end_client: parsed.end_client || f.end_client,
        location: parsed.location || f.location,
        work_type: parsed.work_type || f.work_type,
        rate: parsed.rate || f.rate,
        duration: parsed.duration || f.duration,
        visa_requirement: parsed.visa_requirement || f.visa_requirement,
        required_skills: parsed.required_skills.length ? parsed.required_skills.join(", ") : f.required_skills,
        preferred_skills: parsed.preferred_skills.length ? parsed.preferred_skills.join(", ") : f.preferred_skills,
        submission_deadline: parsed.submission_deadline || f.submission_deadline,
        job_description: parsed.summary ? `${parsed.summary}\n\n${rawText}` : f.job_description || rawText,
        status: "Parsed",
      }));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse job details.");
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!form.job_title) {
      setSaveError("Job title is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload: JobRequirementCreate = {
        job_title: form.job_title,
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
        raw_email_text: rawText || null,
        submission_deadline: form.submission_deadline || null,
        status: form.status,
        priority: form.priority,
        source: form.source,
        notes: form.notes || null,
      };
      const created = await api.createJobRequirement(payload);
      router.push(`/ats/jobs/${created.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save job requirement.");
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Add Job Requirement</h1>
        <p className="page-subtitle">Paste a recruiter email or job description, then review and save.</p>
      </div>

      {/* Section A: Paste Job Email / Job Description */}
      <div className="card p-6 mb-5">
        <h2 className="font-bold text-slate-800 mb-1">Paste Job Email / Job Description</h2>
        <p className="text-sm text-slate-500 mb-3">Paste the raw recruiter email or job posting text below, then parse it to auto-fill the form.</p>
        {parseError && <ErrorBanner message={parseError} onDismiss={() => setParseError(null)} className="mb-3" />}
        <textarea
          className="textarea"
          rows={8}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste the job email or description here..."
        />
        <div className="flex justify-end mt-3">
          <button type="button" onClick={handleParse} disabled={parsing} className="btn-primary flex items-center gap-2">
            {parsing ? <><Loader2 size={14} className="animate-spin" /> Parsing…</> : <><Sparkles size={14} /> Parse Job Details</>}
          </button>
        </div>
      </div>

      {/* Section B: Job Requirement Form */}
      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-slate-800">Job Requirement Details</h2>
        {saveError && <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="job_title" className="label">Job Title *</label>
            <input id="job_title" className="input" value={form.job_title} onChange={update("job_title")} placeholder="Senior Java Developer" />
          </div>
          <div>
            <label htmlFor="vendor" className="label">Vendor</label>
            <input id="vendor" className="input" value={form.vendor} onChange={update("vendor")} placeholder="Staffing Agency Inc" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="recruiter_name" className="label">Recruiter Name</label>
            <input id="recruiter_name" className="input" value={form.recruiter_name} onChange={update("recruiter_name")} />
          </div>
          <div>
            <label htmlFor="recruiter_email" className="label">Recruiter Email</label>
            <input id="recruiter_email" type="email" className="input" value={form.recruiter_email} onChange={update("recruiter_email")} />
          </div>
          <div>
            <label htmlFor="recruiter_phone" className="label">Recruiter Phone</label>
            <input id="recruiter_phone" className="input" value={form.recruiter_phone} onChange={update("recruiter_phone")} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="client" className="label">Client</label>
            <input id="client" className="input" value={form.client} onChange={update("client")} />
          </div>
          <div>
            <label htmlFor="end_client" className="label">End Client</label>
            <input id="end_client" className="input" value={form.end_client} onChange={update("end_client")} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="location" className="label">Location</label>
            <input id="location" className="input" value={form.location} onChange={update("location")} placeholder="Dallas, TX" />
          </div>
          <div>
            <label htmlFor="work_type" className="label">Work Type</label>
            <select id="work_type" className="input" value={form.work_type} onChange={update("work_type")}>
              <option value="">— Select —</option>
              {WORK_TYPES.map((w) => <option key={w}>{w}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rate" className="label">Rate</label>
            <input id="rate" className="input" value={form.rate} onChange={update("rate")} placeholder="$75/hr" />
          </div>
          <div>
            <label htmlFor="duration" className="label">Duration</label>
            <input id="duration" className="input" value={form.duration} onChange={update("duration")} placeholder="6 months" />
          </div>
        </div>

        <div>
          <label htmlFor="visa_requirement" className="label">Visa Requirement</label>
          <input id="visa_requirement" className="input" value={form.visa_requirement} onChange={update("visa_requirement")} placeholder="USC/GC only" />
        </div>

        <div>
          <label htmlFor="required_skills" className="label">Required Skills (comma-separated)</label>
          <input id="required_skills" className="input" value={form.required_skills} onChange={update("required_skills")} placeholder="Java, Spring Boot, AWS" />
        </div>
        <div>
          <label htmlFor="preferred_skills" className="label">Preferred Skills (comma-separated)</label>
          <input id="preferred_skills" className="input" value={form.preferred_skills} onChange={update("preferred_skills")} placeholder="Kafka, Kubernetes" />
        </div>

        <div>
          <label htmlFor="job_description" className="label">Job Description</label>
          <textarea id="job_description" className="textarea" rows={5} value={form.job_description} onChange={update("job_description")} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="submission_deadline" className="label">Submission Deadline</label>
            <input id="submission_deadline" className="input" value={form.submission_deadline} onChange={update("submission_deadline")} placeholder="ASAP or a date" />
          </div>
          <div>
            <label htmlFor="source" className="label">Source</label>
            <select id="source" className="input" value={form.source} onChange={update("source")}>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="status" className="label">Status</label>
            <select id="status" className="input" value={form.status} onChange={update("status")}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="priority" className="label">Priority</label>
            <select id="priority" className="input" value={form.priority} onChange={update("priority")}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="label">Notes</label>
          <textarea id="notes" className="textarea" rows={3} value={form.notes} onChange={update("notes")} />
        </div>
      </div>

      <div className="flex gap-3 justify-end mt-5">
        <button type="button" onClick={() => router.push("/ats/jobs")} className="btn-secondary">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving || !form.job_title} className="btn-primary flex items-center gap-2">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Save Job Requirement"}
        </button>
      </div>
    </div>
  );
}
