"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileUp, Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { EmployeeCreate, EmployeeResumeParsed } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

const VISA_STATUSES = ["US Citizen", "Green Card", "H1B", "H4 EAD", "OPT", "CPT", "Other"] as const;
const AVAILABILITIES = ["Immediate", "1 Week", "2 Weeks", "On Project", "Not Available"] as const;
const STATUSES = ["Active", "Inactive", "On Project", "Bench", "Do Not Contact"] as const;

const emptyForm: EmployeeCreate = {
  name: "", email: "", phone: "", location: "",
  visa_status: "", availability: "", expected_rate: "",
  primary_skill: "", secondary_skills: "", total_experience: "",
  status: "Active", notes: "", source: "Resume Upload",
};

function applyParsedToForm(parsed: EmployeeResumeParsed): EmployeeCreate {
  const fullName = (parsed.full_name || parsed.name || "").trim()
    || [parsed.first_name, parsed.last_name].filter(Boolean).join(" ").trim();
  const skills = parsed.secondary_skills ?? parsed.skills ?? [];
  const years = parsed.total_experience_years ?? parsed.total_experience;
  return {
    ...emptyForm,
    name: fullName,
    email: (parsed.email || "").trim(),
    first_name: parsed.first_name || null,
    middle_name: parsed.middle_name || null,
    last_name: parsed.last_name || null,
    phone: parsed.phone || null,
    location: parsed.current_location || null,
    current_location: parsed.current_location || null,
    current_job_title: parsed.current_job_title || null,
    primary_skill: parsed.primary_skill || null,
    secondary_skills: skills.length ? skills.join(", ") : null,
    total_experience: years != null && years !== "" ? String(years) : null,
    relevant_experience_years: parsed.relevant_experience_years != null ? String(parsed.relevant_experience_years) : null,
    linkedin_url: parsed.linkedin_url || null,
    notes: parsed.professional_summary || parsed.summary || null,
    source: "Resume Upload",
    status: "Active",
  };
}

export default function NewEmployeeFromResumePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<EmployeeCreate>(emptyForm);
  const [parsed, setParsed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof EmployeeCreate) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setParsed(false);
    setError(null);
  };

  const handleParse = async () => {
    if (!file) {
      setError("Choose a resume file first.");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const result = await api.parseEmployeeResume(file);
      setForm(applyParsedToForm(result));
      setParsed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse resume.");
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!form.name?.trim() || !form.email?.trim()) {
      setError("Name and email are required. Edit the parsed fields or upload a resume with contact info.");
      return;
    }
    if (!file) {
      setError("Resume file is missing. Upload again.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: EmployeeCreate = {
        ...form,
        phone: form.phone || null,
        location: form.location || null,
        visa_status: form.visa_status || null,
        availability: form.availability || null,
        expected_rate: form.expected_rate || null,
        primary_skill: form.primary_skill || null,
        secondary_skills: form.secondary_skills || null,
        total_experience: form.total_experience || null,
        notes: form.notes || null,
        source: "Resume Upload",
      };
      const created = await api.createEmployee(payload);
      await api.uploadEmployeeResume(created.id, file);
      router.push(`/ats/employees/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create employee.");
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href="/ats/employees" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Employees
      </Link>

      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Add Employee from Resume</h1>
        <p className="page-subtitle">Upload a resume, parse with AI, review the profile, then save.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="card p-6 mb-5 space-y-4">
        <h2 className="font-bold text-slate-800">Upload Resume</h2>
        <p className="text-sm text-slate-500">PDF, DOCX, or TXT — max 10 MB.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          aria-label="Resume file"
          onChange={onFileChange}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={14} /> {file ? file.name : "Choose file"}
          </button>
          <button type="button" className="btn-primary flex items-center gap-2" disabled={!file || parsing} onClick={handleParse}>
            {parsing ? <><Loader2 size={14} className="animate-spin" /> Parsing…</> : <><Sparkles size={14} /> Parse Resume</>}
          </button>
        </div>
      </div>

      {(parsed || form.name || form.email) && (
        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-slate-800">Employee Details</h2>
          <p className="text-sm text-slate-500">Review and edit before saving. The resume file will be attached automatically.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="label">Name *</label>
              <input id="name" className="input" value={form.name} onChange={update("name")} />
            </div>
            <div>
              <label htmlFor="email" className="label">Email *</label>
              <input id="email" type="email" className="input" value={form.email} onChange={update("email")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="label">Phone</label>
              <input id="phone" className="input" value={form.phone ?? ""} onChange={update("phone")} />
            </div>
            <div>
              <label htmlFor="location" className="label">Location</label>
              <input id="location" className="input" value={form.location ?? ""} onChange={update("location")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="primary_skill" className="label">Primary Skill</label>
              <input id="primary_skill" className="input" value={form.primary_skill ?? ""} onChange={update("primary_skill")} />
            </div>
            <div>
              <label htmlFor="total_experience" className="label">Total Experience</label>
              <input id="total_experience" className="input" value={form.total_experience ?? ""} onChange={update("total_experience")} />
            </div>
          </div>

          <div>
            <label htmlFor="secondary_skills" className="label">Secondary Skills</label>
            <input id="secondary_skills" className="input" value={form.secondary_skills ?? ""} onChange={update("secondary_skills")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="visa_status" className="label">Visa Status</label>
              <select id="visa_status" className="input" value={form.visa_status ?? ""} onChange={update("visa_status")}>
                <option value="">— Select —</option>
                {VISA_STATUSES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="availability" className="label">Availability</label>
              <select id="availability" className="input" value={form.availability ?? ""} onChange={update("availability")}>
                <option value="">— Select —</option>
                {AVAILABILITIES.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="expected_rate" className="label">Expected Rate</label>
              <input id="expected_rate" className="input" value={form.expected_rate ?? ""} onChange={update("expected_rate")} />
            </div>
            <div>
              <label htmlFor="status" className="label">Status</label>
              <select id="status" className="input" value={form.status} onChange={update("status")}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="label">Notes / Summary</label>
            <textarea id="notes" className="textarea" rows={4} value={form.notes ?? ""} onChange={update("notes")} />
          </div>
        </div>
      )}

      <div className="flex gap-3 justify-end mt-5">
        <button type="button" onClick={() => router.push("/ats/employees")} className="btn-secondary">Cancel</button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !parsed || !form.name || !form.email}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Add Employee"}
        </button>
      </div>
    </div>
  );
}
