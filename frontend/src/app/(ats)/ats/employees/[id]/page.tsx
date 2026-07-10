"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Employee } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import EmployeeResumeManager from "@/components/EmployeeResumeManager";
import { useAtsRole } from "@/lib/atsRole";

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Bench: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  "On Project": "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  "Available Soon": "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  Inactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  "Do Not Contact": "bg-red-50 text-red-700 ring-1 ring-red-200",
  "Former Employee": "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5 break-words">{value || "—"}</p>
    </div>
  );
}

function fullName(e: Employee): string {
  const parts = [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ").trim();
  return parts || e.name;
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const employeeId = Number(params.id);
  const router = useRouter();
  const { isAdmin, canWrite } = useAtsRole();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setEmployee(await api.getEmployee(employeeId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [employeeId]);

  const scrollToUpload = () => {
    document.getElementById("resume-upload")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const remove = async () => {
    if (!confirm("Delete this employee? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.deleteEmployee(employeeId);
      router.push("/ats/employees");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete employee.");
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }
  if (error && !employee) {
    return <div className="p-4 sm:p-8 max-w-3xl mx-auto"><ErrorBanner message={error} onRetry={load} /></div>;
  }
  if (!employee) return null;

  const subtitle = [employee.primary_skill, employee.current_location || employee.location, employee.availability]
    .filter(Boolean).join(" · ");

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href="/ats/employees" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Employees
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">Employee</p>
          <h1 className="page-title">{fullName(employee)}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
          <span className={clsx(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold mt-2",
            STATUS_COLORS[employee.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
          )}>
            {employee.status}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={scrollToUpload} className="btn-secondary flex items-center gap-2">
            <Upload size={14} /> Upload Resume
          </button>
          {canWrite && (
            <Link href={`/ats/employees/${employeeId}/edit`} className="btn-primary flex items-center gap-2">
              <Pencil size={14} /> Edit Employee
            </Link>
          )}
          {isAdmin && (
            <button type="button" onClick={remove} disabled={deleting} className="btn-danger flex items-center gap-2">
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      {/* Profile Overview */}
      <div className="card p-6 space-y-5">
        <h2 className="font-bold text-slate-800">Profile Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Employee Code" value={employee.employee_code} />
          <Field label="Current Job Title" value={employee.current_job_title} />
          <Field label="Current Employer" value={employee.current_employer} />
          <Field label="Employment Type" value={employee.employment_type} />
          <Field label="Source" value={employee.source} />
          <Field label="LinkedIn" value={employee.linkedin_url} />
        </div>
      </div>

      {/* Contact Information */}
      <div className="card p-6 space-y-5 mt-5">
        <h2 className="font-bold text-slate-800">Contact Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Email" value={employee.email} />
          <Field label="Personal Email" value={employee.personal_email} />
          <Field label="Company Email" value={employee.company_email} />
          <Field label="Phone" value={employee.phone} />
          <Field label="Alternate Phone" value={employee.alternate_phone} />
          <Field label="Current Location" value={employee.current_location || employee.location} />
        </div>
      </div>

      {/* Work Authorization (read-only; never auto-filled from resume) */}
      <div className="card p-6 space-y-5 mt-5">
        <h2 className="font-bold text-slate-800">Work Authorization</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Work Authorization" value={employee.work_authorization} />
          <Field label="Visa Status" value={employee.visa_status} />
          <Field label="Visa Expiration" value={employee.visa_expiration_date} />
          <Field label="Sponsorship Required" value={employee.sponsorship_required == null ? null : employee.sponsorship_required ? "Yes" : "No"} />
        </div>
      </div>

      {/* Skills and Experience */}
      <div className="card p-6 space-y-5 mt-5">
        <h2 className="font-bold text-slate-800">Skills and Experience</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Primary Skill" value={employee.primary_skill} />
          <Field label="Total Experience (years)" value={employee.total_experience} />
          <Field label="Relevant Experience (years)" value={employee.relevant_experience_years} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Secondary Skills</p>
          <p className="text-sm text-slate-800 mt-0.5">{employee.secondary_skills || "—"}</p>
        </div>
      </div>

      {/* Rate and Availability (rates/availability never auto-filled) */}
      <div className="card p-6 space-y-5 mt-5">
        <h2 className="font-bold text-slate-800">Rate and Availability</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Availability" value={employee.availability} />
          <Field label="Available From" value={employee.available_from} />
          <Field label="Current Rate" value={employee.current_rate} />
          <Field label="Expected Rate" value={employee.expected_rate} />
          <Field label="Rate Type" value={employee.rate_type} />
          <Field label="Remote Preference" value={employee.remote_preference} />
        </div>
      </div>

      {/* Notes */}
      <div className="card p-6 mt-5">
        <h2 className="font-bold text-slate-800 mb-1">Notes</h2>
        <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{employee.notes || "—"}</p>
      </div>

      {/* Resume Upload / Parsed / Suggestions / History */}
      <div className="mt-6">
        <EmployeeResumeManager employeeId={employeeId} onEmployeeUpdated={(e) => setEmployee(e)} />
      </div>

      {/* Job Matches placeholder */}
      <div className="card p-6 mt-5">
        <h2 className="font-bold text-slate-800 mb-1">Job Matches</h2>
        <p className="text-sm text-slate-500">Job matching will be added later.</p>
      </div>
    </div>
  );
}
