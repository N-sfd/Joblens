"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { MatchResult, MatchHistoryEntry, PublicJobListing, JobRequirement, ResumeHistoryEntry } from "@/types";
import ScoreCircle from "@/components/ScoreCircle";
import AgentActivity from "@/components/AgentActivity";
import ErrorBanner from "@/components/ErrorBanner";
import HistoryPanel from "@/components/HistoryPanel";
import PrivacyNote from "@/components/PrivacyNote";
import {
  Target, CheckCircle, XCircle, AlertCircle, Lightbulb, Tag, BookOpen,
  Loader2, ArrowRight, Save, PenTool, Zap, MessageSquare, ChevronDown,
  ChevronUp, Copy, X, GraduationCap, Search, RefreshCw, MapPin,
  Mail, Phone, Pencil, Info, Inbox, WifiOff, Briefcase,
} from "lucide-react";
import clsx from "clsx";

const RESUME_KEY = "aijob_resume_text";
const JD_KEY = "aijob_jd_text";

const MATCH_STEPS = [
  "Parsing resume",
  "Extracting job requirements",
  "Comparing skills and keywords",
  "Analyzing experience alignment",
  "Calculating match score",
  "Generating tailoring suggestions",
];

const BULLETS_STEPS = [
  "Analyzing job description keywords",
  "Matching relevant experience",
  "Crafting impact-focused bullets",
  "Optimizing for ATS",
];

const QUESTIONS_STEPS = [
  "Analyzing role requirements",
  "Identifying key competencies",
  "Generating behavioral questions",
  "Preparing suggested answers",
];

const likelihoodStyle = {
  low: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-green-100 text-green-700",
};

const recommendationStyle: Record<string, string> = {
  "Strong Match": "bg-green-100 text-green-700",
  "Good Match": "bg-blue-100 text-blue-700",
  "Weak Match": "bg-amber-100 text-amber-700",
  "Not Recommended": "bg-red-100 text-red-700",
};

const STATUSES = ["Applied", "Interviewing", "Offer", "Rejected", "Saved"] as const;

export default function MatchPage() {
  const router = useRouter();

  const [resumeText, setResumeText] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(RESUME_KEY) ?? "" : ""
  );
  const [resumeSource, setResumeSource] = useState<string | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
  const [savedResumes, setSavedResumes] = useState<ResumeHistoryEntry[]>([]);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);

  // Select ATS Job vs. Paste Manually
  const [mode, setMode] = useState<"ats" | "manual">("ats");
  const [atsJobs, setAtsJobs] = useState<PublicJobListing[]>([]);
  const [atsJobsLoading, setAtsJobsLoading] = useState(true);
  const [atsJobsError, setAtsJobsError] = useState<string | null>(null);
  const [atsSearch, setAtsSearch] = useState("");
  const [atsLocation, setAtsLocation] = useState("");
  const [atsWorkType, setAtsWorkType] = useState("");
  const [atsSkills, setAtsSkills] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<number | "">("");
  const [selectedJob, setSelectedJob] = useState<JobRequirement | null>(null);
  const [selectedJobLoading, setSelectedJobLoading] = useState(false);
  const [selectedJobError, setSelectedJobError] = useState<string | null>(null);
  const [editOverride, setEditOverride] = useState(false);
  const [overrideFields, setOverrideFields] = useState({
    job_description: "", required_skills: "", preferred_skills: "",
    location: "", work_type: "", rate: "",
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  // Action states
  const [bullets, setBullets] = useState<string[] | null>(null);
  const [bulletsLoading, setBulletsLoading] = useState(false);
  const [bulletsDone, setBulletsDone] = useState(false);
  const [questions, setQuestions] = useState<{ question: string; type: string; suggested_answer: string }[] | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsDone, setQuestionsDone] = useState(false);
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  // Save to tracker modal
  const [showSave, setShowSave] = useState(false);
  const [saveForm, setSaveForm] = useState({ company: "", role: "", status: "Applied" as string });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    api.getMatchHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
    api.getResumeHistory().then(setSavedResumes).catch(() => {});
  }, []);

  const selectSavedResume = (id: number | "") => {
    if (id === "") return;
    const entry = savedResumes.find((r) => r.id === id);
    if (!entry) return;
    setResumeText(entry.resume_text);
    setResumeSource(entry.filename || "Saved resume");
    setResumeUploadError(null);
  };

  const uploadResume = async (file: File) => {
    setResumeUploading(true);
    setResumeUploadError(null);
    try {
      const data = await api.analyzeResumeFile(file);
      setResumeText(data.resume_text);
      setResumeSource(file.name);
      api.getResumeHistory().then(setSavedResumes).catch(() => {});
    } catch (e) {
      setResumeUploadError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setResumeUploading(false);
    }
  };

  const loadFromHistory = (entry: MatchHistoryEntry) => {
    setResumeText(entry.resume_text);
    setJobDescription(entry.job_description);
    setResult(entry.match);
    setDone(true);
    setBullets(null);
    setBulletsDone(false);
    setQuestions(null);
    setQuestionsDone(false);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadAtsJobs = async (overrides?: { search?: string; location?: string; work_type?: string; skills?: string }) => {
    setAtsJobsLoading(true);
    setAtsJobsError(null);
    try {
      const res = await api.listPublicJobs({
        q: (overrides?.search ?? atsSearch) || undefined,
        location: (overrides?.location ?? atsLocation) || undefined,
        work_type: (overrides?.work_type ?? atsWorkType) || undefined,
        skills: (overrides?.skills ?? atsSkills) || undefined,
        page_size: 50,
      });
      setAtsJobs(res.items);
    } catch (e) {
      setAtsJobsError(e instanceof Error ? e.message : "Couldn't reach the job source.");
    } finally {
      setAtsJobsLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "ats") loadAtsJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const resetOverride = (job: JobRequirement | null) => {
    setEditOverride(false);
    setOverrideFields({
      job_description: job?.job_description ?? "",
      required_skills: (job?.required_skills ?? []).join(", "),
      preferred_skills: (job?.preferred_skills ?? []).join(", "),
      location: job?.location ?? "",
      work_type: job?.work_type ?? "",
      rate: job?.rate ?? "",
    });
  };

  const selectJob = async (id: number | "") => {
    setSelectedJobId(id);
    setSelectedJob(null);
    setSelectedJobError(null);
    if (id === "") return;
    setSelectedJobLoading(true);
    try {
      const job = await api.getPublicJob(Number(id));
      setSelectedJob(job);
      resetOverride(job);
      showToast(`Imported "${job.job_title}" from ATS.`);
    } catch (e) {
      setSelectedJobError(
        e instanceof Error ? e.message : "This job is no longer available — it may have closed or been unpublished."
      );
    } finally {
      setSelectedJobLoading(false);
    }
  };

  // Builds the text actually sent to the matcher: the full structured job
  // context, with any "Edit for this analysis" overrides applied locally —
  // never written back to the source ATS record.
  const effectiveJobDescription = () => {
    if (mode === "manual" || !selectedJob) return jobDescription;
    const f = overrideFields;
    const lines = [
      `Job Title: ${selectedJob.job_title}`,
      selectedJob.client ? `Client: ${selectedJob.client}` : "",
      selectedJob.vendor ? `Vendor: ${selectedJob.vendor}` : "",
      selectedJob.end_client ? `End Client: ${selectedJob.end_client}` : "",
      f.location ? `Location: ${f.location}` : "",
      f.work_type ? `Work Arrangement: ${f.work_type}` : "",
      selectedJob.employment_type ? `Employment Type: ${selectedJob.employment_type}` : "",
      selectedJob.duration ? `Duration: ${selectedJob.duration}` : "",
      f.rate ? `Rate: ${f.rate}` : "",
      selectedJob.visa_requirement ? `Work Authorization: ${selectedJob.visa_requirement}` : "",
      f.required_skills ? `Required Skills: ${f.required_skills}` : "",
      f.preferred_skills ? `Preferred Skills: ${f.preferred_skills}` : "",
      "",
      f.job_description || "",
    ].filter(Boolean);
    return lines.join("\n");
  };

  const effectiveCompanyName = () =>
    mode === "ats" && selectedJob ? (selectedJob.client || selectedJob.vendor || undefined) : undefined;

  const run = async () => {
    const effectiveJD = effectiveJobDescription();
    setLoading(true);
    setDone(false);
    setError(null);
    setBullets(null);
    setBulletsDone(false);
    setQuestions(null);
    setQuestionsDone(false);
    try {
      const data = await api.matchJob(resumeText, effectiveJD, {
        company_name: effectiveCompanyName(),
        job_requirement_id: mode === "ats" ? selectedJob?.id : undefined,
      });
      setDone(true);
      setResult(data);
      if (mode === "manual") localStorage.setItem(JD_KEY, jobDescription);
      api.getMatchHistory().then(setHistory).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Match failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleBullets = async () => {
    setBulletsLoading(true);
    setBulletsDone(false);
    try {
      const data = await api.generateResumeBullets(resumeText, effectiveJobDescription());
      setBulletsDone(true);
      setBullets(data.bullets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate bullets.");
    } finally {
      setBulletsLoading(false);
    }
  };

  const handleQuestions = async () => {
    setQuestionsLoading(true);
    setQuestionsDone(false);
    try {
      const data = await api.createInterviewQuestions(resumeText, effectiveJobDescription());
      setQuestionsDone(true);
      setQuestions(data.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate questions.");
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleSaveToTracker = async () => {
    if (!saveForm.company || !saveForm.role) return;
    setSaving(true);
    try {
      const matchNote = result ? `AI Match Score: ${result.match_score}% · Likelihood: ${result.likelihood}${result.missing_skills.length ? ` · Add keywords: ${result.missing_skills.slice(0, 4).join(", ")}` : ""}` : undefined;
      await api.createJob({
        company: saveForm.company,
        role: saveForm.role,
        status: saveForm.status as never,
        notes: matchNote ?? null,
        job_url: null, salary_range: null, location: null,
        work_type: null, recruiter_name: null, recruiter_email: null,
        follow_up_date: null, date_applied: null, reminder_type: null,
      });
      setShowSave(false);
      showToast("Saved to Job Tracker!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleCoverLetter = () => {
    localStorage.setItem(JD_KEY, effectiveJobDescription());
    router.push("/cover-letter");
  };

  const importantKeywords = result
    ? [
        ...result.keyword_report.matched.map((k) => ({ keyword: k.keyword, count: k.jd_count, found: true })),
        ...result.keyword_report.missing.map((k) => ({ keyword: k.keyword, count: k.jd_count, found: false })),
      ]
        .sort((a, b) => b.count - a.count)
        .slice(0, 14)
    : [];

  const typeColor: Record<string, string> = {
    behavioral: "bg-blue-100 text-blue-700",
    technical: "bg-purple-100 text-purple-700",
    situational: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-slide-up">
          {toast}
        </div>
      )}

      <div className="mb-8">
        <p className="page-kicker">AI Tool</p>
        <h1 className="page-title">Job Matcher</h1>
        <p className="page-subtitle">Paste your resume and job description to get a fit score, tailored bullets, and interview prep.</p>
      </div>

      <HistoryPanel
        title="Past Matches"
        items={history}
        loading={historyLoading}
        getKey={(h) => h.id}
        renderItem={(h) => ({
          primary: `Score: ${h.match.match_score}% · ${h.match.likelihood} likelihood`,
          secondary: h.job_description.slice(0, 80),
          date: h.created_at,
        })}
        onSelect={loadFromHistory}
      />

      {/* Input Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Left: resume */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
            <label className="label mb-0">Your Resume</label>
            <div className="flex items-center gap-3">
              {savedResumes.length > 0 && (
                <select
                  className="input text-xs py-1 w-auto"
                  aria-label="Select a saved resume"
                  value=""
                  onChange={(e) => selectSavedResume(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Select a saved resume…</option>
                  {savedResumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.filename || "Resume"} — {new Date(r.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              )}
              <label className="text-xs font-medium text-indigo-600 hover:underline cursor-pointer flex items-center gap-1">
                {resumeUploading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Upload file
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  disabled={resumeUploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadResume(f); }}
                />
              </label>
            </div>
          </div>
          <textarea
            className="textarea h-56"
            placeholder="Paste your resume text here, upload a file, or select a saved resume above…"
            value={resumeText}
            onChange={(e) => { setResumeText(e.target.value); setResumeSource(null); }}
          />
          {resumeUploadError && <p className="text-xs text-red-600 mt-1.5">{resumeUploadError}</p>}
          {resumeSource && (
            <p className="text-xs text-slate-400 mt-1.5">Loaded from <span className="font-medium text-slate-600 dark:text-slate-300">{resumeSource}</span> · {resumeText.trim().split(/\s+/).filter(Boolean).length} words</p>
          )}
          {typeof window !== "undefined" && localStorage.getItem(RESUME_KEY) && resumeText !== localStorage.getItem(RESUME_KEY) && (
            <button type="button" onClick={() => { setResumeText(localStorage.getItem(RESUME_KEY) ?? ""); setResumeSource("last analysis"); }}
              className="text-xs text-indigo-600 hover:underline mt-1.5 flex items-center gap-1">
              <ArrowRight size={11} /> Load from last analysis
            </button>
          )}
        </div>

        {/* Right: job — Select ATS Job / Paste Manually */}
        <div className="card p-5">
          <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
            {([{ key: "ats", label: "Select ATS Job" }, { key: "manual", label: "Paste Manually" }] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setMode(t.key)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  mode === t.key
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === "manual" ? (
            <textarea
              className="textarea h-64"
              placeholder="Paste the job description here…"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          ) : (
            <div className="space-y-3">
              {/* Search + refresh */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input pl-8"
                    placeholder="Search title, client, vendor, skills…"
                    value={atsSearch}
                    onChange={(e) => setAtsSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadAtsJobs()}
                  />
                </div>
                <button type="button" onClick={() => loadAtsJobs()} disabled={atsJobsLoading} title="Refresh"
                  className="btn-secondary px-3">
                  <RefreshCw size={14} className={atsJobsLoading ? "animate-spin" : ""} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input className="input text-sm" placeholder="Location" value={atsLocation}
                  onChange={(e) => setAtsLocation(e.target.value)}
                  onBlur={() => loadAtsJobs()}
                  onKeyDown={(e) => e.key === "Enter" && loadAtsJobs()} />
                <select
                  className="input text-sm"
                  aria-label="Work arrangement filter"
                  value={atsWorkType}
                  onChange={(e) => { setAtsWorkType(e.target.value); loadAtsJobs({ work_type: e.target.value }); }}
                >
                  <option value="">Any arrangement</option>
                  <option value="Remote">Remote</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Onsite">Onsite</option>
                </select>
                <input className="input text-sm" placeholder="Skills (comma-separated)" value={atsSkills}
                  onChange={(e) => setAtsSkills(e.target.value)}
                  onBlur={() => loadAtsJobs()}
                  onKeyDown={(e) => e.key === "Enter" && loadAtsJobs()} />
              </div>
              {(atsSearch || atsLocation || atsWorkType || atsSkills) && (
                <button
                  type="button"
                  onClick={() => {
                    setAtsSearch(""); setAtsLocation(""); setAtsWorkType(""); setAtsSkills("");
                    loadAtsJobs({ search: "", location: "", work_type: "", skills: "" });
                  }}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  Clear Filters
                </button>
              )}

              {/* Job picker states */}
              {atsJobsLoading ? (
                <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-8">
                  <Loader2 size={16} className="animate-spin" /> Loading published jobs…
                </div>
              ) : atsJobsError ? (
                <div className="text-center py-6">
                  <WifiOff size={28} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">External job source unavailable.</p>
                  <p className="text-xs text-slate-400 mt-0.5">{atsJobsError}</p>
                  <button type="button" onClick={() => loadAtsJobs()} className="btn-secondary text-xs mt-3">
                    <RefreshCw size={12} className="inline mr-1" /> Retry connection
                  </button>
                </div>
              ) : atsJobs.length === 0 ? (
                <div className="text-center py-6">
                  <Inbox size={28} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">No approved open jobs are currently available.</p>
                  <div className="flex items-center justify-center gap-3 mt-2">
                    <button type="button" onClick={() => loadAtsJobs()} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                      <RefreshCw size={11} /> Refresh Jobs
                    </button>
                    <button type="button" onClick={() => setMode("manual")} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                      <Pencil size={11} /> Paste Job Manually
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  className="input"
                  aria-label="Select a published ATS job"
                  value={selectedJobId}
                  onChange={(e) => selectJob(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">— Choose a published job —</option>
                  {atsJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_title}{j.client ? ` — ${j.client}` : j.vendor ? ` — ${j.vendor}` : ""}{j.location ? ` · ${j.location}` : ""}
                    </option>
                  ))}
                </select>
              )}

              {/* Selected job */}
              {selectedJobLoading && (
                <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-6">
                  <Loader2 size={16} className="animate-spin" /> Importing job details…
                </div>
              )}
              {selectedJobError && (
                <div>
                  <ErrorBanner
                    message={selectedJobError}
                    onDismiss={() => setSelectedJobError(null)}
                    onRetry={() => selectJob(selectedJobId)}
                  />
                  <button type="button" onClick={() => setMode("manual")} className="text-xs text-indigo-600 hover:underline mt-2 flex items-center gap-1">
                    <Pencil size={11} /> Switch to Manual Entry
                  </button>
                </div>
              )}
              {selectedJob && !selectedJobLoading && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3 max-h-[420px] overflow-y-auto">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 px-2.5 py-1 rounded-full">
                      <Info size={11} /> Imported from ATS
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditOverride((v) => !v)}
                      className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                    >
                      <Pencil size={11} /> {editOverride ? "Done editing" : "Edit for this analysis"}
                    </button>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{selectedJob.job_title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedJob.job_reference_number && <>Ref #{selectedJob.job_reference_number} · </>}
                      Received {selectedJob.received_at ? new Date(selectedJob.received_at).toLocaleDateString() : "—"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <span className="text-slate-400">Client</span><span className="text-slate-700 dark:text-slate-300">{selectedJob.client || "—"}</span>
                    <span className="text-slate-400">Vendor</span><span className="text-slate-700 dark:text-slate-300">{selectedJob.vendor || "—"}</span>
                    {selectedJob.end_client && <><span className="text-slate-400">End Client</span><span className="text-slate-700 dark:text-slate-300">{selectedJob.end_client}</span></>}
                    <span className="text-slate-400 flex items-center gap-1"><MapPin size={11} /> Location</span>
                    {editOverride ? (
                      <input className="input text-xs py-1" value={overrideFields.location}
                        onChange={(e) => setOverrideFields((f) => ({ ...f, location: e.target.value }))} />
                    ) : <span className="text-slate-700 dark:text-slate-300">{selectedJob.location || "—"}</span>}
                    <span className="text-slate-400">Arrangement</span>
                    {editOverride ? (
                      <input className="input text-xs py-1" value={overrideFields.work_type}
                        onChange={(e) => setOverrideFields((f) => ({ ...f, work_type: e.target.value }))} />
                    ) : <span className="text-slate-700 dark:text-slate-300">{selectedJob.work_type || "—"}</span>}
                    <span className="text-slate-400">Employment Type</span><span className="text-slate-700 dark:text-slate-300">{selectedJob.employment_type || "—"}</span>
                    <span className="text-slate-400">Duration</span><span className="text-slate-700 dark:text-slate-300">{selectedJob.duration || "—"}</span>
                    <span className="text-slate-400">Rate</span>
                    {editOverride ? (
                      <input className="input text-xs py-1" value={overrideFields.rate}
                        onChange={(e) => setOverrideFields((f) => ({ ...f, rate: e.target.value }))} />
                    ) : <span className="text-slate-700 dark:text-slate-300">{selectedJob.rate || "—"}</span>}
                    <span className="text-slate-400">Work Authorization</span><span className="text-slate-700 dark:text-slate-300">{selectedJob.visa_requirement || "—"}</span>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Required Skills</p>
                    {editOverride ? (
                      <input className="input text-xs py-1" value={overrideFields.required_skills}
                        onChange={(e) => setOverrideFields((f) => ({ ...f, required_skills: e.target.value }))} />
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedJob.required_skills.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-full text-[11px] font-medium">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {(selectedJob.preferred_skills.length > 0 || editOverride) && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Preferred Skills</p>
                      {editOverride ? (
                        <input className="input text-xs py-1" value={overrideFields.preferred_skills}
                          onChange={(e) => setOverrideFields((f) => ({ ...f, preferred_skills: e.target.value }))} />
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedJob.preferred_skills.map((s, i) => (
                            <span key={i} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-full text-[11px] font-medium">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Job Description</p>
                    {editOverride ? (
                      <textarea className="textarea text-xs h-28" value={overrideFields.job_description}
                        onChange={(e) => setOverrideFields((f) => ({ ...f, job_description: e.target.value }))} />
                    ) : (
                      <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{selectedJob.job_description || "—"}</p>
                    )}
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1"><Briefcase size={11} /> Recruiter</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span className="text-slate-400">Name</span><span className="text-slate-700 dark:text-slate-300">{selectedJob.recruiter_name || "—"}</span>
                      <span className="text-slate-400">Company</span><span className="text-slate-700 dark:text-slate-300">{selectedJob.vendor || "—"}</span>
                      <span className="text-slate-400 flex items-center gap-1"><Mail size={11} /> Email</span><span className="text-slate-700 dark:text-slate-300 truncate">{selectedJob.recruiter_email || "—"}</span>
                      <span className="text-slate-400 flex items-center gap-1"><Phone size={11} /> Phone</span><span className="text-slate-700 dark:text-slate-300">{selectedJob.recruiter_phone || "—"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <PrivacyNote className="mb-4">
        Your resume and this job description are used only to generate your match score and are never sold or shared. Read our
      </PrivacyNote>

      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={run} className="mb-4" />
      )}

      {(() => {
        const missing: string[] = [];
        if (resumeText.length < 50) missing.push("a resume (paste, upload, or select a saved one)");
        if (effectiveJobDescription().length < 50) {
          missing.push(mode === "ats" ? "a selected ATS job" : "a job description");
        }
        const canRun = missing.length === 0;
        return (
          <>
            <button
              type="button"
              onClick={run}
              disabled={loading || !canRun}
              className="btn-primary flex items-center gap-2 w-full justify-center py-3"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Analyzing…</>
                : <><Target size={16} /> Analyze Resume Against This Job</>}
            </button>
            {!canRun && !loading && (
              <p className="text-xs text-slate-400 text-center mt-2 mb-5">
                Add {missing.join(" and ")} to run the analysis.
              </p>
            )}
            {canRun && <div className="mb-5" />}
          </>
        );
      })()}

      {/* Main match agent activity */}
      <AgentActivity steps={MATCH_STEPS} isRunning={loading} isDone={done} className="mb-5" />

      {/* Results */}
      {result && (
        <div className="space-y-5 animate-slide-up">
          {/* Score Hero */}
          <div className="card p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ScoreCircle score={result.match_score} label="ATS Match Score" size={140} />
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start mb-2">
                  <span className={clsx(
                    "px-3 py-1 rounded-full text-sm font-bold",
                    recommendationStyle[result.recommendation] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  )}>
                    {result.recommendation}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                  <span className={clsx("px-3 py-1 rounded-full text-sm font-semibold", likelihoodStyle[result.likelihood])}>
                    {result.likelihood.charAt(0).toUpperCase() + result.likelihood.slice(1)} likelihood
                  </span>
                  <span className={clsx(
                    "px-3 py-1 rounded-full text-sm font-semibold",
                    result.likelihood === "high" ? "bg-green-100 text-green-700" :
                    result.likelihood === "medium" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                  )}>
                    {result.ats_verdict}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-3 leading-relaxed">{result.summary}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row flex-wrap gap-2">
              <button type="button"
                onClick={() => setShowSave(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors w-full sm:w-auto"
              >
                <Save size={14} /> Save to Tracker
              </button>
              <button type="button"
                onClick={handleBullets}
                disabled={bulletsLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 w-full sm:w-auto"
              >
                {bulletsLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Better Bullets
              </button>
              <button type="button"
                onClick={handleCoverLetter}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors w-full sm:w-auto"
              >
                <PenTool size={14} /> Cover Letter
              </button>
              <button type="button"
                onClick={handleQuestions}
                disabled={questionsLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 w-full sm:w-auto"
              >
                {questionsLoading ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                Interview Prep
              </button>
            </div>
          </div>

          {/* ATS Score Breakdown */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
              <Target size={15} className="text-indigo-500" /> ATS Score Breakdown
            </h3>
            <div className="space-y-3">
              {[
                { label: "Keyword Match", score: result.keyword_match_score, hint: "exact JD keyword coverage" },
                { label: "Skills Fit", score: result.skills_match_score, hint: "AI-judged skills alignment" },
                { label: "Experience Fit", score: result.experience_match_score, hint: "AI-judged experience alignment" },
                { label: "Education Fit", score: result.education_match_score, hint: "AI-judged education alignment" },
                { label: "Formatting Compliance", score: result.formatting_score, hint: "ATS parsability" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{row.label}</span>
                    <span className="text-xs text-slate-400">{row.score}/100</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-full rounded-full transition-all duration-700",
                        row.score >= 80 ? "bg-green-500" : row.score >= 60 ? "bg-amber-500" : "bg-red-400"
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, row.score))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Important Job Keywords */}
          {importantKeywords.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Tag size={15} className="text-indigo-500" /> Important Job Keywords
              </h3>
              <div className="flex flex-wrap gap-2">
                {importantKeywords.map((k, i) => (
                  <span
                    key={i}
                    className={clsx(
                      "px-2.5 py-1 rounded-full text-xs font-medium",
                      k.found ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    )}
                  >
                    {k.keyword} <span className={k.found ? "text-green-400" : "text-red-400"}>×{k.count} in JD</span>
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">Top keywords from the job description, ranked by frequency — green means found in your resume, red means missing.</p>
            </div>
          )}

          {/* Keyword Scan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <CheckCircle size={15} className="text-green-500" /> Keywords Found in Resume
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.keyword_report.matched.length === 0 && (
                  <p className="text-sm text-slate-400">No exact keyword overlaps detected.</p>
                )}
                {result.keyword_report.matched.map((k, i) => (
                  <span key={i} className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                    {k.keyword} <span className="text-green-400">×{k.resume_count}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <XCircle size={15} className="text-red-400" /> Keywords Missing from Resume
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.keyword_report.missing.length === 0 && (
                  <p className="text-sm text-slate-400">No missing high-frequency keywords detected.</p>
                )}
                {result.keyword_report.missing.map((k, i) => (
                  <span key={i} className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">
                    {k.keyword} <span className="text-red-400">×{k.jd_count} in JD</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Formatting Issues */}
          {result.formatting_issues.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-500" /> ATS Formatting Issues
              </h3>
              <ul className="space-y-2">
                {result.formatting_issues.map((issue, i) => (
                  <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                    <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" /> {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Skills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <CheckCircle size={15} className="text-green-500" /> Matching Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.matching_skills.map((s, i) => (
                  <span key={i} className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <XCircle size={15} className="text-red-400" /> Missing Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.missing_skills.map((s, i) => (
                  <span key={i} className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Experience & Gaps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <CheckCircle size={15} className="text-indigo-500" /> Matching Experience
              </h3>
              <ul className="space-y-2">
                {result.matching_experience.map((e, i) => (
                  <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                    <CheckCircle size={13} className="text-indigo-400 mt-0.5 shrink-0" /> {e}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-500" /> Gaps
              </h3>
              <ul className="space-y-2">
                {result.gaps.map((g, i) => (
                  <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                    <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" /> {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Tailoring Suggestions */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Lightbulb size={15} className="text-amber-500" /> Tailoring Suggestions
            </h3>
            <div className="space-y-3">
              {result.tailoring_suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-4 py-3">
                  <span className="text-xs font-bold text-amber-700 bg-amber-200 px-2 py-0.5 rounded-full shrink-0 mt-0.5">{s.section}</span>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{s.suggestion}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Keywords & Interview Tips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Tag size={15} className="text-indigo-500" /> Keywords to Add
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.keywords_to_add.map((k, i) => (
                  <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium border border-indigo-100">{k}</span>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <BookOpen size={15} className="text-purple-500" /> Quick Interview Tips
              </h3>
              <ul className="space-y-2">
                {result.interview_preparation.map((t, i) => (
                  <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                    <span className="text-purple-400 font-bold shrink-0">→</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Learning Resources for Missing Skills */}
          {result.learning_resources.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <GraduationCap size={15} className="text-emerald-500" /> Close the Gap
              </h3>
              <div className="space-y-3">
                {result.learning_resources.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 bg-emerald-50 rounded-lg px-4 py-3">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-200 px-2 py-0.5 rounded-full shrink-0 mt-0.5">{r.skill}</span>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{r.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bullets agent activity */}
          <AgentActivity steps={BULLETS_STEPS} isRunning={bulletsLoading} isDone={bulletsDone} />

          {/* Generated Resume Bullets */}
          {bullets && (
            <div className="card p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Zap size={15} className="text-purple-500" /> AI-Improved Resume Bullets
                </h3>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(bullets.map(b => `• ${b}`).join("\n"))}
                  className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  <Copy size={12} /> Copy all
                </button>
              </div>
              <ul className="space-y-2.5">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 bg-purple-50 rounded-lg px-4 py-2.5">
                    <span className="text-purple-500 font-bold shrink-0 mt-0.5">•</span> {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions agent activity */}
          <AgentActivity steps={QUESTIONS_STEPS} isRunning={questionsLoading} isDone={questionsDone} />

          {/* Interview Questions */}
          {questions && (
            <div className="card p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <MessageSquare size={15} className="text-amber-500" /> Interview Questions & Answers
                </h3>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(
                    questions.map((q, i) => `${i + 1}. [${q.type}] ${q.question}\n${q.suggested_answer}`).join("\n\n")
                  )}
                  className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  <Copy size={12} /> Copy all
                </button>
              </div>
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenQuestion(openQuestion === i ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full shrink-0", typeColor[q.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400")}>
                          {q.type}
                        </span>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{q.question}</span>
                      </div>
                      {openQuestion === i ? <ChevronUp size={15} className="text-slate-400 shrink-0" /> : <ChevronDown size={15} className="text-slate-400 shrink-0" />}
                    </button>
                    {openQuestion === i && (
                      <div className="px-4 pb-4 bg-amber-50 dark:bg-amber-950/20 border-t border-slate-100">
                        <p className="text-xs font-semibold text-amber-700 mt-3 mb-1.5">Suggested Answer</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{q.suggested_answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save to Tracker Modal */}
      {showSave && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Save to Job Tracker</h3>
              <button type="button" aria-label="Close" onClick={() => setShowSave(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Company</label>
                <input className="input" placeholder="Company name" value={saveForm.company}
                  onChange={(e) => setSaveForm({ ...saveForm, company: e.target.value })} />
              </div>
              <div>
                <label className="label">Role</label>
                <input className="input" placeholder="Job title" value={saveForm.role}
                  onChange={(e) => setSaveForm({ ...saveForm, role: e.target.value })} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={saveForm.status}
                  aria-label="Application status"
                  onChange={(e) => setSaveForm({ ...saveForm, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button type="button" onClick={() => setShowSave(false)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={handleSaveToTracker} disabled={saving || !saveForm.company || !saveForm.role}
                className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
