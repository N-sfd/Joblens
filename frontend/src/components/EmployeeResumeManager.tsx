"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, Loader2, FileText, Trash2, CheckCircle2, Star, Download,
  RefreshCw, AlertTriangle, ChevronDown, X,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Employee, EmployeeResume, ResumeUploadResult, ResumeFieldSuggestion } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".docx", ".txt"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TagList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return <span className="text-sm text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
          {item}
        </span>
      ))}
    </div>
  );
}

interface Props {
  employeeId: number;
  onEmployeeUpdated?: (employee: Employee) => void;
}

export default function EmployeeResumeManager({ employeeId, onEmployeeUpdated }: Props) {
  const { isAdmin } = useAtsRole();
  const [resumes, setResumes] = useState<EmployeeResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<ResumeUploadResult | null>(null);
  const [suggestions, setSuggestions] = useState<ResumeFieldSuggestion[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busyResumeId, setBusyResumeId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setResumes(await api.getEmployeeResumes(employeeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load resumes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [employeeId]);

  const pickFile = (f: File | null) => {
    setError(null);
    setSuccess(null);
    if (!f) { setFile(null); return; }
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setError("Unsupported file type. Choose a PDF, DOCX, or TXT file.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File is too large. Maximum size is 10 MB.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const reset = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.uploadEmployeeResume(employeeId, file);
      setResult(res);
      setSuggestions(res.suggestions);
      reset();
      if (res.parsing_status === "failed") {
        setSuccess("Resume uploaded, but parsing failed. Use Retry Parsing below.");
      } else {
        const n = Object.keys(res.applied_fields).length;
        setSuccess(
          n > 0
            ? `Resume uploaded and parsed. ${n} empty field${n === 1 ? "" : "s"} filled automatically.`
            : "Resume uploaded and parsed successfully."
        );
      }
      await load();
      onEmployeeUpdated?.(res.employee);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload resume.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (resumeId: number) => {
    setBusyResumeId(resumeId);
    try {
      await api.deleteEmployeeResume(employeeId, resumeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete resume.");
    } finally {
      setBusyResumeId(null);
    }
  };

  const handleSetPrimary = async (resumeId: number) => {
    setBusyResumeId(resumeId);
    try {
      await api.setPrimaryEmployeeResume(employeeId, resumeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set primary resume.");
    } finally {
      setBusyResumeId(null);
    }
  };

  const handleDownload = async (r: EmployeeResume) => {
    setBusyResumeId(r.id);
    try {
      await api.downloadEmployeeResume(employeeId, r.id, r.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download resume.");
    } finally {
      setBusyResumeId(null);
    }
  };

  const handleReparse = async (resumeId: number) => {
    setBusyResumeId(resumeId);
    setError(null);
    try {
      const res = await api.reparseEmployeeResume(employeeId, resumeId);
      setResult(res);
      setSuggestions(res.suggestions);
      setSuccess(res.parsing_status === "failed" ? "Parsing failed again. Please try later." : "Resume reparsed successfully.");
      await load();
      onEmployeeUpdated?.(res.employee);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reparse resume.");
    } finally {
      setBusyResumeId(null);
    }
  };

  const applySuggestion = async (s: ResumeFieldSuggestion) => {
    if (!result) return;
    try {
      const updated = await api.applyResumeSuggestions(employeeId, result.resume.id, { [s.field]: s.resume_value });
      setSuggestions((prev) => prev.filter((x) => x.field !== s.field));
      onEmployeeUpdated?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply suggestion.");
    }
  };

  const applyAllSuggestions = async () => {
    if (!result || suggestions.length === 0) return;
    const fields: Record<string, string> = {};
    suggestions.forEach((s) => { fields[s.field] = s.resume_value; });
    try {
      const updated = await api.applyResumeSuggestions(employeeId, result.resume.id, fields);
      setSuggestions([]);
      onEmployeeUpdated?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply suggestions.");
    }
  };

  const dismissSuggestion = (field: string) =>
    setSuggestions((prev) => prev.filter((x) => x.field !== field));

  const primary = resumes.find((r) => r.is_primary) ?? resumes[0] ?? null;
  const appliedEntries = result ? Object.entries(result.applied_fields) : [];

  return (
    <div className="space-y-5">
      {/* Resume Upload */}
      <div id="resume-upload" className="card p-6 scroll-mt-6">
        <h2 className="font-bold text-slate-800 mb-1">Resume Upload</h2>
        <p className="text-sm text-slate-500 mb-4">
          Upload a resume (PDF, DOCX, or TXT, up to 10 MB). We&apos;ll extract skills, experience, and a staffing summary,
          then auto-fill empty profile fields.
        </p>

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}
        {success && (
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-2.5 mb-4">
            <CheckCircle2 size={15} /> {success}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            aria-label="Resume file"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            disabled={uploading}
            className="text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm file:font-medium hover:file:bg-slate-200"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading and analyzing resume…</> : <><Upload size={14} /> Upload Resume</>}
            </button>
            {file && !uploading && (
              <button type="button" onClick={reset} className="btn-secondary flex items-center gap-1.5">
                <X size={14} /> Cancel
              </button>
            )}
          </div>
        </div>
        {file && <p className="text-xs text-slate-500 mt-2">Selected: <span className="font-medium text-slate-700">{file.name}</span> ({formatFileSize(file.size)})</p>}
        <p className="text-xs text-slate-400 mt-2">Allowed file types: PDF, DOCX, TXT · Max 10 MB</p>
      </div>

      {/* Resume Suggestions (after an upload/reparse) */}
      {result && (appliedEntries.length > 0 || suggestions.length > 0) && (
        <div className="card p-6 border-indigo-100">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-bold text-slate-800">Resume Suggestions</h2>
              <p className="text-sm text-slate-500">Review what was auto-filled and resolve any conflicts.</p>
            </div>
            <button type="button" onClick={() => setResult(null)} className="text-slate-400 hover:text-slate-600" title="Dismiss">
              <X size={16} />
            </button>
          </div>

          {appliedEntries.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">Fields Filled Automatically</p>
              <div className="flex flex-wrap gap-1.5">
                {appliedEntries.map(([field, value]) => (
                  <span key={field} className="text-xs font-medium px-2 py-1 rounded-lg bg-green-50 text-green-700 border border-green-100">
                    {field.replace(/_/g, " ")}: <span className="font-semibold">{String(value).slice(0, 40)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {suggestions.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Conflicting Values Requiring Review</p>
                <button type="button" onClick={applyAllSuggestions} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                  Use all resume values
                </button>
              </div>
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <div key={s.field} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                    <p className="text-sm font-medium text-slate-800">{s.label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5 text-sm">
                      <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">Current</p>
                        <p className="text-slate-700 break-words">{s.current_value}</p>
                      </div>
                      <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">From Resume</p>
                        <p className="text-slate-700 break-words">{s.resume_value}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button type="button" onClick={() => dismissSuggestion(s.field)} className="btn-secondary text-xs py-1 px-2.5">Keep Current</button>
                      <button type="button" onClick={() => applySuggestion(s)} className="btn-primary text-xs py-1 px-2.5">Use Resume Value</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No conflicting values — everything was either filled or already up to date.</p>
          )}

          <p className="text-xs text-slate-400 mt-3">
            Sensitive fields (visa, work authorization, rates, availability, employment type, status) are never auto-filled and must be edited manually.
          </p>
        </div>
      )}

      {/* Parsed Resume Information */}
      <div className="card p-6">
        <h2 className="font-bold text-slate-800 mb-1">Parsed Resume Information</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
        ) : !primary ? (
          <p className="text-sm text-slate-400 mt-2">No resume uploaded yet.</p>
        ) : primary.parsing_status === "failed" ? (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mt-2">
            <AlertTriangle size={15} /> Parsing failed for the latest resume.
            <button type="button" onClick={() => handleReparse(primary.id)} className="font-semibold underline ml-1">Retry Parsing</button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{primary.filename}</p>
            {primary.parsed_summary && <p className="text-sm text-slate-700 leading-relaxed">{primary.parsed_summary}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Primary Skill</p>
                <p className="text-sm text-slate-800">{primary.parsed_primary_skill || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Experience</p>
                <p className="text-sm text-slate-800">{primary.parsed_total_experience || "—"}</p>
              </div>
            </div>
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Skills</p><TagList items={primary.parsed_skills} /></div>
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Job Titles</p><TagList items={primary.parsed_job_titles} /></div>
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Clients</p><TagList items={primary.parsed_clients} /></div>
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Industries</p><TagList items={primary.parsed_industries} /></div>
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Certifications</p><TagList items={primary.parsed_certifications} /></div>
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Education</p><TagList items={primary.parsed_education} /></div>
          </div>
        )}
      </div>

      {/* Resume History */}
      <div className="card p-6">
        <h2 className="font-bold text-slate-800 mb-3">Resume History</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
        ) : resumes.length === 0 ? (
          <p className="text-sm text-slate-400">No resumes uploaded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {resumes.map((r) => (
              <div key={r.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={16} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-2 flex-wrap">
                        {r.filename}
                        {r.version_number != null && <span className="text-[11px] text-slate-400">v{r.version_number}</span>}
                        {r.is_primary && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Primary</span>}
                        {r.parsing_status === "failed"
                          ? <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Parse failed</span>
                          : <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">Parsed</span>}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(r.uploaded_at)} · {r.file_type.toUpperCase()} · {formatFileSize(r.file_size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} title="View parsed details" className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                      <ChevronDown size={15} className={clsx("transition-transform", expandedId === r.id && "rotate-180")} />
                    </button>
                    {r.parsing_status === "failed" && (
                      <button type="button" onClick={() => handleReparse(r.id)} disabled={busyResumeId === r.id} title="Retry parsing" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <RefreshCw size={14} className={clsx(busyResumeId === r.id && "animate-spin")} />
                      </button>
                    )}
                    {!r.is_primary && (
                      <button type="button" onClick={() => handleSetPrimary(r.id)} disabled={busyResumeId === r.id} title="Set as primary" className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                        <Star size={14} />
                      </button>
                    )}
                    <button type="button" onClick={() => handleDownload(r)} disabled={busyResumeId === r.id} title="Download" className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      <Download size={14} />
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => handleDelete(r.id)} disabled={busyResumeId === r.id} title="Delete resume" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {expandedId === r.id && (
                  <div className="mt-3 ml-7 rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2.5">
                    {r.parsed_summary && <p className="text-sm text-slate-700">{r.parsed_summary}</p>}
                    <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Primary Skill</p><p className="text-sm text-slate-800">{r.parsed_primary_skill || "—"}</p></div>
                    <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Skills</p><TagList items={r.parsed_skills} /></div>
                    <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Certifications</p><TagList items={r.parsed_certifications} /></div>
                    <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Education</p><TagList items={r.parsed_education} /></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
