"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { logActivity } from "@/lib/activityLog";
import type { MatchResult } from "@/types";
import ScoreCircle from "@/components/ScoreCircle";
import AgentActivity from "@/components/AgentActivity";
import {
  Target, CheckCircle, XCircle, AlertCircle, Lightbulb, Tag, BookOpen,
  Loader2, ArrowRight, Save, PenTool, Zap, MessageSquare, ChevronDown,
  ChevronUp, Copy, X,
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

const STATUSES = ["Applied", "Interviewing", "Offer", "Rejected", "Saved"] as const;

export default function MatchPage() {
  const router = useRouter();

  const [resumeText, setResumeText] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(RESUME_KEY) ?? "" : ""
  );
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const run = async () => {
    setLoading(true);
    setDone(false);
    setError(null);
    setBullets(null);
    setBulletsDone(false);
    setQuestions(null);
    setQuestionsDone(false);
    try {
      const data = await api.matchJob(resumeText, jobDescription);
      setDone(true);
      setResult(data);
      localStorage.setItem(JD_KEY, jobDescription);
      logActivity({
        type: "job_matched",
        summary: `Job match analyzed — Score: ${data.match_score}%`,
        detail: `Likelihood: ${data.likelihood} · Missing skills: ${data.missing_skills.slice(0, 3).join(", ")}`,
      });
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
      const data = await api.generateResumeBullets(resumeText, jobDescription);
      setBulletsDone(true);
      setBullets(data.bullets);
      logActivity({ type: "bullets_generated", summary: `Generated ${data.bullets.length} improved resume bullets` });
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
      const data = await api.createInterviewQuestions(resumeText, jobDescription);
      setQuestionsDone(true);
      setQuestions(data.questions);
      logActivity({ type: "questions_generated", summary: `Generated ${data.questions.length} interview questions` });
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
        follow_up_date: null, date_applied: null,
      });
      logActivity({
        type: "job_saved",
        summary: `Saved ${saveForm.company} — ${saveForm.role} to Job Tracker`,
        detail: result ? `Match Score: ${result.match_score}% · Status: ${saveForm.status}` : undefined,
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
    localStorage.setItem(JD_KEY, jobDescription);
    router.push("/cover-letter");
  };

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
        <h1 className="text-2xl font-bold text-slate-900">Job Matcher</h1>
        <p className="text-slate-500 mt-1">Paste your resume and job description to get a fit score, tailored bullets, and interview prep.</p>
      </div>

      {/* Input Panel */}
      <div className="card p-5 mb-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Your Resume</label>
            <textarea
              className="textarea h-56"
              placeholder="Paste your resume text here…"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
            />
            {typeof window !== "undefined" && localStorage.getItem(RESUME_KEY) && resumeText !== localStorage.getItem(RESUME_KEY) && (
              <button type="button" onClick={() => setResumeText(localStorage.getItem(RESUME_KEY) ?? "")}
                className="text-xs text-indigo-600 hover:underline mt-1.5 flex items-center gap-1">
                <ArrowRight size={11} /> Load from last analysis
              </button>
            )}
          </div>
          <div>
            <label className="label">Job Description</label>
            <textarea
              className="textarea h-56"
              placeholder="Paste the job description here…"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
            <AlertCircle size={15} /> {error}
            <button type="button" aria-label="Dismiss error" onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        <button
          type="button"
          onClick={run}
          disabled={loading || resumeText.length < 50 || jobDescription.length < 50}
          className="btn-primary flex items-center gap-2 w-full justify-center py-3"
        >
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Analyzing match…</>
            : <><Target size={16} /> Analyze Match</>}
        </button>
      </div>

      {/* Main match agent activity */}
      <AgentActivity steps={MATCH_STEPS} isRunning={loading} isDone={done} className="mb-5" />

      {/* Results */}
      {result && (
        <div className="space-y-5 animate-slide-up">
          {/* Score Hero */}
          <div className="card p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ScoreCircle score={result.match_score} label="Match Score" size={140} />
              <div className="flex-1 text-center sm:text-left">
                <span className={clsx("px-3 py-1 rounded-full text-sm font-semibold", likelihoodStyle[result.likelihood])}>
                  {result.likelihood.charAt(0).toUpperCase() + result.likelihood.slice(1)} likelihood
                </span>
                <p className="text-slate-600 text-sm mt-3 leading-relaxed">{result.summary}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col sm:flex-row flex-wrap gap-2">
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

          {/* Skills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <CheckCircle size={15} className="text-green-500" /> Matching Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.matching_skills.map((s, i) => (
                  <span key={i} className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
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
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <CheckCircle size={15} className="text-indigo-500" /> Matching Experience
              </h3>
              <ul className="space-y-2">
                {result.matching_experience.map((e, i) => (
                  <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                    <CheckCircle size={13} className="text-indigo-400 mt-0.5 shrink-0" /> {e}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-500" /> Gaps
              </h3>
              <ul className="space-y-2">
                {result.gaps.map((g, i) => (
                  <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                    <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" /> {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Tailoring Suggestions */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Lightbulb size={15} className="text-amber-500" /> Tailoring Suggestions
            </h3>
            <div className="space-y-3">
              {result.tailoring_suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-3 bg-amber-50 rounded-lg px-4 py-3">
                  <span className="text-xs font-bold text-amber-700 bg-amber-200 px-2 py-0.5 rounded-full shrink-0 mt-0.5">{s.section}</span>
                  <p className="text-sm text-slate-700">{s.suggestion}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Keywords & Interview Tips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Tag size={15} className="text-indigo-500" /> Keywords to Add
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.keywords_to_add.map((k, i) => (
                  <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium border border-indigo-100">{k}</span>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <BookOpen size={15} className="text-purple-500" /> Quick Interview Tips
              </h3>
              <ul className="space-y-2">
                {result.interview_preparation.map((t, i) => (
                  <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                    <span className="text-purple-400 font-bold shrink-0">→</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bullets agent activity */}
          <AgentActivity steps={BULLETS_STEPS} isRunning={bulletsLoading} isDone={bulletsDone} />

          {/* Generated Resume Bullets */}
          {bullets && (
            <div className="card p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                  <Zap size={15} className="text-purple-500" /> AI-Improved Resume Bullets
                </h3>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(bullets.map(b => `• ${b}`).join("\n"))}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  <Copy size={12} /> Copy all
                </button>
              </div>
              <ul className="space-y-2.5">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 bg-purple-50 rounded-lg px-4 py-2.5">
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
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <MessageSquare size={15} className="text-amber-500" /> Interview Questions & Answers
              </h3>
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenQuestion(openQuestion === i ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full shrink-0", typeColor[q.type] ?? "bg-slate-100 text-slate-600")}>
                          {q.type}
                        </span>
                        <span className="text-sm font-medium text-slate-800 truncate">{q.question}</span>
                      </div>
                      {openQuestion === i ? <ChevronUp size={15} className="text-slate-400 shrink-0" /> : <ChevronDown size={15} className="text-slate-400 shrink-0" />}
                    </button>
                    {openQuestion === i && (
                      <div className="px-4 pb-4 bg-amber-50 border-t border-slate-100">
                        <p className="text-xs font-semibold text-amber-700 mt-3 mb-1.5">Suggested Answer</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{q.suggested_answer}</p>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Save to Job Tracker</h3>
              <button type="button" aria-label="Close" onClick={() => setShowSave(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
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
