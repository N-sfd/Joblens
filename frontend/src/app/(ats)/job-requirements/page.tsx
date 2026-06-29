"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { JobRequirement } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

const STATUSES = ["New", "Parsed", "Ready for Match", "Matched", "Sent to Employee", "Interested", "Submitted", "Interview", "Selected", "Rejected", "Closed"];
const WORK_TYPES = ["Remote", "Hybrid", "Onsite"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

const PRIORITY_COLORS: Record<string, string> = {
  Low: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Medium: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  High: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Urgent: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  New: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Parsed: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  "Ready for Match": "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  Matched: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  "Sent to Employee": "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  Interested: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  Submitted: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  Interview: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Selected: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
  Closed: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

export default function JobRequirementsPage() {
  const [jobs, setJobs] = useState<JobRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [workTypeFilter, setWorkTypeFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  const load = async () => {
    setLoading(true);
    try {
      setJobs(await api.getJobRequirements());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job requirements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = jobs.filter((j) =>
    (statusFilter === "All" || j.status === statusFilter) &&
    (workTypeFilter === "All" || j.work_type === workTypeFilter) &&
    (priorityFilter === "All" || j.priority === priorityFilter)
  );

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Job Requirements</h1>
          <p className="page-subtitle">Job orders created from recruiter emails or job descriptions.</p>
        </div>
        <Link href="/job-requirements/new" className="btn-primary flex items-center gap-2 shrink-0">
          <Plus size={16} /> Add Job Requirement
        </Link>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="flex flex-wrap gap-3 mb-5">
        <select aria-label="Filter by status" className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="All">All Statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Filter by work type" className="input w-auto" value={workTypeFilter} onChange={(e) => setWorkTypeFilter(e.target.value)}>
          <option value="All">All Work Types</option>
          {WORK_TYPES.map((w) => <option key={w}>{w}</option>)}
        </select>
        <select aria-label="Filter by priority" className="input w-auto" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="All">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-500 font-medium">No job requirements found.</p>
            <p className="text-slate-400 text-sm mt-1">Add one from a recruiter email or job description.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Job Title", "Vendor", "End Client", "Location", "Work Type", "Rate", "Status", "Priority", "Created"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/job-requirements/${job.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">
                        {job.job_title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{job.vendor ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{job.end_client ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{job.location ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{job.work_type ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{job.rate ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", STATUS_COLORS[job.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200")}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", PRIORITY_COLORS[job.priority] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200")}>
                        {job.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(job.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
