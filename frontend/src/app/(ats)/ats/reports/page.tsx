import { BarChart3 } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title flex items-center gap-2">
          <BarChart3 size={22} className="text-indigo-600" /> Reports
        </h1>
        <p className="page-subtitle">
          Open jobs, jobs by client/recruiter, submissions, interviews, offers, placements,
          rejections, recruiter activity, and overdue follow-ups.
        </p>
      </div>
      <div className="card p-8 text-center text-sm text-slate-500">
        Reports are coming in a later phase of the CRM/ATS consolidation.
      </div>
    </div>
  );
}
