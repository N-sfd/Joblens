"use client";

import { useState, useRef, useEffect, DragEvent } from "react";
import { api } from "@/lib/api";
import type { ResumeAnalysis, ResumeHistoryEntry } from "@/types";
import ScoreCircle from "@/components/ScoreCircle";
import AgentActivity from "@/components/AgentActivity";
import ErrorBanner from "@/components/ErrorBanner";
import HistoryPanel from "@/components/HistoryPanel";
import PrivacyNote from "@/components/PrivacyNote";
import { downloadResumeAnalysisPdf } from "@/lib/export";
import {
  Upload, FileText, CheckCircle, XCircle, AlertCircle,
  Lightbulb, Tag, Loader2, Zap, MessageSquare, Copy, FileDown,
  ChevronDown, ChevronUp, AlignLeft,
} from "lucide-react";
import clsx from "clsx";

const STORAGE_KEY = "aijob_resume_text";

const AGENT_STEPS = [
  "Parsing resume document",
  "Extracting work experience & education",
  "Identifying technical skills",
  "Evaluating ATS compatibility",
  "Calculating scores",
  "Generating improvement recommendations",
];

const BULLETS_STEPS = [
  "Reviewing resume bullet points",
  "Identifying weak or vague phrasing",
  "Rewriting with action verbs and metrics",
  "Optimizing for ATS",
];

const QUESTIONS_STEPS = [
  "Analyzing resume background",
  "Identifying likely interview topics",
  "Generating behavioral & technical questions",
  "Preparing suggested answers",
];

interface InterviewQuestion {
  question: string;
  type: string;
  suggested_answer: string;
}

export default function ResumePage() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ filename: string; resumeText: string; analysis: ResumeAnalysis } | null>(null);

  // Improved bullets
  const [bullets, setBullets] = useState<string[] | null>(null);
  const [bulletsLoading, setBulletsLoading] = useState(false);
  const [bulletsDone, setBulletsDone] = useState(false);
  const [bulletsError, setBulletsError] = useState<string | null>(null);

  // Interview prep
  const [questions, setQuestions] = useState<InterviewQuestion[] | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsDone, setQuestionsDone] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<ResumeHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    api.getResumeHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  const loadFromHistory = (entry: ResumeHistoryEntry) => {
    setFile(null);
    setResult({ filename: entry.filename, resumeText: entry.resume_text, analysis: entry.analysis });
    setDone(true);
    setBullets(null);
    setBulletsDone(false);
    setQuestions(null);
    setQuestionsDone(false);
    localStorage.setItem(STORAGE_KEY, entry.resume_text);
  };

  const handleFile = (f: File) => {
    setFile(f);
    setError(null);
    setResult(null);
    setDone(false);
    setBullets(null);
    setBulletsDone(false);
    setQuestions(null);
    setQuestionsDone(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setDone(false);
    setError(null);
    try {
      const data = await api.analyzeResumeFile(file);
      setDone(true);
      setResult({ filename: data.filename, resumeText: data.resume_text, analysis: data.analysis });
      localStorage.setItem(STORAGE_KEY, data.resume_text);
      api.getResumeHistory().then(setHistory).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setDone(false);
    } finally {
      setLoading(false);
    }
  };

  const handleBullets = async () => {
    if (!result) return;
    setBulletsLoading(true);
    setBulletsDone(false);
    setBulletsError(null);
    try {
      const data = await api.generateResumeOnlyBullets(result.resumeText);
      setBulletsDone(true);
      setBullets(data.bullets);
    } catch (e) {
      setBulletsError(e instanceof Error ? e.message : "Failed to generate bullets.");
    } finally {
      setBulletsLoading(false);
    }
  };

  const handleQuestions = async () => {
    if (!result) return;
    setQuestionsLoading(true);
    setQuestionsDone(false);
    setQuestionsError(null);
    try {
      const data = await api.generateResumeOnlyInterviewQuestions(result.resumeText);
      setQuestionsDone(true);
      setQuestions(data.questions);
    } catch (e) {
      setQuestionsError(e instanceof Error ? e.message : "Failed to generate questions.");
    } finally {
      setQuestionsLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setFile(null);
    setDone(false);
    setBullets(null);
    setBulletsDone(false);
    setQuestions(null);
    setQuestionsDone(false);
  };

  const exportPdf = () => {
    if (!result) return;
    downloadResumeAnalysisPdf(result.analysis, result.filename);
  };

  const priorityClass = { high: "badge-high", medium: "badge-medium", low: "badge-low" };
  const typeColor: Record<string, string> = {
    behavioral: "bg-blue-100 text-blue-700",
    technical: "bg-purple-100 text-purple-700",
    situational: "bg-amber-100 text-amber-700",
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="page-kicker">AI Tool</p>
        <h1 className="page-title">Resume Analyzer</h1>
        <p className="page-subtitle">Upload your resume to get an ATS score, skill analysis, and improvement tips.</p>
      </div>

      <HistoryPanel
        title="Past Analyses"
        items={history}
        loading={historyLoading}
        getKey={(h) => h.id}
        renderItem={(h) => ({
          primary: h.filename || "Resume",
          secondary: `ATS Score: ${h.ats_score}%`,
          date: h.created_at,
        })}
        onSelect={loadFromHistory}
      />

      {/* Upload Zone */}
      {!result && (
        <div className="card p-4 sm:p-8 mb-5">
          <div
            className={clsx(
              "border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all duration-150 cursor-pointer",
              dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={36} className={clsx("mx-auto mb-3 transition-colors", dragging ? "text-indigo-500" : "text-slate-300")} />
            <p className="font-semibold text-slate-600 mb-1">Drop your resume here</p>
            <p className="text-sm text-slate-400">or click to browse · PDF, DOCX, TXT supported</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              aria-label="Upload resume file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {file && (
            <div className="mt-4 flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-indigo-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button type="button" onClick={analyze} disabled={loading} className="btn-primary flex items-center gap-2">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Analyzing…</> : "Analyze Resume"}
              </button>
            </div>
          )}

          {error && (
            <ErrorBanner
              message={error}
              onDismiss={() => setError(null)}
              onRetry={file ? analyze : undefined}
              className="mt-4"
            />
          )}

          <PrivacyNote className="mt-4">
            Your resume is processed only to generate this analysis and is never sold or shared. Read our
          </PrivacyNote>
        </div>
      )}

      {/* Agent Activity — visible during loading and after */}
      <AgentActivity
        steps={AGENT_STEPS}
        isRunning={loading}
        isDone={done}
        className="mb-5"
      />

      {/* Results */}
      {result && (
        <div className="space-y-5 animate-slide-up">
          {/* Score hero + breakdown */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-semibold text-slate-800">Analysis Results</h2>
                <p className="text-xs text-slate-400 mt-0.5">{result.filename}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={exportPdf}
                  className="flex items-center gap-1.5 btn-secondary text-sm">
                  <FileDown size={14} /> Export PDF
                </button>
                <button type="button" onClick={reset} className="btn-secondary text-sm">
                  Analyze Another
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <ScoreCircle score={result.analysis.ats_score} label="ATS Score" size={140} />
              <div className="flex-1 w-full space-y-3">
                {[
                  { label: "Formatting Score", score: result.analysis.formatting_score },
                  { label: "Content Score", score: result.analysis.content_score },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{row.label}</span>
                      <span className="text-xs text-slate-400">{row.score}/100</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
          </div>

          {/* Summary */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <FileText size={15} className="text-indigo-500" /> Summary
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">{result.analysis.overall_summary}</p>
          </div>

          {/* Strengths & Issues */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <CheckCircle size={15} className="text-green-500" /> Strengths
              </h3>
              <ul className="space-y-2">
                {result.analysis.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle size={13} className="text-green-400 mt-0.5 shrink-0" /> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <XCircle size={15} className="text-red-400" /> Issues Found
              </h3>
              <ul className="space-y-2">
                {result.analysis.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <XCircle size={13} className="text-red-400 mt-0.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Skills / Matching Keywords */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Tag size={15} className="text-indigo-500" /> Matching Keywords Found
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Technical</p>
                <div className="flex flex-wrap gap-2">
                  {result.analysis.skills_identified.technical.map((s, i) => (
                    <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">{s}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Soft Skills</p>
                <div className="flex flex-wrap gap-2">
                  {result.analysis.skills_identified.soft.map((s, i) => (
                    <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Missing Keywords */}
          {result.analysis.keywords_missing.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-500" /> Missing Keywords
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.analysis.keywords_missing.map((k, i) => (
                  <span key={i} className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-200">{k}</span>
                ))}
              </div>
            </div>
          )}

          {/* Formatting Suggestions */}
          {result.analysis.formatting_suggestions.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <AlignLeft size={15} className="text-indigo-500" /> Formatting Suggestions
              </h3>
              <ul className="space-y-2">
                {result.analysis.formatting_suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <AlignLeft size={13} className="text-indigo-400 mt-0.5 shrink-0" /> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Lightbulb size={15} className="text-amber-500" /> Recommendations
            </h3>
            <div className="space-y-3">
              {result.analysis.recommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={priorityClass[r.priority]}>{r.priority}</span>
                  <p className="text-sm text-slate-600 flex-1">{r.suggestion}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3">Take it further</h3>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              <button type="button"
                onClick={handleBullets}
                disabled={bulletsLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 w-full sm:w-auto"
              >
                {bulletsLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Generate Improved Bullets
              </button>
              <button type="button"
                onClick={handleQuestions}
                disabled={questionsLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 w-full sm:w-auto"
              >
                {questionsLoading ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                Generate Interview Prep
              </button>
            </div>
          </div>

          {/* Bullets agent activity */}
          <AgentActivity steps={BULLETS_STEPS} isRunning={bulletsLoading} isDone={bulletsDone} />

          {bulletsError && (
            <ErrorBanner message={bulletsError} onDismiss={() => setBulletsError(null)} onRetry={handleBullets} />
          )}

          {/* Improved Resume Bullets */}
          {bullets && (
            <div className="card p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                  <Zap size={15} className="text-purple-500" /> Improved Resume Bullets
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

          {questionsError && (
            <ErrorBanner message={questionsError} onDismiss={() => setQuestionsError(null)} onRetry={handleQuestions} />
          )}

          {/* Interview Questions */}
          {questions && (
            <div className="card p-5 animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                  <MessageSquare size={15} className="text-amber-500" /> Interview Preparation
                </h3>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(
                    questions.map((q, i) => `${i + 1}. [${q.type}] ${q.question}\n${q.suggested_answer}`).join("\n\n")
                  )}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
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
    </div>
  );
}
