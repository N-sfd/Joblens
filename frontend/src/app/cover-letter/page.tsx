"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { logActivity } from "@/lib/activityLog";
import AgentActivity from "@/components/AgentActivity";
import type { JobApplication } from "@/types";
import {
  PenTool, Loader2, AlertCircle, Copy, CheckCircle, ArrowRight,
  X, Briefcase, Download, RefreshCw, BookOpen, Save,
} from "lucide-react";
import clsx from "clsx";

const RESUME_KEY = "aijob_resume_text";
const JD_KEY = "aijob_jd_text";

const TONES = [
  { value: "professional", label: "Professional", desc: "Formal & polished" },
  { value: "enthusiastic", label: "Enthusiastic", desc: "Energetic & passionate" },
  { value: "concise", label: "Concise", desc: "Short & punchy (~200 words)" },
  { value: "creative", label: "Creative", desc: "Distinctive & memorable" },
  { value: "storytelling", label: "Storytelling", desc: "Narrative-driven & warm" },
];

const COVER_LETTER_STEPS = [
  "Analyzing resume highlights",
  "Extracting job requirements",
  "Identifying key qualifications",
  "Crafting personalized narrative",
  "Refining tone and style",
  "Finalizing cover letter",
];

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

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
  const [savedToJob, setSavedToJob] = useState(false);
  const [saving, setSaving] = useState(false);

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

    api.listJobs().then(setJobs).catch(() => {});
  }, [searchParams]);

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    if (!jobId) return;
    const job = jobs.find((j) => String(j.id) === jobId);
    if (!job) return;

    setCompanyName(job.company);

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
  };

  const generate = async (overrideTone?: string) => {
    const activeTone = overrideTone ?? tone;
    setLoading(true);
    setDone(false);
    setError(null);
    setLetter(null);
    setSavedToJob(false);
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
    setSaving(true);
    try {
      const notePrefix = job.notes ? job.notes + "\n\n" : "";
      await api.updateJob(job.id, {
        notes: `${notePrefix}Cover Letter (${tone}, ${new Date().toLocaleDateString()}):\n${letter.slice(0, 300)}…`,
      });
      setSavedToJob(true);
      setTimeout(() => setSavedToJob(false), 3000);
      logActivity({
        type: "cover_letter_generated",
        summary: `Saved cover letter to ${job.company} — ${job.role}`,
        detail: `Tone: ${tone}`,
      });
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const savedResume = typeof window !== "undefined" ? localStorage.getItem(RESUME_KEY) : null;
  const savedJD = typeof window !== "undefined" ? localStorage.getItem(JD_KEY) : null;
  const letterWords = letter ? wordCount(letter) : 0;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Cover Letter Generator</h1>
        <p className="text-slate-500 mt-1">AI-written, tailored to your resume and the job description.</p>
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
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="cl-resume" className="label mb-0">Your Resume</label>
              <span className="text-xs text-slate-400">{wordCount(resumeText)} words</span>
            </div>
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
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="cl-jd" className="label mb-0">Job Description</label>
              <span className="text-xs text-slate-400">{wordCount(jobDescription)} words</span>
            </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex gap-2">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  title={t.desc}
                  onClick={() => setTone(t.value)}
                  className={clsx(
                    "px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150 text-left",
                    tone === t.value
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tone && (
              <p className="text-xs text-slate-400 mt-1.5">
                {TONES.find((t) => t.value === tone)?.desc}
              </p>
            )}
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

        {(resumeText.length < 50 || jobDescription.length < 50) && !loading && (
          <p className="text-xs text-slate-400 text-center mt-2">
            Add your resume and job description to enable generation
          </p>
        )}
      </div>

      <AgentActivity steps={COVER_LETTER_STEPS} isRunning={loading} isDone={done} className="mb-5" />

      {/* Generated Letter */}
      {letter && (
        <div className="card animate-slide-up">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <PenTool size={16} className="text-indigo-500 shrink-0" />
              <h2 className="font-semibold text-slate-800">Cover Letter</h2>
              {companyName && <span className="text-xs text-slate-400 truncate">— {companyName}</span>}
              <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium shrink-0 capitalize">
                {tone}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={download}
                className="flex items-center gap-1.5 btn-secondary text-sm py-2 px-3">
                <Download size={14} /> Download
              </button>
              <button type="button" onClick={copy}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all",
                  copied ? "bg-green-100 text-green-700" : "btn-primary"
                )}
              >
                {copied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
              </button>
            </div>
          </div>

          {/* Letter body */}
          <div className="p-5 sm:p-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 font-serif text-slate-700 leading-relaxed whitespace-pre-wrap text-sm shadow-sm max-w-3xl mx-auto">
              {letter}
            </div>
            <p className="text-xs text-slate-400 text-center mt-3">{letterWords} words</p>
          </div>

          {/* Actions footer */}
          <div className="px-5 pb-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap gap-2 flex-1">
              <button
                type="button"
                onClick={() => { setLetter(null); setDone(false); }}
                className="flex items-center gap-1.5 btn-secondary text-sm"
              >
                <RefreshCw size={13} /> Regenerate
              </button>

              {/* Regenerate with different tone shortcuts */}
              {TONES.filter((t) => t.value !== tone).slice(0, 2).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setTone(t.value); generate(t.value); }}
                  className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  Try {t.label}
                </button>
              ))}
            </div>

            {/* Save to job tracker */}
            {selectedJobId && (
              <button
                type="button"
                onClick={saveToApplication}
                disabled={saving || savedToJob}
                className={clsx(
                  "flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-all shrink-0",
                  savedToJob
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-800 hover:bg-slate-900 text-white"
                )}
              >
                {saving
                  ? <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  : savedToJob
                  ? <><CheckCircle size={13} /> Saved to Tracker</>
                  : <><Save size={13} /> Save to Application</>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tips when no letter yet */}
      {!letter && !loading && (
        <div className="card p-5">
          <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <BookOpen size={15} className="text-indigo-500" /> Tips for a better cover letter
          </h3>
          <ul className="space-y-2">
            {[
              "Paste the full job description — the more detail, the better the match",
              "Use your resume from the Resume Analyzer for best results",
              "Try different tones — Creative works great for startups, Professional for corporate",
              "Select a saved job from your tracker to pre-fill company and role details",
            ].map((tip, i) => (
              <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                <span className="text-indigo-400 font-bold shrink-0">→</span> {tip}
              </li>
            ))}
          </ul>
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
