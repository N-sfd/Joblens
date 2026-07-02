"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { EmployeeCreate } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

const VISA_STATUSES = ["US Citizen", "Green Card", "H1B", "H4 EAD", "OPT", "CPT", "Other"] as const;
const AVAILABILITIES = ["Immediate", "1 Week", "2 Weeks", "On Project", "Not Available"] as const;
const STATUSES = ["Active", "Inactive", "On Project", "Bench", "Do Not Contact"] as const;

const emptyForm: EmployeeCreate = {
  name: "", email: "", phone: "", location: "",
  visa_status: "", availability: "", expected_rate: "",
  primary_skill: "", secondary_skills: "", total_experience: "",
  status: "Active", notes: "",
};

export default function NewEmployeePage() {
  const router = useRouter();
  const [form, setForm] = useState<EmployeeCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof EmployeeCreate) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async () => {
    if (!form.name || !form.email) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: EmployeeCreate = {
        ...form,
        phone: form.phone || null,
        location: form.location || null,
        visa_status: form.visa_status || null,
        availability: form.availability || null,
        expected_rate: form.expected_rate || null,
        primary_skill: form.primary_skill || null,
        secondary_skills: form.secondary_skills || null,
        total_experience: form.total_experience || null,
        notes: form.notes || null,
      };
      const created = await api.createEmployee(payload);
      router.push(`/ats/employees/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create employee.");
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Add Employee</h1>
        <p className="page-subtitle">Create a new employee/consultant profile.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="card p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="label">Name *</label>
            <input id="name" className="input" value={form.name} onChange={update("name")} placeholder="Jane Doe" />
          </div>
          <div>
            <label htmlFor="email" className="label">Email *</label>
            <input id="email" type="email" className="input" value={form.email} onChange={update("email")} placeholder="jane@example.com" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" className="label">Phone</label>
            <input id="phone" className="input" value={form.phone ?? ""} onChange={update("phone")} placeholder="(555) 123-4567" />
          </div>
          <div>
            <label htmlFor="location" className="label">Location</label>
            <input id="location" className="input" value={form.location ?? ""} onChange={update("location")} placeholder="Dallas, TX" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="visa_status" className="label">Visa Status</label>
            <select id="visa_status" className="input" value={form.visa_status ?? ""} onChange={update("visa_status")}>
              <option value="">— Select —</option>
              {VISA_STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="availability" className="label">Availability</label>
            <select id="availability" className="input" value={form.availability ?? ""} onChange={update("availability")}>
              <option value="">— Select —</option>
              {AVAILABILITIES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="expected_rate" className="label">Expected Rate</label>
            <input id="expected_rate" className="input" value={form.expected_rate ?? ""} onChange={update("expected_rate")} placeholder="$75/hr" />
          </div>
          <div>
            <label htmlFor="total_experience" className="label">Total Experience</label>
            <input id="total_experience" className="input" value={form.total_experience ?? ""} onChange={update("total_experience")} placeholder="5 years" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="primary_skill" className="label">Primary Skill</label>
            <input id="primary_skill" className="input" value={form.primary_skill ?? ""} onChange={update("primary_skill")} placeholder="Java" />
          </div>
          <div>
            <label htmlFor="status" className="label">Status</label>
            <select id="status" className="input" value={form.status} onChange={update("status")}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="secondary_skills" className="label">Secondary Skills</label>
          <input id="secondary_skills" className="input" value={form.secondary_skills ?? ""} onChange={update("secondary_skills")} placeholder="Spring Boot, AWS, Kafka" />
        </div>

        <div>
          <label htmlFor="notes" className="label">Notes</label>
          <textarea id="notes" className="textarea" rows={4} value={form.notes ?? ""} onChange={update("notes")} placeholder="Add any notes..." />
        </div>
      </div>

      <div className="flex gap-3 justify-end mt-5">
        <button type="button" onClick={() => router.push("/ats/employees")} className="btn-secondary">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !form.name || !form.email} className="btn-primary flex items-center gap-2">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Add Employee"}
        </button>
      </div>
    </div>
  );
}
