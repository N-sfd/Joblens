"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import ErrorBanner from "@/components/ErrorBanner";
import JobRequirementForm, {
  emptyJobForm, applyParsedToForm, formToPayload, type JobFormState,
} from "@/components/JobRequirementForm";

type Mode = "paste" | "manual";

export default function NewJobRequirementPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [form, setForm] = useState<JobFormState>(() => ({ ...emptyJobForm(), source: "Email Copy/Paste" }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const update = (field: keyof JobFormState, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

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
        ...applyParsedToForm(f, parsed),
        job_description: parsed.summary
          ? `${parsed.summary}\n\n${rawText}`
          : (f.job_description || rawText),
      }));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse job details.");
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!form.job_title.trim()) {
      setSaveError("Job title is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = formToPayload(form, mode === "paste" ? rawText : null);
      if (mode === "manual") payload.source = "Manual";
      payload.status = "Ready for Match";
      const created = await api.createJobRequirement(payload);
      router.push(`/ats/jobs/${created.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save job requirement.");
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <Link href="/ats/jobs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Jobs
      </Link>

      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Add Job Requirement</h1>
        <p className="page-subtitle">Paste a recruiter email or enter job details manually.</p>
      </div>

      <div className="flex gap-2 mb-5">
        {(["paste", "manual"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              if (m === "manual") setForm((f) => ({ ...f, source: "Manual", status: f.status === "Parsed" ? "New" : f.status }));
            }}
            className={clsx(
              "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
              mode === m ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {m === "paste" ? "Paste Recruiter Email" : "Manual Entry"}
          </button>
        ))}
      </div>

      {mode === "paste" && (
        <div className="card p-6 mb-5">
          <h2 className="font-bold text-slate-800 mb-1">Paste Job Email / Job Description</h2>
          <p className="text-sm text-slate-500 mb-3">Parse with AI, then review and edit before saving.</p>
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
      )}

      <div className="card p-6">
        <h2 className="font-bold text-slate-800 mb-4">Job Requirement Details</h2>
        {saveError && <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} className="mb-4" />}
        <JobRequirementForm form={form} onChange={update} />
      </div>

      <div className="flex gap-3 justify-end mt-5">
        <button type="button" onClick={() => router.push("/ats/jobs")} className="btn-secondary">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving || !form.job_title.trim()} className="btn-primary flex items-center gap-2">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Job Requirement"}
        </button>
      </div>
    </div>
  );
}
