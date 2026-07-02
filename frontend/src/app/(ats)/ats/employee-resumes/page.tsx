"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { Employee } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

// Resume management currently lives on each employee's detail page. This index
// gives recruiters a single place to jump to any employee's resume versions.
export default function EmployeeResumesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const filtered = employees.filter((e) =>
    !search || `${e.name} ${e.primary_skill ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Employee Resumes</h1>
        <p className="page-subtitle">Open an employee to upload, parse, and manage resume versions.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <input className="input mb-4" placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-500 font-medium">No employees found.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((e) => (
              <li key={e.id}>
                <Link href={`/ats/employees/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <FileText size={16} className="text-slate-400" />
                  <span className="font-medium text-indigo-600">{e.name}</span>
                  <span className="text-sm text-slate-400">{e.primary_skill ?? ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
