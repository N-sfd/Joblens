"use client";

import { useState, useRef, DragEvent } from "react";
import { api } from "@/lib/api";
import { logActivity } from "@/lib/activityLog";
import type { ResumeAnalysis } from "@/types";
import ScoreCircle from "@/components/ScoreCircle";
import AgentActivity from "@/components/AgentActivity";
import {
  Upload, FileText, CheckCircle, XCircle, AlertCircle,
  Lightbulb, Tag, Loader2,
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

export default function ResumePage() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ filename: string; analysis: ResumeAnalysis } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setError(null);
    setResult(null);
    setDone(false);
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
      setResult({ filename: data.filename, analysis: data.analysis });
      localStorage.setItem(STORAGE_KEY, data.resume_text);
      logActivity({
        type: "resume_analyzed",
        summary: `Analyzed resume — ATS Score: ${data.analysis.ats_score}%`,
        detail: `${data.filename} · Formatting: ${data.analysis.formatting_score}% · Content: ${data.analysis.content_score}%`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setDone(false);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setFile(null);
    setDone(false);
  };

  const priorityClass = { high: "badge-high", medium: "badge-medium", low: "badge-low" };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Resume Analyzer</h1>
        <p className="text-slate-500 mt-1">Upload your resume to get an ATS score, skill analysis, and improvement tips.</p>
      </div>

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
              accept=".pdf,.docx,.doc,.txt"
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
            <div className="mt-4 flex items-center gap-2.5 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}
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
          {/* Scores */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-semibold text-slate-800">Analysis Results</h2>
                <p className="text-xs text-slate-400 mt-0.5">{result.filename}</p>
              </div>
              <button type="button" onClick={reset} className="btn-secondary text-sm">
                Analyze Another
              </button>
            </div>
            <div className="flex flex-wrap gap-8 justify-center sm:justify-start">
              <ScoreCircle score={result.analysis.ats_score} label="ATS Score" />
              <ScoreCircle score={result.analysis.formatting_score} label="Formatting" />
              <ScoreCircle score={result.analysis.content_score} label="Content" />
            </div>
          </div>

          {/* Summary */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <FileText size={15} className="text-indigo-500" /> Summary
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">{result.analysis.overall_summary}</p>
          </div>

          {/* Strengths & Weaknesses */}
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
                <XCircle size={15} className="text-red-400" /> Areas to Improve
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

          {/* Skills */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Tag size={15} className="text-indigo-500" /> Skills Identified
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

          {/* Missing Keywords */}
          {result.analysis.keywords_missing.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <AlertCircle size={15} className="text-amber-500" /> Keywords to Add
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.analysis.keywords_missing.map((k, i) => (
                  <span key={i} className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-200">{k}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
