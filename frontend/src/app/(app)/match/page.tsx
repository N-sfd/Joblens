"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Replace,
  Save,
  Target,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import type {
  CareerAnalysesListResponse,
  CareerAnalysisListItem,
  CareerIntelligenceResult,
  CareerRequirementMatch,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import PrivacyNote from "@/components/PrivacyNote";

const RESUME_KEY = "joblens_ci_resume";
const JD_KEY = "joblens_ci_jd";

const CATEGORIES: {
  key: keyof CareerIntelligenceResult["category_scores"];
  label: string;
  weight: string;
}[] = [
  { key: "required_skills", label: "Required Skills", weight: "35%" },
  { key: "relevant_experience", label: "Relevant Experience", weight: "25%" },
  { key: "preferred_skills", label: "Preferred Skills", weight: "15%" },
  { key: "education", label: "Education", weight: "10%" },
  { key: "domain_relevance", label: "Domain Relevance", weight: "10%" },
  { key: "resume_evidence", label: "Resume Evidence", weight: "5%" },
];

const ANALYSIS_STAGES = [
  "Parsing résumé",
  "Extracting job requirements",
  "Normalizing skills",
  "Matching experience",
  "Mapping evidence",
  "Calculating weighted scores",
  "Identifying gaps",
  "Preparing recommendations",
];

type EvidenceItem = Record<string, unknown>;

function alignmentLabel(score: number): string {
  if (score >= 80) return "Strong alignment";
  if (score >= 65) return "Moderate alignment";
  if (score >= 45) return "Partial alignment";
  return "Limited alignment";
}

function fileTypeLabel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".docx")) return "DOCX";
  if (lower.endsWith(".txt")) return "TXT";
  return "File";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Expand({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left text-sm font-semibold text-slate-800"
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        {open ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
      </button>
      {open && <div className="px-4 sm:px-5 pb-4 border-t border-slate-100 pt-3">{children}</div>}
    </div>
  );
}

function matchBadgeClass(level: string): string {
  switch (level) {
    case "strong_match":
      return "bg-emerald-50 text-emerald-700";
    case "partial_match":
      return "bg-amber-50 text-amber-700";
    case "related_evidence":
      return "bg-sky-50 text-sky-700";
    case "not_demonstrated":
      return "bg-orange-50 text-orange-700";
    case "missing":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function recommendationImpact(type: string): "High impact" | "Medium impact" | "Optional" {
  if (type === "emphasize" || type === "bullets") return "High impact";
  if (type === "learning") return "Medium impact";
  return "Optional";
}

function EvidenceBlock({ item }: { item: EvidenceItem }) {
  const requirement = String(item.requirement ?? "");
  const evidence = item.evidence ? String(item.evidence) : null;
  const section = item.resume_section ? String(item.resume_section) : null;
  const explanation = item.explanation ? String(item.explanation) : null;
  return (
    <li className="flex gap-2.5 text-sm">
      <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="font-semibold text-slate-800">{requirement}</p>
        {evidence ? (
          <p className="text-slate-600 mt-0.5 leading-relaxed">&ldquo;{evidence}&rdquo;</p>
        ) : explanation ? (
          <p className="text-slate-600 mt-0.5 leading-relaxed">{explanation}</p>
        ) : null}
        {section ? (
          <p className="text-xs text-slate-400 mt-1">
            Evidence source · {section}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function RequirementCard({ m }: { m: CareerRequirementMatch }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-3 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-800 text-sm">{m.requirement}</p>
        <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-full", matchBadgeClass(m.match_level))}>
          {m.match_label}
        </span>
      </div>
      {m.evidence ? (
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-700">Evidence:</span> &ldquo;{m.evidence}&rdquo;
        </p>
      ) : null}
      {m.resume_section ? (
        <p className="text-xs text-slate-400">Evidence source · {m.resume_section}</p>
      ) : null}
      <p className="text-sm text-slate-600 leading-relaxed">{m.explanation}</p>
    </div>
  );
}

function extractRelatedHints(explanation: string | undefined): string[] {
  if (!explanation) return [];
  const paren = explanation.match(/\(([^)]+)\)/);
  if (!paren?.[1]) return [];
  return paren[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 40);
}

function GapCard({
  title,
  tone,
  items,
  matches,
}: {
  title: string;
  tone: "missing" | "not_demonstrated" | "weak" | "related";
  items: string[];
  matches: CareerRequirementMatch[];
}) {
  const toneClass =
    tone === "missing"
      ? "border-rose-100 bg-rose-50/40"
      : tone === "not_demonstrated"
        ? "border-orange-100 bg-orange-50/40"
        : tone === "weak"
          ? "border-amber-100 bg-amber-50/40"
          : "border-sky-100 bg-sky-50/40";

  if (!items.length) {
    return (
      <div className={clsx("rounded-xl border p-4", toneClass)}>
        <h4 className="font-semibold text-slate-800 text-sm mb-1">{title}</h4>
        <p className="text-sm text-slate-500">None in this category.</p>
      </div>
    );
  }

  return (
    <div className={clsx("rounded-xl border p-4 space-y-3", toneClass)}>
      <h4 className="font-semibold text-slate-800 text-sm">{title}</h4>
      <ul className="space-y-3">
        {items.map((skill) => {
          const match = matches.find((m) => m.requirement === skill);
          const relatedTools = extractRelatedHints(match?.explanation);
          return (
            <li key={skill} className="text-sm">
              <p className="font-medium text-slate-800">{skill}</p>
              {match?.explanation ? (
                <p className="text-slate-600 mt-1 leading-relaxed">{match.explanation}</p>
              ) : null}
              {match?.evidence ? (
                <p className="text-slate-600 mt-1 italic">&ldquo;{match.evidence}&rdquo;</p>
              ) : null}
              {match?.resume_section ? (
                <p className="text-xs text-slate-400 mt-1">Evidence source · {match.resume_section}</p>
              ) : null}
              {relatedTools.length > 0 && (tone === "not_demonstrated" || tone === "related") ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-slate-600 mb-1">Related résumé evidence:</p>
                  <ul className="list-disc pl-4 text-xs text-slate-600 space-y-0.5">
                    {relatedTools.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {tone === "not_demonstrated" || tone === "related" ? (
                <p className="text-xs text-slate-500 mt-1.5">
                  Recommendation: Only add {skill} if you actually have experience with it.
                </p>
              ) : null}
              {tone === "missing" ? (
                <p className="text-xs text-slate-500 mt-1.5">
                  No relevant evidence exists. Only pursue this if it matches your real career direction.
                </p>
              ) : null}
              {tone === "weak" ? (
                <p className="text-xs text-slate-500 mt-1.5">
                  Only add this skill if you have real experience with it — strengthen existing bullets instead of inventing new ones.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MatchPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { user, isLoading: authLoading } = useAuth();
  const isAuthenticated = Boolean(user);

  const [resumeText, setResumeText] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(RESUME_KEY) ?? "" : "",
  );
  const [jobDescription, setJobDescription] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(JD_KEY) ?? "" : "",
  );
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [showPasteResume, setShowPasteResume] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CareerIntelligenceResult | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<Date | null>(null);
  const [history, setHistory] = useState<CareerAnalysesListResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<"idle" | "new_job" | "new_resume">("idle");
  const [baseline, setBaseline] = useState<CareerIntelligenceResult | null>(null);

  useEffect(() => {
    localStorage.setItem(RESUME_KEY, resumeText);
  }, [resumeText]);
  useEffect(() => {
    localStorage.setItem(JD_KEY, jobDescription);
  }, [jobDescription]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.getCareerAnalyses());
    } catch {
      /* history optional */
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!loading) return;
    setStageIdx(0);
    const t = window.setInterval(() => {
      setStageIdx((i) => (i + 1) % ANALYSIS_STAGES.length);
    }, 1100);
    return () => window.clearInterval(t);
  }, [loading]);

  const clearFile = () => {
    setFile(null);
    setFileName(null);
    setFileSize(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (f: File | null) => {
    if (!f) {
      clearFile();
      return;
    }
    setFile(f);
    setFileName(f.name);
    setFileSize(f.size);
    if (f.name.toLowerCase().endsWith(".txt")) {
      setResumeText(await f.text());
    }
  };

  const runAnalyze = async (opts?: { save?: boolean; forceNew?: boolean }) => {
    setError(null);
    setSavingNote(null);
    if (jobDescription.trim().length < 50) {
      setError("Paste a longer job description (at least ~50 characters).");
      return;
    }
    if (!file && resumeText.trim().length < 50) {
      setError("Upload a résumé or paste résumé text first.");
      return;
    }

    const shouldSave = Boolean(opts?.save);
    setLoading(true);
    try {
      let data: CareerIntelligenceResult;
      if (file && !file.name.toLowerCase().endsWith(".txt")) {
        const form = new FormData();
        form.append("file", file);
        form.append("job_description", jobDescription);
        if (jobTitle) form.append("job_title", jobTitle);
        if (companyName) form.append("company_name", companyName);
        form.append("save", shouldSave ? "true" : "false");
        if (opts?.forceNew) form.append("force_new_version", "true");
        data = await api.analyzeCareerIntelligenceFile(form);
      } else {
        data = await api.analyzeCareerIntelligence({
          resume_text: resumeText,
          job_description: jobDescription,
          job_title: jobTitle || undefined,
          company_name: companyName || undefined,
          resume_filename: fileName || undefined,
          save: shouldSave,
          force_new_version: opts?.forceNew,
        });
      }

      if (compareMode !== "idle" && result) {
        setBaseline(result);
      }
      setResult(data);
      setAnalyzedAt(new Date());
      setCompareMode("idle");

      if (shouldSave) {
        if (data.duplicate) {
          setSavingNote("This exact résumé + job combination was already saved. Opened the existing analysis.");
        } else if (data.saved || data.analysis_id) {
          setSavingNote("Analysis saved.");
        }
        await loadHistory();
      }
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 429
            ? "You have reached the analysis limit. Please wait and try again."
            : e.message
          : e instanceof Error
            ? e.message
            : "Analysis failed. Check your connection and try again.";
      setError(msg);
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  const saveAnalysis = async () => {
    if (!isAuthenticated) return;
    setSaving(true);
    await runAnalyze({ save: true });
  };

  const openHistoryItem = async (item: CareerAnalysisListItem) => {
    try {
      const detail = await api.getCareerAnalysis(item.id);
      setResult(detail.result);
      setJobTitle(detail.job_title || "");
      setCompanyName(detail.company_name || "");
      setAnalyzedAt(detail.created_at ? new Date(detail.created_at) : new Date());
      setSavingNote(`Loaded analysis #${item.id}`);
      setBaseline(null);
      setCompareMode("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analysis.");
    }
  };

  const removeHistoryItem = async (id: number) => {
    try {
      await api.deleteCareerAnalysis(id);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete analysis.");
    }
  };

  const startCompare = (mode: "new_job" | "new_resume") => {
    if (!result) return;
    setBaseline(result);
    setCompareMode(mode);
    setResult(null);
    if (mode === "new_job") {
      setJobDescription("");
      setJobTitle("");
      setCompanyName("");
    } else {
      clearFile();
      setResumeText("");
      setShowPasteResume(true);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cats = result?.category_scores;
  const strongEvidence = result?.evidence_map.strong_evidence ?? [];
  const allEvidence = useMemo(() => {
    if (!result) return [] as EvidenceItem[];
    return [
      ...result.evidence_map.strong_evidence,
      ...result.evidence_map.partial_evidence,
      ...result.evidence_map.related_evidence,
    ];
  }, [result]);

  const terms = useMemo(() => {
    if (!result) {
      return { supported: [] as string[], possible: [] as string[], doNotAdd: [] as string[] };
    }
    const supported: string[] = [];
    const possible: string[] = [];
    const doNotAdd: string[] = [];
    for (const m of result.requirement_matches) {
      if (m.match_level === "strong_match" || m.match_level === "partial_match") {
        supported.push(m.requirement);
      } else if (m.match_level === "related_evidence" || m.match_level === "not_demonstrated") {
        possible.push(m.requirement);
      } else if (m.match_level === "missing") {
        doNotAdd.push(m.requirement);
      }
    }
    return { supported, possible, doNotAdd };
  }, [result]);

  const nextActions = useMemo(() => {
    if (!result) return [] as string[];
    const actions: string[] = [];
    const high = result.recommendations.filter((r) => recommendationImpact(r.type) === "High impact");
    for (const r of high.slice(0, 2)) actions.push(r.title.replace(/\.$/, ""));
    const gaps = result.gap_analysis;
    if (gaps.related_evidence[0]) {
      actions.push(`Clarify cloud or adjacent experience without claiming ${gaps.related_evidence[0]} unless true`);
    } else if (gaps.not_demonstrated_skills[0]) {
      actions.push(`Only add ${gaps.not_demonstrated_skills[0]} if you have real experience`);
    } else if (gaps.weak_evidence[0]) {
      actions.push(`Add project context for ${gaps.weak_evidence[0]}`);
    }
    while (actions.length < 3 && result.recommendations[actions.length]) {
      actions.push(result.recommendations[actions.length].title.replace(/\.$/, ""));
    }
    return actions.slice(0, 3);
  }, [result]);

  const groupedRecs = useMemo(() => {
    type Rec = CareerIntelligenceResult["recommendations"][number];
    const groups: Record<"High impact" | "Medium impact" | "Optional", Rec[]> = {
      "High impact": [],
      "Medium impact": [],
      Optional: [],
    };
    if (!result) return groups;
    for (const r of result.recommendations) {
      groups[recommendationImpact(r.type)].push(r);
    }
    return groups;
  }, [result]);

  const showStickyAnalyze = !result && !loading;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 pb-28 sm:pb-8">
      <header className="space-y-4">
        <div className="relative h-28 sm:h-36 overflow-hidden rounded-2xl border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/joblens-hero-career.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/70 via-slate-900/45 to-indigo-900/30" />
          <div className="relative h-full flex flex-col justify-end p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200 mb-1">
              Evidence-based decision support
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              JobLens — AI Career Intelligence
            </h1>
          </div>
        </div>
        <p className="text-slate-600 max-w-2xl text-sm sm:text-base leading-relaxed">
          Understand how your résumé aligns with a job — with transparent scoring, evidence, and actionable gaps.
        </p>
      </header>

      <PrivacyNote>
        Your résumé is processed only to generate this analysis and is never sold or shared.
      </PrivacyNote>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {savingNote && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {savingNote}
        </div>
      )}
      {compareMode !== "idle" && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Compare mode: {compareMode === "new_job" ? "same résumé vs a new job" : "another résumé vs the same job"}.
          Update the input below, then run Analyze Alignment to see category differences.
        </div>
      )}

      {/* Input: Resume + Job */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
            <FileText size={16} className="text-indigo-600" /> Upload Resume
          </h2>

          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />

          {!fileName ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors px-4 py-10 text-center"
            >
              <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <FileText size={18} />
              </div>
              <p className="font-semibold text-slate-800 text-sm">Drop your resume here</p>
              <p className="text-xs text-slate-500 mt-1">or click to browse · PDF, DOCX, TXT supported</p>
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <FileText size={16} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate">{fileName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fileTypeLabel(fileName)}
                    {fileSize != null ? ` · ${formatBytes(fileSize)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1"
                  onClick={() => fileRef.current?.click()}
                >
                  <Replace size={12} /> Replace Resume
                </button>
                <button
                  type="button"
                  className="text-slate-400 hover:text-rose-600 p-1.5"
                  aria-label="Remove resume"
                  onClick={clearFile}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            onClick={() => setShowPasteResume((v) => !v)}
          >
            {showPasteResume ? "Hide pasted résumé text" : "Or paste résumé text"}
          </button>
          {showPasteResume && (
            <textarea
              className="textarea min-h-[140px]"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your résumé text…"
            />
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
            <Target size={16} className="text-indigo-600" /> Paste Job Description
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Job title (optional)</label>
              <input
                className="input"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Backend Engineer"
              />
            </div>
            <div>
              <label className="label">Company (optional)</label>
              <input
                className="input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corp"
              />
            </div>
          </div>
          <label className="label">Job description</label>
          <textarea
            className="textarea min-h-[180px]"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job description…"
          />
        </div>
      </section>

      <div className={clsx("hidden sm:flex justify-center", showStickyAnalyze && "sm:flex")}>
        <button
          type="button"
          className="btn-primary flex items-center gap-2 px-8 py-3 text-base"
          disabled={loading}
          onClick={() => void runAnalyze({ save: false })}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
          {loading ? "Analyzing…" : "Analyze Alignment"}
        </button>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-800">Running evidence-based analysis…</p>
            <span className="text-xs text-slate-400">Progress is approximate</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-indigo-500 animate-pulse" style={{ width: `${((stageIdx + 1) / ANALYSIS_STAGES.length) * 100}%` }} />
          </div>
          <ul className="space-y-2">
            {ANALYSIS_STAGES.map((s, i) => (
              <li
                key={s}
                className={clsx(
                  "text-sm flex items-center gap-2 transition-colors",
                  i === stageIdx ? "text-indigo-700 font-medium" : "text-slate-400",
                )}
              >
                {i === stageIdx ? (
                  <Loader2 size={14} className="animate-spin shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-slate-200 shrink-0" />
                )}
                {s}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400">
            Stage highlights are indeterminate while the analysis runs — they do not claim each step has finished.
          </p>
        </div>
      )}

      {result && !loading && (
        <section className="space-y-5">
          {(result.warnings ?? []).map((w) => (
            <div
              key={w}
              className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2"
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              {w.includes("unavailable")
                ? "Advanced AI explanation is temporarily unavailable. Showing deterministic matching results."
                : w}
            </div>
          ))}

          {/* Result header */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-1">Your Alignment</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl sm:text-5xl font-bold text-slate-900 tabular-nums">
                    {result.overall_score}%
                  </span>
                  <span className="text-base sm:text-lg font-semibold text-slate-700">
                    {alignmentLabel(result.overall_score)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!authLoading && isAuthenticated ? (
                  <button
                    type="button"
                    className="btn-secondary text-sm flex items-center gap-1.5"
                    disabled={saving || Boolean(result.saved || result.analysis_id)}
                    onClick={() => void saveAnalysis()}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {result.saved || result.analysis_id ? "Saved" : "Save Analysis"}
                  </button>
                ) : (
                  <Link href="/sign-in" className="btn-secondary text-sm">
                    Sign in to save this analysis
                  </Link>
                )}
                {(result.saved || result.analysis_id) && (
                  <>
                    <button
                      type="button"
                      className="btn-secondary text-sm flex items-center gap-1.5"
                      onClick={() => startCompare("new_job")}
                    >
                      <RefreshCw size={14} /> Compare · new job
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-sm flex items-center gap-1.5"
                      onClick={() => startCompare("new_resume")}
                    >
                      <RefreshCw size={14} /> Compare · new résumé
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">
              This score reflects evidence in your résumé against this job description. It is not a hiring prediction.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {result.job_title ? <span>Job: <span className="text-slate-700 font-medium">{result.job_title}</span></span> : null}
              {result.company_name ? <span>Company: <span className="text-slate-700 font-medium">{result.company_name}</span></span> : null}
              {result.resume_filename || fileName ? (
                <span>Resume: <span className="text-slate-700 font-medium">{result.resume_filename || fileName}</span></span>
              ) : null}
              {analyzedAt ? (
                <span>Analyzed: <span className="text-slate-700 font-medium">{analyzedAt.toLocaleString()}</span></span>
              ) : null}
            </div>
          </div>

          {/* Compare deltas */}
          {baseline && cats && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 sm:p-5 space-y-3">
              <h3 className="font-semibold text-slate-900 text-sm">Comparison vs previous analysis</h3>
              <p className="text-sm text-slate-600">
                Overall: {baseline.overall_score}% → {result.overall_score}%{" "}
                <span className="font-semibold text-slate-800">
                  ({result.overall_score - baseline.overall_score >= 0 ? "+" : ""}
                  {result.overall_score - baseline.overall_score})
                </span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {CATEGORIES.map(({ key, label }) => {
                  const prev = baseline.category_scores[key];
                  const curr = cats[key];
                  const delta = curr - prev;
                  return (
                    <div key={key} className="flex justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 border border-indigo-50">
                      <span className="text-slate-600">{label}</span>
                      <span className="font-medium text-slate-800 tabular-nums">
                        {prev}% → {curr}%{" "}
                        <span className={delta >= 0 ? "text-emerald-600" : "text-rose-600"}>
                          ({delta >= 0 ? "+" : ""}{delta})
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Category breakdown</h3>
            <div className="space-y-3">
              {CATEGORIES.map(({ key, label }) => {
                const value = cats?.[key] ?? 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700">{label}</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <Expand title="How this score is calculated">
              <ul className="text-sm text-slate-600 space-y-1.5">
                {CATEGORIES.map(({ label, weight }) => (
                  <li key={label} className="flex justify-between gap-4">
                    <span>{label}</span>
                    <span className="font-medium text-slate-800">{weight}</span>
                  </li>
                ))}
              </ul>
              {result.formula ? (
                <p className="text-xs text-slate-400 font-mono mt-3 break-all">{result.formula}</p>
              ) : null}
              <p className="text-xs text-slate-500 mt-2">
                The deterministic weighted score is the source of truth. AI may explain evidence but never overrides this number.
              </p>
            </Expand>
          </div>

          {/* Strong evidence */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">Strong Evidence</h3>
            {!strongEvidence.length ? (
              <p className="text-sm text-slate-500">No strong matches found for this job yet.</p>
            ) : (
              <ul className="space-y-3">
                {strongEvidence.slice(0, 6).map((item, i) => (
                  <EvidenceBlock key={`${item.requirement}-${i}`} item={item} />
                ))}
              </ul>
            )}
            {allEvidence.length > 6 && (
              <Expand title="View all evidence">
                <ul className="space-y-3">
                  {allEvidence.map((item, i) => (
                    <EvidenceBlock key={`all-${item.requirement}-${i}`} item={item} />
                  ))}
                </ul>
              </Expand>
            )}
          </div>

          {/* Job requirements */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">Job Requirements</h3>
            <p className="text-sm text-slate-500">
              Strong Match, Partial Match, Related Evidence, Not Demonstrated, and Missing are distinct states.
            </p>
            <div className="space-y-2.5">
              {result.requirement_matches.map((m) => (
                <RequirementCard key={`${m.requirement}-${m.category}-${m.match_level}`} m={m} />
              ))}
            </div>
          </div>

          {/* Gap categories */}
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900 px-0.5">Gaps</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <GapCard
                title="Missing"
                tone="missing"
                items={result.gap_analysis.missing_skills}
                matches={result.requirement_matches}
              />
              <GapCard
                title="Not Demonstrated"
                tone="not_demonstrated"
                items={result.gap_analysis.not_demonstrated_skills}
                matches={result.requirement_matches}
              />
              <GapCard
                title="Weak Evidence"
                tone="weak"
                items={result.gap_analysis.weak_evidence}
                matches={result.requirement_matches}
              />
              <GapCard
                title="Related Evidence"
                tone="related"
                items={result.gap_analysis.related_evidence}
                matches={result.requirement_matches}
              />
            </div>
          </div>

          {/* Resume recommendations */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Improve Your Resume for This Role</h3>
            <p className="text-sm text-slate-500">
              Suggestions are grounded in existing résumé evidence. JobLens never invents experience.
            </p>
            {(["High impact", "Medium impact", "Optional"] as const).map((tier) => {
              const items = groupedRecs[tier];
              if (!items.length) return null;
              return (
                <div key={tier} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{tier}</h4>
                  {items.map((r) => (
                    <div key={r.title} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3.5 py-3">
                      <p className="font-medium text-slate-800 text-sm">{r.title}</p>
                      <p className="text-sm text-slate-600 mt-1">
                        <span className="font-medium text-slate-700">Why:</span> {r.why || r.detail}
                      </p>
                      {r.detail && r.why ? (
                        <p className="text-sm text-slate-600 mt-1">
                          <span className="font-medium text-slate-700">Suggested improvement:</span> {r.detail}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              );
            })}
            {(result.gap_analysis.resume_improvement_opportunities || []).slice(0, 4).map((op) => (
              <div key={op.title} className="rounded-lg border border-slate-100 px-3.5 py-3">
                <p className="font-medium text-slate-800 text-sm">{op.title}</p>
                <p className="text-sm text-slate-600 mt-1">{op.detail}</p>
                {op.why ? <p className="text-xs text-slate-400 mt-1">Why: {op.why}</p> : null}
              </div>
            ))}
          </div>

          {/* Terms worth reviewing */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h3 className="font-semibold text-slate-900">Terms Worth Reviewing</h3>
            <p className="text-sm text-slate-500">
              These are terms from the job — not a list to paste into your résumé. Only use words you can support with real experience.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                <p className="font-semibold text-emerald-800 text-xs uppercase tracking-wide mb-2">
                  Already supported by your experience
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(terms.supported.length ? terms.supported : ["None"]).map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-md bg-white text-emerald-800 text-xs font-medium border border-emerald-100">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                <p className="font-semibold text-amber-800 text-xs uppercase tracking-wide mb-2">
                  Possibly relevant but not demonstrated
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(terms.possible.length ? terms.possible : ["None"]).map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-md bg-white text-amber-800 text-xs font-medium border border-amber-100">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                <p className="font-semibold text-rose-800 text-xs uppercase tracking-wide mb-2">
                  Do not add unless true
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(terms.doNotAdd.length ? terms.doNotAdd : ["None"]).map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-md bg-white text-rose-800 text-xs font-medium border border-rose-100">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Next 3 actions */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">Your Next 3 Actions</h3>
            <ol className="space-y-2 list-decimal list-inside text-sm text-slate-700">
              {(nextActions.length ? nextActions : ["Re-run analysis after updating your résumé evidence."]).map((a) => (
                <li key={a} className="leading-relaxed pl-1">{a}.</li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* History */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
          <History size={16} /> Past Analyses
        </h2>
        {history?.repeated_gaps?.length ? (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 space-y-1">
            {history.repeated_gaps.map((g) => (
              <p key={g.skill}>{g.message}</p>
            ))}
          </div>
        ) : null}
        {!history?.items?.length ? (
          <p className="text-sm text-slate-500">No saved analyses yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {history.items.map((item) => (
              <li key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                <button type="button" className="text-left" onClick={() => void openHistoryItem(item)}>
                  <p className="font-medium text-slate-800 text-sm">
                    {item.job_title || "Untitled role"}
                    {item.company_name ? ` · ${item.company_name}` : ""}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {item.overall_score ?? "—"}% · Required {item.required_skills_score ?? "—"}% · Preferred{" "}
                    {item.preferred_skills_score ?? "—"}%
                    {item.resume_filename ? ` · ${item.resume_filename}` : ""}
                    {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ""}
                  </p>
                </button>
                <button
                  type="button"
                  className="text-slate-400 hover:text-rose-600 self-start"
                  title="Delete"
                  onClick={() => void removeHistoryItem(item.id)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mobile sticky analyze */}
      {showStickyAnalyze && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
            disabled={loading}
            onClick={() => void runAnalyze({ save: false })}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
            Analyze Alignment
          </button>
        </div>
      )}
    </div>
  );
}
