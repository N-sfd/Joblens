"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2, ChevronDown, ChevronUp, FileUp, Loader2, Save, Target,
  AlertTriangle, Lightbulb, History, Trash2, MinusCircle, CircleDot,
} from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import type {
  CareerAnalysesListResponse,
  CareerAnalysisListItem,
  CareerIntelligenceResult,
  CareerRequirementMatch,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import ScoreCircle from "@/components/ScoreCircle";
import PrivacyNote from "@/components/PrivacyNote";

const RESUME_KEY = "joblens_ci_resume";
const JD_KEY = "joblens_ci_jd";

const CATEGORY_LABELS: { key: keyof CareerIntelligenceResult["category_scores"]; label: string; weight: string }[] = [
  { key: "required_skills", label: "Required Skills", weight: "35%" },
  { key: "relevant_experience", label: "Relevant Experience", weight: "25%" },
  { key: "preferred_skills", label: "Preferred Skills", weight: "15%" },
  { key: "education", label: "Education", weight: "10%" },
  { key: "domain_relevance", label: "Domain Relevance", weight: "10%" },
  { key: "resume_evidence", label: "Resume Evidence", weight: "5%" },
];

const STEPS = [
  "Structured résumé parsing",
  "Job requirement extraction",
  "Skills normalization",
  "Semantic matching",
  "Weighted scoring",
  "Evidence mapping",
  "Gap analysis & recommendations",
];

function ExpandCard({
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
    <div className="card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 text-left font-semibold text-slate-800"
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-slate-100 pt-4">{children}</div>}
    </div>
  );
}

function EvidenceList({
  items,
  tone,
}: {
  items: Array<Record<string, unknown>>;
  tone: "strong" | "weak" | "missing";
}) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">None in this category.</p>;
  }
  const icon =
    tone === "strong" ? (
      <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
    ) : tone === "weak" ? (
      <CircleDot size={14} className="text-amber-600 shrink-0 mt-0.5" />
    ) : (
      <MinusCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
    );
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={`${item.requirement}-${i}`} className="flex gap-2 text-sm">
          {icon}
          <div>
            <p className="font-medium text-slate-800">{String(item.requirement)}</p>
            {item.evidence ? (
              <p className="text-slate-600 mt-0.5 italic">&ldquo;{String(item.evidence)}&rdquo;</p>
            ) : null}
            {item.resume_section ? (
              <p className="text-xs text-slate-400 mt-0.5">Section: {String(item.resume_section)}</p>
            ) : null}
            {item.explanation ? (
              <p className="text-slate-500 mt-1">{String(item.explanation)}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RequirementRow({ m }: { m: CareerRequirementMatch }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-100 rounded-lg">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium text-slate-800">{m.requirement}</span>
        <span
          className={clsx(
            "text-xs font-semibold px-2 py-0.5 rounded-full shrink-0",
            m.match_level === "strong_match" && "bg-emerald-50 text-emerald-700",
            m.match_level === "partial_match" && "bg-amber-50 text-amber-700",
            m.match_level === "related_evidence" && "bg-sky-50 text-sky-700",
            m.match_level === "not_demonstrated" && "bg-orange-50 text-orange-700",
            m.match_level === "missing" && "bg-rose-50 text-rose-700",
          )}
        >
          {m.match_label}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-sm text-slate-600 space-y-1 border-t border-slate-50 pt-2">
          <p><span className="font-medium text-slate-700">Category:</span> {m.category}</p>
          <p><span className="font-medium text-slate-700">Confidence:</span> {m.confidence}</p>
          {m.evidence && <p><span className="font-medium text-slate-700">Evidence:</span> “{m.evidence}”</p>}
          {m.resume_section && <p><span className="font-medium text-slate-700">Section:</span> {m.resume_section}</p>}
          <p>{m.explanation}</p>
        </div>
      )}
    </div>
  );
}

export default function MatchPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [resumeText, setResumeText] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(RESUME_KEY) ?? "" : "",
  );
  const [jobDescription, setJobDescription] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(JD_KEY) ?? "" : "",
  );
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CareerIntelligenceResult | null>(null);
  const [history, setHistory] = useState<CareerAnalysesListResponse | null>(null);
  const [savingNote, setSavingNote] = useState<string | null>(null);

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
      /* history is optional */
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    const t = window.setInterval(() => {
      setStepIdx((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 700);
    return () => window.clearInterval(t);
  }, [loading]);

  const onFile = async (f: File | null) => {
    setFile(f);
    setFileName(f?.name ?? null);
    if (!f) return;
    if (f.name.toLowerCase().endsWith(".txt")) {
      setResumeText(await f.text());
    }
  };

  const analyze = async () => {
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
    setLoading(true);
    try {
      let data: CareerIntelligenceResult;
      if (file && !file.name.toLowerCase().endsWith(".txt")) {
        const form = new FormData();
        form.append("file", file);
        form.append("job_description", jobDescription);
        if (jobTitle) form.append("job_title", jobTitle);
        if (companyName) form.append("company_name", companyName);
        form.append("save", "true");
        data = await api.analyzeCareerIntelligenceFile(form);
      } else {
        data = await api.analyzeCareerIntelligence({
          resume_text: resumeText,
          job_description: jobDescription,
          job_title: jobTitle || undefined,
          company_name: companyName || undefined,
          resume_filename: fileName || undefined,
          save: true,
        });
      }
      setResult(data);
      if (data.duplicate) {
        setSavingNote("This exact résumé + job combination was already saved. Opened the existing analysis.");
      } else if (data.saved) {
        setSavingNote("Analysis saved to your history.");
      }
      await loadHistory();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Analysis failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const openHistoryItem = async (item: CareerAnalysisListItem) => {
    try {
      const detail = await api.getCareerAnalysis(item.id);
      setResult(detail.result);
      setJobTitle(detail.job_title || "");
      setCompanyName(detail.company_name || "");
      setSavingNote(`Loaded analysis #${item.id}`);
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

  const cats = result?.category_scores;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">JobLens</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">AI Career Intelligence</h1>
        <p className="text-slate-600 max-w-2xl">
          An evidence-based résumé and job matching system that explains candidate–job alignment using
          structured parsing, semantic matching, weighted scoring, and actionable recommendations.
        </p>
      </header>

      <PrivacyNote>
        Résumé and job text are processed for matching only. We do not log full résumé contents or AI prompts.
      </PrivacyNote>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {savingNote && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {savingNote}
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <FileUp size={16} /> Upload résumé
          </h2>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
            {fileName || "Choose PDF, DOCX, or TXT"}
          </button>
          <label className="label">Or paste résumé text</label>
          <textarea
            className="textarea min-h-[180px]"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your résumé text…"
          />
        </div>

        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Target size={16} /> Job description
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Job title (optional)</label>
              <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Company (optional)</label>
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
          </div>
          <label className="label">Paste job description</label>
          <textarea
            className="textarea min-h-[180px]"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job description…"
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary flex items-center gap-2" disabled={loading} onClick={analyze}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
          {loading ? "Analyzing…" : "Analyze match"}
        </button>
        {result && (
          <button type="button" className="btn-secondary flex items-center gap-2" disabled>
            <Save size={16} /> Saved with analysis
          </button>
        )}
      </div>

      {loading && (
        <div className="card p-5">
          <p className="text-sm font-medium text-slate-700 mb-3">Running evidence-based analysis…</p>
          <ul className="space-y-2">
            {STEPS.map((s, i) => (
              <li key={s} className={clsx("text-sm flex items-center gap-2", i <= stepIdx ? "text-indigo-700" : "text-slate-400")}>
                {i < stepIdx ? <CheckCircle2 size={14} /> : i === stepIdx ? <Loader2 size={14} className="animate-spin" /> : <span className="w-3.5" />}
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && !loading && (
        <section className="space-y-5">
          {result.warnings?.map((w) => (
            <div key={w} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              {w}
            </div>
          ))}

          <div className="card p-6 flex flex-col sm:flex-row items-center gap-6">
            <ScoreCircle score={result.overall_score} label="Overall" size={120} />
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <h2 className="text-xl font-bold text-slate-900">Overall Match {result.overall_score}%</h2>
              <p className="text-sm text-slate-600">
                Deterministic weighted score
                {result.job_title ? ` for ${result.job_title}` : ""}
                {result.company_name ? ` at ${result.company_name}` : ""}.
                AI may explain evidence but never overrides this number.
              </p>
              <p className="text-xs text-slate-400 font-mono">{result.formula}</p>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Category score breakdown</h3>
            <div className="space-y-3">
              {CATEGORY_LABELS.map(({ key, label, weight }) => {
                const value = cats?.[key] ?? 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700">{label} <span className="text-slate-400">({weight})</span></span>
                      <span className="font-semibold text-slate-900">{value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${value}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ExpandCard title="Strong evidence" defaultOpen>
              <EvidenceList items={result.evidence_map.strong_evidence} tone="strong" />
            </ExpandCard>
            <ExpandCard title="Weak or missing evidence" defaultOpen>
              <EvidenceList items={result.evidence_map.weak_or_missing_evidence} tone="weak" />
            </ExpandCard>
          </div>

          <ExpandCard title="Not demonstrated (may know, résumé does not prove)" defaultOpen>
            <EvidenceList items={result.evidence_map.not_demonstrated} tone="missing" />
          </ExpandCard>

          <ExpandCard title="Requirement-by-requirement analysis">
            <div className="space-y-2">
              {result.requirement_matches.map((m) => (
                <RequirementRow key={`${m.requirement}-${m.category}`} m={m} />
              ))}
            </div>
          </ExpandCard>

          <ExpandCard title="Skills gap analysis" defaultOpen>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-rose-700 mb-1">Missing skills</p>
                <ul className="list-disc pl-5 text-slate-700">
                  {(result.gap_analysis.missing_skills.length ? result.gap_analysis.missing_skills : ["None"]).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-orange-700 mb-1">Not demonstrated</p>
                <ul className="list-disc pl-5 text-slate-700">
                  {(result.gap_analysis.not_demonstrated_skills.length
                    ? result.gap_analysis.not_demonstrated_skills
                    : ["None"]
                  ).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {result.gap_analysis.resume_improvement_opportunities.map((op) => (
                <div key={op.title} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="font-medium text-slate-800 text-sm">{op.title}</p>
                  <p className="text-sm text-slate-600 mt-1">{op.detail}</p>
                  {op.why && <p className="text-xs text-slate-400 mt-1">Why: {op.why}</p>}
                </div>
              ))}
            </div>
          </ExpandCard>

          <ExpandCard title="Recommendations" defaultOpen>
            <ul className="space-y-3">
              {result.recommendations.map((r) => (
                <li key={r.title} className="flex gap-2 text-sm">
                  <Lightbulb size={14} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-800">{r.title}</p>
                    <p className="text-slate-600 mt-0.5">{r.detail}</p>
                    <p className="text-xs text-slate-400 mt-1">Why it matters: {r.why}</p>
                  </div>
                </li>
              ))}
            </ul>
          </ExpandCard>

          <ExpandCard title="ATS keywords to consider (only if truthful)">
            <div className="flex flex-wrap gap-2">
              {(result.ats_keywords || []).map((k) => (
                <span key={k} className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  {k}
                </span>
              ))}
            </div>
          </ExpandCard>
        </section>
      )}

      <section className="card p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <History size={16} /> Previous analyses
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
                    Score {item.overall_score ?? "—"}% · Required {item.required_skills_score ?? "—"}% · Preferred{" "}
                    {item.preferred_skills_score ?? "—"}%
                    {item.resume_filename ? ` · ${item.resume_filename}` : ""}
                    {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ""}
                  </p>
                  {item.missing_skills?.length ? (
                    <p className="text-xs text-rose-600 mt-0.5">Missing: {item.missing_skills.slice(0, 4).join(", ")}</p>
                  ) : null}
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
    </div>
  );
}
