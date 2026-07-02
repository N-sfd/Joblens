"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, X } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Employee, EmployeeUpdate } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import EmployeeResumeCard from "@/components/EmployeeResumeCard";

const VISA_STATUSES = ["US Citizen", "Green Card", "H1B", "H4 EAD", "OPT", "CPT", "Other"] as const;
const AVAILABILITIES = ["Immediate", "1 Week", "2 Weeks", "On Project", "Not Available"] as const;
const STATUSES = ["Active", "Inactive", "On Project", "Bench", "Do Not Contact"] as const;

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Inactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  "On Project": "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  Bench: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  "Do Not Contact": "bg-red-50 text-red-700 ring-1 ring-red-200",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5">{value || "—"}</p>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const employeeId = Number(params.id);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EmployeeUpdate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getEmployee(employeeId);
      setEmployee(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [employeeId]);

  const startEdit = () => {
    if (!employee) return;
    setForm({ ...employee });
    setEditing(true);
  };

  const update = (field: keyof EmployeeUpdate) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => (f ? { ...f, [field]: e.target.value } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await api.updateEmployee(employeeId, form);
      setEmployee(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error && !employee) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <ErrorBanner message={error} onRetry={load} />
      </div>
    );
  }

  if (!employee) return null;

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href="/ats/employees" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Employees
      </Link>

      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">{employee.name}</h1>
          <span className={clsx(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold mt-2",
            STATUS_COLORS[employee.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
          )}>
            {employee.status}
          </span>
        </div>
        {!editing && (
          <button type="button" onClick={startEdit} className="btn-secondary flex items-center gap-2 shrink-0">
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      {editing && form ? (
        <div className="card p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-name" className="label">Name</label>
              <input id="edit-name" className="input" value={form.name ?? ""} onChange={update("name")} />
            </div>
            <div>
              <label htmlFor="edit-email" className="label">Email</label>
              <input id="edit-email" type="email" className="input" value={form.email ?? ""} onChange={update("email")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-phone" className="label">Phone</label>
              <input id="edit-phone" className="input" value={form.phone ?? ""} onChange={update("phone")} />
            </div>
            <div>
              <label htmlFor="edit-location" className="label">Location</label>
              <input id="edit-location" className="input" value={form.location ?? ""} onChange={update("location")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-visa" className="label">Visa Status</label>
              <select id="edit-visa" className="input" value={form.visa_status ?? ""} onChange={update("visa_status")}>
                <option value="">— Select —</option>
                {VISA_STATUSES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="edit-availability" className="label">Availability</label>
              <select id="edit-availability" className="input" value={form.availability ?? ""} onChange={update("availability")}>
                <option value="">— Select —</option>
                {AVAILABILITIES.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-rate" className="label">Expected Rate</label>
              <input id="edit-rate" className="input" value={form.expected_rate ?? ""} onChange={update("expected_rate")} />
            </div>
            <div>
              <label htmlFor="edit-experience" className="label">Total Experience</label>
              <input id="edit-experience" className="input" value={form.total_experience ?? ""} onChange={update("total_experience")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-primary-skill" className="label">Primary Skill</label>
              <input id="edit-primary-skill" className="input" value={form.primary_skill ?? ""} onChange={update("primary_skill")} />
            </div>
            <div>
              <label htmlFor="edit-status" className="label">Status</label>
              <select id="edit-status" className="input" value={form.status ?? ""} onChange={update("status")}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="edit-secondary-skills" className="label">Secondary Skills</label>
            <input id="edit-secondary-skills" className="input" value={form.secondary_skills ?? ""} onChange={update("secondary_skills")} />
          </div>
          <div>
            <label htmlFor="edit-notes" className="label">Notes</label>
            <textarea id="edit-notes" className="textarea" rows={4} value={form.notes ?? ""} onChange={update("notes")} />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex items-center gap-2">
              <X size={14} /> Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Save Changes"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Email" value={employee.email} />
              <Field label="Phone" value={employee.phone} />
              <Field label="Location" value={employee.location} />
              <Field label="Visa Status" value={employee.visa_status} />
              <Field label="Availability" value={employee.availability} />
              <Field label="Expected Rate" value={employee.expected_rate} />
              <Field label="Primary Skill" value={employee.primary_skill} />
              <Field label="Total Experience" value={employee.total_experience} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Secondary Skills</p>
              <p className="text-sm text-slate-800 mt-0.5">{employee.secondary_skills || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</p>
              <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{employee.notes || "—"}</p>
            </div>
          </div>

          <EmployeeResumeCard employeeId={employeeId} onParsed={load} />

          <div className="card p-6 mt-5">
            <h2 className="font-bold text-slate-800 mb-1">Job Matches</h2>
            <p className="text-sm text-slate-500">Job matching will be added later.</p>
          </div>
        </>
      )}
    </div>
  );
}
