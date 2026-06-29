"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, FileText, Trash2, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { EmployeeResume } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-sm text-slate-400">—</span>;
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
  // Called after a successful upload so the parent can refresh employee
  // fields that may have been auto-filled from the parsed resume.
  onParsed?: () => void;
}

export default function EmployeeResumeCard({ employeeId, onParsed }: Props) {
  const [resumes, setResumes] = useState<EmployeeResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF, DOCX, or TXT file first.");
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.uploadEmployeeResume(employeeId, file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSuccess("Resume uploaded and parsed successfully.");
      await load();
      onParsed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload resume.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (resumeId: number) => {
    try {
      await api.deleteEmployeeResume(employeeId, resumeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete resume.");
    }
  };

  const primary = resumes.find((r) => r.is_primary) ?? resumes[0] ?? null;

  return (
    <div className="card p-6 mt-5">
      <h2 className="font-bold text-slate-800 mb-1">Resume</h2>
      <p className="text-sm text-slate-500 mb-4">Upload a resume to extract skills, experience, and a staffing summary.</p>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}
      {success && (
        <div className="flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-2.5 mb-4">
          <CheckCircle2 size={15} /> {success}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          aria-label="Resume file"
          className="text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
        <button type="button" onClick={handleUpload} disabled={uploading} className="btn-primary flex items-center gap-2 shrink-0">
          {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading & parsing…</> : <><Upload size={14} /> Upload Resume</>}
        </button>
      </div>
      <p className="text-xs text-slate-400 -mt-3 mb-5">Allowed file types: PDF, DOCX, TXT</p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-indigo-500" />
        </div>
      ) : resumes.length === 0 ? (
        <p className="text-sm text-slate-400">No resume uploaded yet.</p>
      ) : (
        <>
          {primary && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 mb-5 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Latest Parsed Resume — {primary.filename}</p>
              {primary.parsed_summary && (
                <p className="text-sm text-slate-700 leading-relaxed">{primary.parsed_summary}</p>
              )}
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
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Skills</p>
                <TagList items={primary.parsed_skills} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Job Titles</p>
                <TagList items={primary.parsed_job_titles} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Clients</p>
                <TagList items={primary.parsed_clients} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Certifications</p>
                <TagList items={primary.parsed_certifications} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Education</p>
                <TagList items={primary.parsed_education} />
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {resumes.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={16} className="text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                      {r.filename}
                      {r.is_primary && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 shrink-0">
                          Primary
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDate(r.uploaded_at)} · {r.file_type.toUpperCase()} · {formatFileSize(r.file_size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  title="Delete resume"
                  className={clsx("p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
