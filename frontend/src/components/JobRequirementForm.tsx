"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  JOB_REQUIREMENT_STATUSES, JOB_REQUIREMENT_PRIORITIES, JOB_REQUIREMENT_SOURCES,
} from "@/types";
import type { CRMOrganization, CRMContact } from "@/types";

export const WORK_TYPES = ["Remote", "Hybrid", "Onsite"] as const;

export interface JobFormState {
  job_title: string;
  job_reference_number: string;
  vendor: string;
  vendor_id: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_phone: string;
  recruiter_contact_id: string;
  client: string;
  client_id: string;
  end_client: string;
  end_client_id: string;
  location: string;
  city: string;
  state: string;
  country: string;
  work_type: string;
  employment_type: string;
  contract_type: string;
  rate: string;
  rate_min: string;
  rate_max: string;
  rate_currency: string;
  rate_type: string;
  duration: string;
  visa_requirement: string;
  clearance_requirement: string;
  required_skills: string;
  preferred_skills: string;
  minimum_experience: string;
  education_requirement: string;
  certification_requirement: string;
  job_description: string;
  submission_instructions: string;
  submission_deadline: string;
  number_of_openings: string;
  status: string;
  priority: string;
  source: string;
  notes: string;
}

export const emptyJobForm = (): JobFormState => ({
  job_title: "", job_reference_number: "", vendor: "", vendor_id: "", recruiter_name: "", recruiter_email: "",
  recruiter_phone: "", recruiter_contact_id: "", client: "", client_id: "", end_client: "", end_client_id: "",
  location: "", city: "", state: "", country: "",
  work_type: "", employment_type: "", contract_type: "", rate: "", rate_min: "", rate_max: "",
  rate_currency: "USD", rate_type: "", duration: "", visa_requirement: "", clearance_requirement: "",
  required_skills: "", preferred_skills: "", minimum_experience: "", education_requirement: "",
  certification_requirement: "", job_description: "", submission_instructions: "",
  submission_deadline: "", number_of_openings: "", status: "New", priority: "Medium",
  source: "Manual", notes: "",
});

export const splitSkills = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function formatRateFromParse(parsed: { rate_min?: string | null; rate_max?: string | null; rate_currency?: string; rate_type?: string }): string {
  const lo = parsed.rate_min, hi = parsed.rate_max;
  const suffix = parsed.rate_type === "hourly" ? "/hr" : parsed.rate_type === "annual" ? "/yr" : "";
  if (lo && hi && lo !== hi) return `$${lo}${suffix} – $${hi}${suffix}`;
  if (lo) return `$${lo}${suffix}`;
  if (hi) return `$${hi}${suffix}`;
  return "";
}

export function applyParsedToForm(prev: JobFormState, parsed: import("@/types").JobRequirementParseResult): JobFormState {
  return {
    ...prev,
    job_title: parsed.job_title || prev.job_title,
    job_reference_number: parsed.job_reference_number || prev.job_reference_number,
    vendor: parsed.vendor || prev.vendor,
    recruiter_name: parsed.recruiter_name || prev.recruiter_name,
    recruiter_email: parsed.recruiter_email || prev.recruiter_email,
    recruiter_phone: parsed.recruiter_phone || prev.recruiter_phone,
    client: parsed.client || prev.client,
    end_client: parsed.end_client || prev.end_client,
    location: parsed.location || prev.location,
    work_type: parsed.work_type || prev.work_type,
    employment_type: parsed.employment_type || prev.employment_type,
    contract_type: parsed.contract_type || prev.contract_type,
    rate: formatRateFromParse(parsed) || prev.rate,
    rate_min: parsed.rate_min ?? prev.rate_min,
    rate_max: parsed.rate_max ?? prev.rate_max,
    rate_currency: parsed.rate_currency || prev.rate_currency,
    rate_type: parsed.rate_type || prev.rate_type,
    duration: parsed.duration || prev.duration,
    visa_requirement: parsed.visa_requirement || prev.visa_requirement,
    clearance_requirement: parsed.clearance_requirement || prev.clearance_requirement,
    required_skills: parsed.required_skills.length ? parsed.required_skills.join(", ") : prev.required_skills,
    preferred_skills: parsed.preferred_skills.length ? parsed.preferred_skills.join(", ") : prev.preferred_skills,
    minimum_experience: parsed.minimum_experience || prev.minimum_experience,
    education_requirement: parsed.education_requirement || prev.education_requirement,
    certification_requirement: parsed.certification_requirement || prev.certification_requirement,
    submission_deadline: parsed.submission_deadline || prev.submission_deadline,
    submission_instructions: parsed.submission_instructions || prev.submission_instructions,
    number_of_openings: parsed.number_of_openings != null ? String(parsed.number_of_openings) : prev.number_of_openings,
    job_description: parsed.summary ? `${parsed.summary}\n\n` : prev.job_description,
    status: "Parsed",
    source: "Email Copy/Paste",
  };
}

export function jobToForm(job: import("@/types").JobRequirement): JobFormState {
  return {
    job_title: job.job_title,
    job_reference_number: job.job_reference_number ?? "",
    vendor: job.vendor ?? "",
    vendor_id: job.vendor_id != null ? String(job.vendor_id) : "",
    recruiter_name: job.recruiter_name ?? "",
    recruiter_email: job.recruiter_email ?? "",
    recruiter_phone: job.recruiter_phone ?? "",
    recruiter_contact_id: job.recruiter_contact_id != null ? String(job.recruiter_contact_id) : "",
    client: job.client ?? "",
    client_id: job.client_id != null ? String(job.client_id) : "",
    end_client: job.end_client ?? "",
    end_client_id: job.end_client_id != null ? String(job.end_client_id) : "",
    location: job.location ?? "",
    city: job.city ?? "",
    state: job.state ?? "",
    country: job.country ?? "",
    work_type: job.work_type ?? "",
    employment_type: job.employment_type ?? "",
    contract_type: job.contract_type ?? "",
    rate: job.rate ?? "",
    rate_min: job.rate_min ?? "",
    rate_max: job.rate_max ?? "",
    rate_currency: job.rate_currency ?? "USD",
    rate_type: job.rate_type ?? "",
    duration: job.duration ?? "",
    visa_requirement: job.visa_requirement ?? "",
    clearance_requirement: job.clearance_requirement ?? "",
    required_skills: job.required_skills.join(", "),
    preferred_skills: job.preferred_skills.join(", "),
    minimum_experience: job.minimum_experience ?? "",
    education_requirement: job.education_requirement ?? "",
    certification_requirement: job.certification_requirement ?? "",
    job_description: job.job_description ?? "",
    submission_instructions: job.submission_instructions ?? "",
    submission_deadline: job.submission_deadline ?? "",
    number_of_openings: job.number_of_openings != null ? String(job.number_of_openings) : "",
    status: job.status,
    priority: job.priority,
    source: job.source,
    notes: job.notes ?? "",
  };
}

export function formToPayload(form: JobFormState, rawEmail?: string | null): import("@/types").JobRequirementCreate {
  return {
    job_title: form.job_title,
    job_reference_number: form.job_reference_number || null,
    vendor: form.vendor || null,
    vendor_id: form.vendor_id ? Number(form.vendor_id) : null,
    recruiter_name: form.recruiter_name || null,
    recruiter_email: form.recruiter_email || null,
    recruiter_phone: form.recruiter_phone || null,
    recruiter_contact_id: form.recruiter_contact_id ? Number(form.recruiter_contact_id) : null,
    client: form.client || null,
    client_id: form.client_id ? Number(form.client_id) : null,
    end_client: form.end_client || null,
    end_client_id: form.end_client_id ? Number(form.end_client_id) : null,
    location: form.location || null,
    city: form.city || null,
    state: form.state || null,
    country: form.country || null,
    work_type: form.work_type || null,
    employment_type: form.employment_type || null,
    contract_type: form.contract_type || null,
    rate: form.rate || null,
    rate_min: form.rate_min || null,
    rate_max: form.rate_max || null,
    rate_currency: form.rate_currency || null,
    rate_type: form.rate_type || null,
    duration: form.duration || null,
    visa_requirement: form.visa_requirement || null,
    clearance_requirement: form.clearance_requirement || null,
    required_skills: splitSkills(form.required_skills),
    preferred_skills: splitSkills(form.preferred_skills),
    minimum_experience: form.minimum_experience || null,
    education_requirement: form.education_requirement || null,
    certification_requirement: form.certification_requirement || null,
    job_description: form.job_description || null,
    raw_email_text: rawEmail || null,
    submission_instructions: form.submission_instructions || null,
    submission_deadline: form.submission_deadline || null,
    number_of_openings: form.number_of_openings ? Number(form.number_of_openings) : null,
    status: form.status,
    priority: form.priority,
    source: form.source,
    notes: form.notes || null,
    external_job_id: null,
    received_at: null,
  };
}

interface Props {
  form: JobFormState;
  onChange: (field: keyof JobFormState, value: string) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export default function JobRequirementForm({ form, onChange }: Props) {
  const set = (field: keyof JobFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => onChange(field, e.target.value);

  const [orgs, setOrgs] = useState<CRMOrganization[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [o, c] = await Promise.all([api.getOrganizations(), api.getContacts()]);
        if (!active) return;
        setOrgs(o ?? []);
        setContacts(c ?? []);
      } catch {
        // CRM linking is optional; free-text fields still work if this fails.
      }
    })();
    return () => { active = false; };
  }, []);

  // Selecting a CRM record sets both the FK id and mirrors its name into the
  // free-text field (so display + auto-match stay consistent).
  const linkOrg = (idField: keyof JobFormState, nameField: keyof JobFormState) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      onChange(idField, id);
      const org = orgs.find((o) => String(o.id) === id);
      if (org) onChange(nameField, org.organization_name);
    };

  const linkContact = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    onChange("recruiter_contact_id", id);
    const c = contacts.find((x) => String(x.id) === id);
    if (c) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
      if (name) onChange("recruiter_name", name);
      if (c.email) onChange("recruiter_email", c.email);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Job Title *"><input title="Job Title" className="input" value={form.job_title} onChange={set("job_title")} /></Field>
        <Field label="Job Reference #"><input title="Job Reference" className="input" value={form.job_reference_number} onChange={set("job_reference_number")} /></Field>
        <Field label="Vendor"><input title="Vendor" className="input" value={form.vendor} onChange={set("vendor")} /></Field>
        <Field label="Client"><input title="Client" className="input" value={form.client} onChange={set("client")} /></Field>
        <Field label="End Client"><input title="End Client" className="input" value={form.end_client} onChange={set("end_client")} /></Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Link to CRM</p>
        <p className="text-xs text-slate-400 -mt-1.5">Connect this job to existing CRM records. Leave blank to auto-match by name on save.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Vendor Org">
            <select title="Vendor Org" className="input" value={form.vendor_id} onChange={linkOrg("vendor_id", "vendor")}>
              <option value="">— Not linked —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.organization_name}</option>)}
            </select>
          </Field>
          <Field label="Client Org">
            <select title="Client Org" className="input" value={form.client_id} onChange={linkOrg("client_id", "client")}>
              <option value="">— Not linked —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.organization_name}</option>)}
            </select>
          </Field>
          <Field label="End Client Org">
            <select title="End Client Org" className="input" value={form.end_client_id} onChange={linkOrg("end_client_id", "end_client")}>
              <option value="">— Not linked —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.organization_name}</option>)}
            </select>
          </Field>
          <Field label="Recruiter Contact">
            <select title="Recruiter Contact" className="input" value={form.recruiter_contact_id} onChange={linkContact}>
              <option value="">— Not linked —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || `Contact #${c.id}`}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Recruiter Name"><input title="Recruiter Name" className="input" value={form.recruiter_name} onChange={set("recruiter_name")} /></Field>
        <Field label="Recruiter Email"><input title="Recruiter Email" type="email" className="input" value={form.recruiter_email} onChange={set("recruiter_email")} /></Field>
        <Field label="Recruiter Phone"><input title="Recruiter Phone" className="input" value={form.recruiter_phone} onChange={set("recruiter_phone")} /></Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Location"><input title="Location" className="input" value={form.location} onChange={set("location")} /></Field>
        <Field label="City"><input title="City" className="input" value={form.city} onChange={set("city")} /></Field>
        <Field label="State"><input title="State" className="input" value={form.state} onChange={set("state")} /></Field>
        <Field label="Country"><input title="Country" className="input" value={form.country} onChange={set("country")} /></Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Work Type">
          <select title="Work Type" className="input" value={form.work_type} onChange={set("work_type")}>
            <option value="">— Select —</option>
            {WORK_TYPES.map((w) => <option key={w}>{w}</option>)}
          </select>
        </Field>
        <Field label="Employment Type"><input title="Employment Type" className="input" value={form.employment_type} onChange={set("employment_type")} placeholder="W2, C2C, 1099" /></Field>
        <Field label="Contract Type"><input title="Contract Type" className="input" value={form.contract_type} onChange={set("contract_type")} /></Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Rate (display)"><input title="Rate" className="input" value={form.rate} onChange={set("rate")} placeholder="$75/hr" /></Field>
        <Field label="Rate Min"><input title="Rate Min" className="input" value={form.rate_min} onChange={set("rate_min")} /></Field>
        <Field label="Rate Max"><input title="Rate Max" className="input" value={form.rate_max} onChange={set("rate_max")} /></Field>
        <Field label="Rate Type"><input title="Rate Type" className="input" value={form.rate_type} onChange={set("rate_type")} placeholder="hourly, annual" /></Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Duration"><input title="Duration" className="input" value={form.duration} onChange={set("duration")} /></Field>
        <Field label="Minimum Experience"><input title="Minimum Experience" className="input" value={form.minimum_experience} onChange={set("minimum_experience")} /></Field>
        <Field label="Visa Requirement"><input title="Visa Requirement" className="input" value={form.visa_requirement} onChange={set("visa_requirement")} /></Field>
        <Field label="Clearance Requirement"><input title="Clearance" className="input" value={form.clearance_requirement} onChange={set("clearance_requirement")} /></Field>
      </div>

      <Field label="Required Skills (comma-separated)"><input title="Required Skills" className="input" value={form.required_skills} onChange={set("required_skills")} /></Field>
      <Field label="Preferred Skills (comma-separated)"><input title="Preferred Skills" className="input" value={form.preferred_skills} onChange={set("preferred_skills")} /></Field>
      <Field label="Education Requirement"><input title="Education" className="input" value={form.education_requirement} onChange={set("education_requirement")} /></Field>
      <Field label="Certification Requirement"><input title="Certifications" className="input" value={form.certification_requirement} onChange={set("certification_requirement")} /></Field>
      <Field label="Job Description"><textarea title="Job Description" className="textarea" rows={5} value={form.job_description} onChange={set("job_description")} /></Field>
      <Field label="Submission Instructions"><textarea title="Submission Instructions" className="textarea" rows={3} value={form.submission_instructions} onChange={set("submission_instructions")} /></Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Submission Deadline"><input title="Deadline" className="input" value={form.submission_deadline} onChange={set("submission_deadline")} /></Field>
        <Field label="# Openings"><input title="Openings" type="number" min={0} className="input" value={form.number_of_openings} onChange={set("number_of_openings")} /></Field>
        <Field label="Source">
          <select title="Source" className="input" value={form.source} onChange={set("source")}>
            {JOB_REQUIREMENT_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select title="Status" className="input" value={form.status} onChange={set("status")}>
            {JOB_REQUIREMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select title="Priority" className="input" value={form.priority} onChange={set("priority")}>
            {JOB_REQUIREMENT_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Notes"><textarea title="Notes" className="textarea" rows={3} value={form.notes} onChange={set("notes")} /></Field>
    </div>
  );
}
