"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { JobApplication, JobApplicationStatus } from "@/types";
import {
  Plus, Pencil, Trash2, ExternalLink, Briefcase, Loader2,
  AlertCircle, X, Sparkles, Target, PenTool, RefreshCw,
} from "lucide-react";
import clsx from "clsx";

const STATUSES = ["Applied", "Interviewing", "Offer", "Rejected", "Saved"] as const;
const FILTERS = ["All", ...STATUSES] as const;

const STATUS_COLORS: Record<string, string> = {
  Applied: "bg-blue-100 text-blue-700",
  Interviewing: "bg-purple-100 text-purple-700",
  Offer: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  Saved: "bg-slate-100 text-slate-600",
};

const emptyForm = {
  company: "", role: "", status: "Applied" as string, location: "",
  job_url: "", salary_range: "", notes: "", date_applied: "", follow_up_date: "",
};

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [filter, setFilter] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      setJobs(await api.listJobs());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (job: JobApplication) => {
    setEditing(job);
    setForm({
      company: job.company, role: job.role, status: job.status,
      location: job.location ?? "", job_url: job.job_url ?? "",
      salary_range: job.salary_range ?? "", notes: job.notes ?? "",
      date_applied: job.date_applied ? job.date_applied.split("T")[0] : "",
      follow_up_date: job.follow_up_date ? job.follow_up_date.split("T")[0] : "",
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.company || !form.role) return;
    setSaving(true);
    try {
      const payload = {
        company: form.company, role: form.role,
        status: form.status as JobApplicationStatus,
        location: form.location || null, job_url: form.job_url || null,
        salary_range: form.salary_range || null, notes: form.notes || null,
        date_applied: form.date_applied || null,
        follow_up_date: form.follow_up_date || null,
      };
      if (editing) await api.updateJob(editing.id, payload);
      else await api.createJob(payload as Parameters<typeof api.createJob>[0]);
      setShowModal(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (id: number) => {
    try {
      await api.deleteJob(id);
      setDeleteId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    try {
      const res = await api.loadDemoJobs();
      showToast(res.message);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load demo jobs.";
      if (msg.includes("already loaded")) showToast("Demo jobs already loaded.");
      else setError(msg);
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const res = await api.clearAllJobs();
      showToast(res.message);
      setShowClearConfirm(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed.");
    } finally {
      setClearing(false);
    }
  };

  const visible = filter === "All" ? jobs : jobs.filter((j) => j.status === filter);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map((j) => j.id)));
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    setDeletingSelected(true);
    try {
      const res = await api.bulkDeleteJobs(Array.from(selected));
      showToast(res.message);
      setSelected(new Set());
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeletingSelected(false);
    }
  };

  const handleStatusChange = async (job: JobApplication, newStatus: JobApplicationStatus) => {
    setUpdatingStatus(job.id);
    try {
      await api.updateJob(job.id, { status: newStatus });
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: newStatus } : j)));
      showToast(`Status updated to ${newStatus}`);
    } catch {
      setError("Failed to update status.");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleAnalyzeMatch = (job: JobApplication) => {
    localStorage.setItem("aijob_match_context", JSON.stringify({ company: job.company, role: job.role }));
    router.push("/match");
  };

  const handleCoverLetter = (job: JobApplication) => {
    router.push(`/cover-letter?company=${encodeURIComponent(job.company)}&role=${encodeURIComponent(job.role)}`);
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-slide-up">
          {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Job Tracker</h1>
          <p className="text-slate-500 mt-1">Manage and track all your job applications.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={deletingSelected}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-2 rounded-lg transition-colors"
            >
              {deletingSelected ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete Selected ({selected.size})
            </button>
          )}
          {jobs.length > 0 && selected.size === 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors font-medium"
            >
              Clear All
            </button>
          )}
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={loadingDemo}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {loadingDemo ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Demo Jobs
          </button>
          <button type="button" onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Job
          </button>
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

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {f}
            <span className={`ml-1.5 text-xs font-bold ${filter === f ? "text-indigo-600" : "text-slate-400"}`}>
              {f === "All" ? jobs.length : jobs.filter((j) => j.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Job List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <Briefcase className="mx-auto text-slate-200 mb-3" size={40} />
            <p className="text-slate-500 font-medium">No applications found.</p>
            <p className="text-slate-400 text-sm mt-1">Add a job or load demo data to get started.</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {visible.map((job) => (
                <div key={job.id} className={clsx("p-4 transition-colors", selected.has(job.id) && "bg-indigo-50")}>
                  <div className="flex items-start gap-3 mb-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${job.company}`}
                      checked={selected.has(job.id)}
                      onChange={() => toggleSelect(job.id)}
                      className="mt-1 accent-indigo-600 shrink-0"
                    />
                    <div className="flex-1 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{job.company}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{job.role}</p>
                      {job.location && <p className="text-xs text-slate-400 mt-0.5">{job.location}</p>}
                    </div>
                    {updatingStatus === job.id ? (
                      <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" />
                    ) : (
                      <select
                        value={job.status}
                        onChange={(e) => handleStatusChange(job, e.target.value as JobApplicationStatus)}
                        aria-label={`Status for ${job.company}`}
                        className={clsx(
                          "text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer appearance-none shrink-0",
                          STATUS_COLORS[job.status] ?? "bg-slate-100 text-slate-600"
                        )}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {job.salary_range && (
                      <span className="text-xs text-slate-400 mr-2">{job.salary_range}</span>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      <button type="button" onClick={() => handleAnalyzeMatch(job)} title="Analyze Match"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Target size={14} />
                      </button>
                      <button type="button" onClick={() => handleCoverLetter(job)} title="Cover Letter"
                        className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                        <PenTool size={14} />
                      </button>
                      {job.job_url && (
                        <a href={job.job_url} target="_blank" rel="noreferrer" title="Open job listing"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button type="button" onClick={() => openEdit(job)} title="Edit"
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => setDeleteId(job.id)} title="Delete"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={visible.length > 0 && selected.size === visible.length}
                        onChange={toggleSelectAll}
                        className="accent-indigo-600"
                      />
                    </th>
                    {["Company", "Role", "Status", "Location", "Date Applied", "Salary", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((job) => (
                    <tr key={job.id} className={clsx("transition-colors", selected.has(job.id) ? "bg-indigo-50" : "hover:bg-slate-50")}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${job.company}`}
                          checked={selected.has(job.id)}
                          onChange={() => toggleSelect(job.id)}
                          className="accent-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800">{job.company}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{job.role}</td>
                      <td className="px-4 py-3">
                        {updatingStatus === job.id ? (
                          <Loader2 size={14} className="animate-spin text-indigo-500" />
                        ) : (
                          <select
                            value={job.status}
                            onChange={(e) => handleStatusChange(job, e.target.value as JobApplicationStatus)}
                            aria-label={`Status for ${job.company} — ${job.role}`}
                            className={clsx(
                              "text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer appearance-none",
                              STATUS_COLORS[job.status] ?? "bg-slate-100 text-slate-600"
                            )}
                          >
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{job.location ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {job.date_applied
                          ? new Date(job.date_applied).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{job.salary_range ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => handleAnalyzeMatch(job)} title="Analyze Match"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                            <Target size={14} />
                          </button>
                          <button type="button" onClick={() => handleCoverLetter(job)} title="Cover Letter"
                            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                            <PenTool size={14} />
                          </button>
                          {job.job_url && (
                            <a href={job.job_url} target="_blank" rel="noreferrer" title="Open listing"
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <ExternalLink size={14} />
                            </a>
                          )}
                          <button type="button" onClick={() => openEdit(job)} title="Edit"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => setDeleteId(job.id)} title="Delete"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Action Legend — desktop only */}
      <div className="hidden md:flex mt-3 items-center gap-4 text-xs text-slate-400 px-1">
        <span className="flex items-center gap-1"><Target size={11} /> Analyze Match</span>
        <span className="flex items-center gap-1"><PenTool size={11} /> Cover Letter</span>
        <span className="flex items-center gap-1"><RefreshCw size={11} /> Click status to update</span>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editing ? "Edit Application" : "Add Application"}</h3>
              <button type="button" aria-label="Close modal" onClick={() => setShowModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-company" className="label">Company *</label>
                  <input id="modal-company" className="input" value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Google" />
                </div>
                <div>
                  <label htmlFor="modal-role" className="label">Role *</label>
                  <input id="modal-role" className="input" value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Software Engineer" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-status" className="label">Status</label>
                  <select id="modal-status" className="input" value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="modal-location" className="label">Location</label>
                  <input id="modal-location" className="input" value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Remote" />
                </div>
              </div>
              <div>
                <label htmlFor="modal-url" className="label">Job URL</label>
                <input id="modal-url" className="input" value={form.job_url}
                  onChange={(e) => setForm({ ...form, job_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-salary" className="label">Salary Range</label>
                  <input id="modal-salary" className="input" value={form.salary_range}
                    onChange={(e) => setForm({ ...form, salary_range: e.target.value })} placeholder="$80k – $100k" />
                </div>
                <div>
                  <label htmlFor="modal-date" className="label">Date Applied</label>
                  <input id="modal-date" type="date" className="input" value={form.date_applied}
                    onChange={(e) => setForm({ ...form, date_applied: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="modal-followup" className="label">Follow-up Date</label>
                <input id="modal-followup" type="date" className="input" value={form.follow_up_date}
                  onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
              </div>
              <div>
                <label htmlFor="modal-notes" className="label">Notes</label>
                <textarea id="modal-notes" className="textarea" rows={3} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Add any notes..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={save} disabled={saving || !form.company || !form.role}
                className="btn-primary flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : (editing ? "Save Changes" : "Add Application")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirm */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <h3 className="font-bold text-slate-800 mb-2">Clear All Jobs?</h3>
            <p className="text-sm text-slate-500 mb-5">This will permanently delete all {jobs.length} applications. Cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowClearConfirm(false)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={handleClearAll} disabled={clearing}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                {clearing ? <><Loader2 size={14} className="animate-spin" /> Clearing...</> : "Clear All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <h3 className="font-bold text-slate-800 mb-2">Delete Application?</h3>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={() => confirmDelete(deleteId)}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
