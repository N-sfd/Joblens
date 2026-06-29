"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Employee } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Inactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  "On Project": "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  Bench: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  "Do Not Contact": "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setEmployees(await api.getEmployees());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Consultants and employees available for job matching.</p>
        </div>
        <Link href="/employees/new" className="btn-primary flex items-center gap-2 shrink-0">
          <Plus size={16} /> Add Employee
        </Link>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : employees.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-500 font-medium">No employees yet.</p>
            <p className="text-slate-400 text-sm mt-1">Add your first employee to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Name", "Email", "Primary Skill", "Location", "Visa Status", "Availability", "Expected Rate", "Status"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/employees/${emp.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">
                        {emp.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{emp.email}</td>
                    <td className="px-4 py-3 text-slate-600">{emp.primary_skill ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{emp.location ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{emp.visa_status ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{emp.availability ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{emp.expected_rate ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={clsx(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                        STATUS_COLORS[emp.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                      )}>
                        {emp.status}
                      </span>
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
