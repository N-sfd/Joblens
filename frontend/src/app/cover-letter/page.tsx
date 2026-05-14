"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { logActivity } from "@/lib/activityLog";
import AgentActivity from "@/components/AgentActivity";
import type { JobApplication } from "@/types";
import { PenTool, Loader2, AlertCircle, Copy, CheckCircle, ArrowRight, X, Briefcase } from "lucide-react";
import clsx from "clsx";

const RESUME_KEY = "aijob_resume_text";
const JD_KEY = "aijob_jd_text";

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "enthusiastic", label: "Enthusiastic" },
  { value: "concise", label: "Concise" },
  { value: "creative", label: "Creative" },
];

const COVER_LETTER_STEPS = [
  "Analyzing resume highlights",
  "Extracting job requirements",
  "Identifying key qualifications",
  "Crafting personalized narrative",
  "Refining tone and style",
  "Finalizing cover letter",
];

function CoverLetterContent() {
  const searchParams = useSearchParams();

  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [tone, setTone] = useState("professional");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Pre-fill from localStorage + query params on mount
  useEffect(() => {
    const savedResume = localStorage.getItem(RESUME_KEY) ?? "";
    const savedJD = localStorage.getItem(JD_KEY) ?? "";
    const paramCompany = searchParams.get("company") ?? "";
    const paramRole = searchParams.get("role") ?? "";

    setResumeText(savedResume);
    setJobDescription(savedJD);
    if (paramCompany) setCompanyName(paramCompany);
    if (paramRole && !savedJD) {
      setJobDescription(`Role: ${paramRole}\nCompany: ${paramCompany}\n\n(Paste the full job description here)`);
    }

    // Load saved jobs for the selector
    api.listJobs().then(setJobs).catch(() => {});
  }, [searchParams]);

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    if (!jobId) return;
    const job = jobs.find((j) => String(j.id) === jobId);
    if (!job) return;

    // Always fill company and role
    setCompanyName(job.company);

    // Build a useful JD template so the user sees real content, not confusion
    const matchNote = job.notes?.includes("AI Match Score")
      ? `\n\n--- From Job Matcher ---\n${job.notes}`
      : "";
    const locationLine = job.location ? `Location: ${job.location}` : "";
    const salaryLine = job.salary_range ? `Salary: ${job.salary_range}` : "";
    const meta = [locationLine, salaryLine].filter(Boolean).join("  ·  ");

    setJobDescription(
      `Position: ${job.role}\nCompany: ${job.company}${meta ? `\n${meta}` : ""}${matchNote}\n\n` +
      `--- Paste the full job description below ---\n`
    );

    // Resume is already loaded from localStorage on mount — no action needed
  };

  const generate = async (overrideTone?: string) => {
    const activeTone = overrideTone ?? tone;
    setLoading(true);
    setDone(false);
    setError(null);
    setLetter(null);
    try {
      const data = await api.generateCoverLetter(resumeText, jobDescription, companyName, activeTone);
      setDone(true);
      setLetter(data.cover_letter);
      logActivity({
        type: "cover_letter_generated",
        summary: `Generated cover letter for ${companyName || "a role"}`,
        detail: `Tone: ${activeTone}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const [savedToJob, setSavedToJob] = useState(false);

  const copy = async () => {
    if (!letter) return;
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const download = () => {
    if (!letter) return;
    const blob = new Blob([letter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cover_letter_${(companyName || "company").replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToApplication = async () => {
    if (!letter || !selectedJobId) return;
    const job = jobs.find((j) => String(j.id) === selectedJobId);
    if (!job) return;
    try {
      const notePrefix = job.notes ? job.notes + "\n\n" : "";
      await api.updateJob(job.id, {
        notes: `${notePrefix}Cover Letter (${tone} tone, ${new Date().toLocaleDateString()}):\n${letter.slice(0, 300)}...`,
      });
      setSavedToJob(true);
      setTimeout(() => setSavedToJob(false), 2500);
      logActivity({
        type: "cover_letter_generated",
        summary: `Saved cover letter to ${job.company} — ${job.role}`,
        detail: `Tone: ${tone}`,
      });
    } catch { /* ignore */ }
  };

  const regenerateConcise = () => {
    setTone("concise");
    setLetter(null);
    setDone(false);
    // Small delay so tone state updates before generate runs
    setTimeout(() => generate(), 50);
  };

  const savedResume = typeof window !== "undefined" ? localStorage.getItem(RESUME_KEY) : null;
  const savedJD = typeof window !== "undefined" ? localStorage.getItem(JD_KEY) : null;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Cover Letter Generator</h1>
        <p className="text-slate-500 mt-1">Generate a tailored, AI-written cover letter from your resume and job description.</p>
      </div>

      <div className="card p-5 mb-5">
        {/* Job Selector */}
        {jobs.length > 0 && (
          <div className="mb-4 pb-4 border-b border-slate-100">
            <label htmlFor="job-select" className="label flex items-center gap-1.5">
              <Briefcase size={13} className="text-indigo-500" /> Select a saved job (optional)
            </label>
            <select
              id="job-select"
              className="input"
              value={selectedJobId}
              onChange={(e) => handleJobSelect(e.target.value)}
            >
              <option value="">— Choose from your tracker to pre-fill —</option>
              {jobs.map((job) => {
                const score = job.notes?.match(/Match Score:\s*(\d+)%/)?.[1];
                return (
                  <option key={job.id} value={String(job.id)}>
                    {job.company} · {job.role}{score ? ` — ${score}% match` : ""}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Inputs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="cl-resume" className="label">Your Resume</label>
            <textarea
              id="cl-resume"
              className="textarea h-52"
              placeholder="Paste your resume text here…"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
            />
            {savedResume && resumeText !== savedResume && (
              <button type="button"
                onClick={() => setResumeText(savedResume)}
                className="text-xs text-indigo-600 hover:underline mt-1.5 flex items-center gap-1"
              >
                <ArrowRight size={11} /> Load from last analysis
              </button>
            )}
          </div>
          <div>
            <label htmlFor="cl-jd" className="label">Job Description</label>
            <textarea
              id="cl-jd"
              className="textarea h-52"
              placeholder="Paste the job description here…"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
            {savedJD && jobDescription !== savedJD && (
              <button type="button"
                onClick={() => setJobDescription(savedJD)}
                className="text-xs text-indigo-600 hover:underline mt-1.5 flex items-center gap-1"
              >
                <ArrowRight size={11} /> Load from last match
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="cl-company" className="label">Company Name</label>
            <input
              id="cl-company"
              className="input"
              placeholder="e.g. Google, Stripe, Shopify"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Tone</label>
            <div className="grid grid-cols-2 sm:flex gap-2">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTone(t.value)}
                  className={clsx(
                    "px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150",
                    tone === t.value
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
            <AlertCircle size={15} /> {error}
            <button type="button" aria-label="Dismiss error" onClick={() => setError(null)} className="ml-auto">
              <X size={14} />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => generate()}
          disabled={loading || resumeText.length < 50 || jobDescription.length < 50}
          className="btn-primary flex items-center gap-2 w-full justify-center py-3"
        >
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Generating cover letter…</>
            : <><PenTool size={16} /> Generate Cover Letter</>}
        </button>
      </div>

      <AgentActivity steps={COVER_LETTER_STEPS} isRunning={loading} isDone={done} className="mb-5" />

      {/* Generated Letter */}
      {letter && (
        <div className="card animate-slide-up">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <PenTool size={16} className="text-indigo-500 shrink-0" />
              <h2 className="font-semibold text-slate-800 truncate">Generated Cover Letter</h2>
              {companyName && <span className="text-xs text-slate-400 truncate">— {companyName}</span>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={download} className="btn-secondary text-sm py-2 px-4">
                Download
              </button>
              <button
                type="button"
                onClick={copy}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                  copied ? "bg-green-100 text-green-700" : "btn-primary"
                )}
              >
                {copied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-8 font-serif text-slate-700 leading-relaxed whitespace-pre-wrap text-sm shadow-inner max-w-3xl mx-auto">
              {letter}
            </div>
          </div>

          <div className="px-6 pb-5">
            <button type="button" onClick={() => { setLetter(null); setDone(false); }} className="btn-secondary text-sm">
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CoverLetterPage() {
  return (
    <Suspense fallback={<div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 size={18} className="animate-spin" /> Loading…</div>}>
      <CoverLetterContent />
    </Suspense>
  );
}
