"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileUp, Loader2, Sparkles } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { CandidateDuplicateMatch, EmployeeCreate, EmployeeResumeParsed } from "@/types";
import { CANDIDATE_DISPLAY_STATUSES } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const VISA_STATUSES = ["US Citizen", "Green Card", "H1B", "H4 EAD", "OPT", "CPT", "Other"] as const;
const AVAILABILITIES = ["Immediate", "One Week", "Two Weeks", "Thirty Days", "On Project", "Not Available"] as const;

const emptyForm: EmployeeCreate = {
  name: "", email: "", phone: "", location: "",
  preferred_name: "", current_job_title: "", visa_status: "", work_authorization: "",
  availability: "", expected_rate: "", primary_skill: "", secondary_skills: "",
  total_experience: "", status: "New", notes: "", source: "Manual", linkedin_url: "", portfolio_url: "",
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
    status: "New",
  };
}

function DuplicateBanner({
  matches,
  blocked,
  isAdmin,
  onForce,
}: {
  matches: CandidateDuplicateMatch[];
  blocked: boolean;
  isAdmin: boolean;
  onForce: () => void;
}) {
  if (!matches.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">A possible existing candidate was found.</p>
      <ul className="mt-2 space-y-1">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2">
            <Link href={`/ats/candidates/${m.id}`} className="font-medium text-indigo-700 hover:underline">
              {m.name}
            </Link>
            <span className="text-amber-800/80">({m.email} · {m.match_reason})</span>
            <Link href={`/ats/candidates/${m.id}/edit`} className="text-xs text-indigo-600 hover:underline">
              Update existing
            </Link>
          </li>
        ))}
      </ul>
      {blocked && isAdmin && (
        <button type="button" className="mt-2 text-xs font-semibold text-amber-900 underline" onClick={onForce}>
          Continue as New Candidate (Admin)
        </button>
      )}
    </div>
  );
}

function CandidateFormFields({
  form,
  update,
}: {
  form: EmployeeCreate;
  update: (field: keyof EmployeeCreate) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
}) {
  return (
    <div className="card p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="label">Full name *</label>
          <input id="name" className="input" value={form.name} onChange={update("name")} />
        </div>
        <div>
          <label htmlFor="preferred_name" className="label">Preferred name</label>
          <input id="preferred_name" className="input" value={form.preferred_name ?? ""} onChange={update("preferred_name")} />
        </div>
        <div>
          <label htmlFor="email" className="label">Email *</label>
          <input id="email" type="email" className="input" value={form.email} onChange={update("email")} />
        </div>
        <div>
          <label htmlFor="phone" className="label">Phone</label>
          <input id="phone" className="input" value={form.phone ?? ""} onChange={update("phone")} />
        </div>
        <div>
          <label htmlFor="current_job_title" className="label">Current title</label>
          <input id="current_job_title" className="input" value={form.current_job_title ?? ""} onChange={update("current_job_title")} />
        </div>
        <div>
          <label htmlFor="location" className="label">Location</label>
          <input id="location" className="input" value={form.location ?? ""} onChange={update("location")} />
        </div>
        <div>
          <label htmlFor="primary_skill" className="label">Primary skill</label>
          <input id="primary_skill" className="input" value={form.primary_skill ?? ""} onChange={update("primary_skill")} />
        </div>
        <div>
          <label htmlFor="total_experience" className="label">Years of experience</label>
          <input id="total_experience" className="input" value={form.total_experience ?? ""} onChange={update("total_experience")} />
        </div>
        <div>
          <label htmlFor="work_authorization" className="label">Work authorization</label>
          <input id="work_authorization" className="input" value={form.work_authorization ?? ""} onChange={update("work_authorization")} />
        </div>
        <div>
          <label htmlFor="visa_status" className="label">Visa type</label>
          <select id="visa_status" className="input" value={form.visa_status ?? ""} onChange={update("visa_status")}>
            <option value="">— Select —</option>
            {VISA_STATUSES.map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="expected_rate" className="label">Desired rate / salary</label>
          <input id="expected_rate" className="input" value={form.expected_rate ?? ""} onChange={update("expected_rate")} />
        </div>
        <div>
          <label htmlFor="availability" className="label">Availability</label>
          <select id="availability" className="input" value={form.availability ?? ""} onChange={update("availability")}>
            <option value="">— Select —</option>
            {AVAILABILITIES.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="source" className="label">Source</label>
          <input id="source" className="input" value={form.source ?? ""} onChange={update("source")} />
        </div>
        <div>
          <label htmlFor="status" className="label">Status</label>
          <select id="status" className="input" value={form.status} onChange={update("status")}>
            {CANDIDATE_DISPLAY_STATUSES.map((s) => <option key={s}>{s}</option>)}
            <option value="Bench">Bench</option>
            <option value="On Project">On Project</option>
          </select>
        </div>
        <div>
          <label htmlFor="linkedin_url" className="label">LinkedIn</label>
          <input id="linkedin_url" className="input" value={form.linkedin_url ?? ""} onChange={update("linkedin_url")} />
        </div>
        <div>
          <label htmlFor="portfolio_url" className="label">Portfolio</label>
          <input id="portfolio_url" className="input" value={form.portfolio_url ?? ""} onChange={update("portfolio_url")} />
        </div>
      </div>
      <div>
        <label htmlFor="secondary_skills" className="label">Skills</label>
        <input id="secondary_skills" className="input" value={form.secondary_skills ?? ""} onChange={update("secondary_skills")} />
      </div>
      <div>
        <label htmlFor="notes" className="label">Professional summary / notes</label>
        <textarea id="notes" className="textarea" rows={4} value={form.notes ?? ""} onChange={update("notes")} />
      </div>
    </div>
  );
}

function NewCandidateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useAtsRole();
  const mode = searchParams.get("mode") === "resume" ? "resume" : "manual";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<EmployeeCreate>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupMatches, setDupMatches] = useState<CandidateDuplicateMatch[]>([]);
  const [dupBlocked, setDupBlocked] = useState(false);
  const [forceNew, setForceNew] = useState(false);

  const update = (field: keyof EmployeeCreate) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleParse = async () => {
    if (!file) {
      setError("Choose a resume file first.");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const result = await api.parseCandidateResume(file);
      setForm(applyParsedToForm(result));
      setParsed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resume parsing failed.");
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!form.name?.trim() || !form.email?.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (mode === "resume" && !file) {
      setError("Resume file is required for upload workflow.");
      return;
    }
    if (mode === "resume" && !parsed) {
      setError("Parse and review the resume before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    setDupMatches([]);
    try {
      const check = await api.checkCandidateDuplicates({
        email: form.email,
        phone: form.phone,
        name: form.name,
      });
      if (check.matches.length && !(forceNew && isAdmin)) {
        setDupMatches(check.matches);
        setDupBlocked(check.blocked);
        setSaving(false);
        if (check.blocked) return;
      }

      const payload: EmployeeCreate = {
        ...form,
        phone: form.phone || null,
        location: form.location || null,
        current_location: form.current_location || form.location || null,
        visa_status: form.visa_status || null,
        work_authorization: form.work_authorization || null,
        availability: form.availability || null,
        expected_rate: form.expected_rate || null,
        primary_skill: form.primary_skill || null,
        secondary_skills: form.secondary_skills || null,
        total_experience: form.total_experience || null,
        notes: form.notes || null,
        source: mode === "resume" ? "Resume Upload" : (form.source || "Manual"),
      };
      const created = await api.createCandidate(payload, { forceNew: forceNew && isAdmin });
      if (mode === "resume" && file) {
        await api.uploadCandidateResume(created.id, file);
      }
      router.push(`/ats/candidates/${created.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Candidate save failed.";
      setError(msg);
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href="/ats/candidates" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Candidates
      </Link>

      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Add Candidate</h1>
        <p className="page-subtitle">Upload a resume or enter details manually. AI output is never saved without review.</p>
      </div>

      <div className="flex gap-2 mb-5">
        <Link
          href="/ats/candidates/new"
          className={clsx("px-3 py-1.5 rounded-lg text-sm font-semibold border", mode === "manual" ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "border-slate-200 text-slate-600")}
        >
          Enter Manually
        </Link>
        <Link
          href="/ats/candidates/new?mode=resume"
          className={clsx("px-3 py-1.5 rounded-lg text-sm font-semibold border", mode === "resume" ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "border-slate-200 text-slate-600")}
        >
          Upload Resume
        </Link>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}
      <DuplicateBanner
        matches={dupMatches}
        blocked={dupBlocked}
        isAdmin={isAdmin}
        onForce={() => { setForceNew(true); setDupMatches([]); }}
      />

      {mode === "resume" && (
        <div className="card p-6 mb-5 space-y-4">
          <h2 className="font-bold text-slate-800">Upload Resume</h2>
          <p className="text-sm text-slate-500">PDF, DOC, DOCX, or TXT — max 10 MB.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            aria-label="Resume file"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setParsed(false);
            }}
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
      )}

      {(mode === "manual" || parsed) && <CandidateFormFields form={form} update={update} />}

      <div className="flex gap-3 justify-end mt-5">
        <button type="button" onClick={() => router.push("/ats/candidates")} className="btn-secondary">Cancel</button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !form.name || !form.email || (mode === "resume" && !parsed)}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Candidate"}
        </button>
      </div>
    </div>
  );
}

export default function NewCandidatePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>}>
      <NewCandidateInner />
    </Suspense>
  );
}
