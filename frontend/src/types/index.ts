export interface User {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
}

export type ActivityType =
  | "resume_analyzed"
  | "job_matched"
  | "job_saved"
  | "bullets_generated"
  | "questions_generated"
  | "cover_letter_generated"
  | "job_added"
  | "status_changed"
  | "job_deleted";

export interface ActivityEntry {
  id: number;
  activity_type: ActivityType;
  summary: string;
  detail: string | null;
  created_at: string;
}

export interface ResumeHistoryEntry {
  id: number;
  filename: string;
  resume_text: string;
  ats_score: number;
  analysis: ResumeAnalysis;
  created_at: string;
}

export interface MatchHistoryEntry {
  id: number;
  resume_text: string;
  job_description: string;
  match: MatchResult;
  created_at: string;
}

export interface CoverLetterHistoryEntry {
  id: number;
  resume_text: string;
  job_description: string;
  company_name: string | null;
  tone: string | null;
  content: string;
  created_at: string;
}

export type ReminderType = "follow_up_email" | "interview" | "thank_you_email" | "application_deadline";

export interface JobApplication {
  id: number;
  company: string;
  role: string;
  status: "Applied" | "Interviewing" | "Offer" | "Rejected" | "Saved";
  date_applied: string | null;
  job_url: string | null;
  notes: string | null;
  salary_range: string | null;
  location: string | null;
  work_type: string | null;
  recruiter_name: string | null;
  recruiter_email: string | null;
  follow_up_date: string | null;
  reminder_type: ReminderType | null;
  created_at: string;
}

export type JobApplicationStatus = JobApplication["status"];

export interface JobStats {
  total: number;
  by_status: Record<string, number>;
}

export interface ResumeAnalysis {
  ats_score: number;
  formatting_score: number;
  content_score: number;
  overall_summary: string;
  strengths: string[];
  weaknesses: string[];
  skills_identified: { technical: string[]; soft: string[] };
  experience_summary: string;
  education_summary: string;
  recommendations: { priority: "high" | "medium" | "low"; suggestion: string }[];
  keywords_missing: string[];
  formatting_suggestions: string[];
}

export type MatchRecommendation = "Strong Match" | "Good Match" | "Weak Match" | "Not Recommended";

export interface MatchResult {
  match_score: number;
  likelihood: "low" | "medium" | "high";
  ats_verdict: string;
  recommendation: MatchRecommendation;
  skills_match_score: number;
  experience_match_score: number;
  education_match_score: number;
  keyword_match_score: number;
  formatting_score: number;
  formatting_issues: string[];
  keyword_report: {
    matched: { keyword: string; jd_count: number; resume_count: number }[];
    missing: { keyword: string; jd_count: number }[];
  };
  summary: string;
  matching_skills: string[];
  missing_skills: string[];
  matching_experience: string[];
  gaps: string[];
  tailoring_suggestions: { section: string; suggestion: string }[];
  keywords_to_add: string[];
  interview_preparation: string[];
}

export interface ExperienceEntry { title: string; company: string; start?: string; end?: string; description?: string }
export interface EducationEntry { school: string; degree?: string; start?: string; end?: string }
export interface Profile {
  phone: string | null;
  location: string | null;
  headline: string | null;
  bio: string | null;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  linkedin_url: string | null;
  portfolio_url: string | null;
  updated_at: string | null;
}

// ATS-only (private) — employee/consultant records, never exposed to the
// public job-seeker tools above.
export type VisaStatus = "US Citizen" | "Green Card" | "H1B" | "H4 EAD" | "OPT" | "CPT" | "Other";
export type Availability = "Immediate" | "1 Week" | "2 Weeks" | "On Project" | "Not Available";
export type EmployeeStatus = "Active" | "Inactive" | "On Project" | "Bench" | "Do Not Contact";

export interface Employee {
  id: number;
  name: string;
  employee_code: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  email: string;
  personal_email: string | null;
  company_email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  location: string | null;
  current_location: string | null;
  willing_to_relocate: boolean | null;
  preferred_locations: string | null;
  work_authorization: string | null;
  visa_status: string | null;
  visa_expiration_date: string | null;
  sponsorship_required: boolean | null;
  employment_type: string | null;
  current_employer: string | null;
  current_job_title: string | null;
  primary_skill: string | null;
  secondary_skills: string | null;
  total_experience: string | null;
  relevant_experience_years: string | null;
  availability: string | null;
  available_from: string | null;
  current_rate: string | null;
  expected_rate: string | null;
  rate_type: string | null;
  remote_preference: string | null;
  status: string;
  source: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EmployeeCreate = Partial<Omit<Employee, "id" | "created_at" | "updated_at" | "created_by">> & {
  name: string;
  email: string;
};
export type EmployeeUpdate = Partial<EmployeeCreate>;

export interface EmployeeListItem extends Employee {
  resume_count: number;
  resume_status: "None" | "Parsed" | "Failed";
  has_primary_resume: boolean;
}

export interface EmployeeListResponse {
  items: EmployeeListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface EmployeeListParams {
  q?: string;
  status?: string;
  availability?: string;
  work_authorization?: string;
  primary_skill?: string;
  location?: string;
  employment_type?: string;
  archived?: boolean;
  page?: number;
  page_size?: number;
}

export const EMPLOYEE_STATUSES = [
  "Active", "Bench", "On Project", "Available Soon", "Inactive", "Do Not Contact", "Former Employee",
] as const;
export const EMPLOYMENT_TYPES = [
  "W2 Employee", "C2C Consultant", "1099 Consultant", "Contractor", "Candidate", "Internal Employee",
] as const;
export const EMPLOYEE_AVAILABILITIES = [
  "Immediate", "One Week", "Two Weeks", "Thirty Days", "On Project", "Not Available",
] as const;

// CRM
export const ORGANIZATION_TYPES = [
  "Staffing Vendor", "Direct Client", "End Client", "Implementation Partner",
  "Managed Service Provider", "Government Agency", "Other",
] as const;
export const ORGANIZATION_STATUSES = [
  "Active", "Prospect", "Inactive", "Blocked", "Do Not Work With",
] as const;
export const CONTACT_TYPES = [
  "Recruiter", "Account Manager", "Client Manager", "Hiring Manager",
  "Vendor Manager", "HR Contact", "Other",
] as const;
export const CONTACT_STATUSES = [
  "Active", "Inactive", "Do Not Contact", "Bounced Email", "Unsubscribed",
] as const;
export const ACTIVITY_TYPES = [
  "Email Received", "Email Sent", "Phone Call", "Follow-Up", "Meeting", "Note",
  "Job Received", "Resume Sent", "Interview Scheduled", "Feedback Received", "Other",
] as const;

export interface CRMOrganization {
  id: number;
  organization_name: string;
  organization_type: string;
  website: string | null;
  email_domain: string | null;
  industry: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  status: string;
  preferred_vendor_status: string | null;
  payment_terms: string | null;
  contract_status: string | null;
  msa_status: string | null;
  needs_review: boolean;
  source: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CRMOrganizationCreate = Partial<Omit<CRMOrganization, "id" | "created_at" | "updated_at" | "created_by" | "needs_review" | "source">> & {
  organization_name: string;
};
export type CRMOrganizationUpdate = Partial<CRMOrganizationCreate> & { needs_review?: boolean };

export interface CRMContact {
  id: number;
  organization_id: number | null;
  organization_name: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  contact_type: string;
  status: string;
  linkedin_url: string | null;
  preferred_contact_method: string | null;
  needs_review: boolean;
  source: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CRMContactCreate = Partial<Omit<CRMContact, "id" | "created_at" | "updated_at" | "created_by" | "needs_review" | "source" | "organization_name" | "last_contacted_at">>;
export type CRMContactUpdate = Partial<CRMContactCreate> & { needs_review?: boolean };

export interface CRMActivity {
  id: number;
  activity_type: string;
  subject: string | null;
  description: string | null;
  organization_id: number | null;
  contact_id: number | null;
  employee_id: number | null;
  job_requirement_id: number | null;
  submission_id: number | null;
  activity_date: string;
  due_date: string | null;
  status: string;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CRMActivityCreate = Partial<Omit<CRMActivity, "id" | "activity_date" | "created_at" | "updated_at" | "created_by">>;

export interface EmployeeResume {
  id: number;
  employee_id: number;
  filename: string;
  file_type: string;
  file_size: number;
  file_path: string;
  resume_text: string | null;
  parsed_name: string | null;
  parsed_email: string | null;
  parsed_phone: string | null;
  parsed_skills: string[];
  parsed_primary_skill: string | null;
  parsed_total_experience: string | null;
  parsed_job_titles: string[];
  parsed_clients: string[];
  parsed_industries: string[];
  parsed_certifications: string[];
  parsed_education: string[];
  parsed_summary: string | null;
  parsed_data: Record<string, unknown> | null;
  parsing_status: "parsed" | "failed" | "pending";
  is_primary: boolean;
  version_number: number | null;
  uploaded_at: string;
  updated_at: string;
}

export interface ResumeFieldSuggestion {
  field: string;
  label: string;
  current_value: string;
  resume_value: string;
}

export interface ResumeUploadResult {
  resume: EmployeeResume;
  employee: Employee;
  parsed: Record<string, unknown>;
  parsing_status: "parsed" | "failed" | "pending";
  applied_fields: Record<string, string>;
  suggestions: ResumeFieldSuggestion[];
}

// Human-readable labels for employee fields auto-filled from resumes.
export const EMPLOYEE_FIELD_LABELS: Record<string, string> = {
  first_name: "First Name",
  middle_name: "Middle Name",
  last_name: "Last Name",
  personal_email: "Personal Email",
  phone: "Phone",
  current_location: "Current Location",
  current_job_title: "Current Job Title",
  primary_skill: "Primary Skill",
  secondary_skills: "Secondary Skills",
  total_experience: "Total Experience (years)",
  relevant_experience_years: "Relevant Experience (years)",
  linkedin_url: "LinkedIn URL",
  notes: "Professional Summary",
};

// Employee fields that may be auto-filled from a parsed resume (used for the
// "Filled from resume" badges on the edit form).
export const RESUME_AUTOFILL_FIELDS = Object.keys(EMPLOYEE_FIELD_LABELS);

// ATS-only (private) — manually created job requirements, never exposed to
// the public job-seeker tools above.
export type JobRequirementWorkType = "Remote" | "Hybrid" | "Onsite";
export const JOB_REQUIREMENT_STATUSES = [
  "New", "Needs Review", "Parsed", "Ready for Match", "Matched", "Sent to Employee",
  "Employee Interested", "Submitted", "Interview", "Selected", "Rejected",
  "On Hold", "Closed", "Duplicate", "Spam",
] as const;
export type JobRequirementStatus = typeof JOB_REQUIREMENT_STATUSES[number];
export const JOB_REQUIREMENT_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export type JobRequirementPriority = typeof JOB_REQUIREMENT_PRIORITIES[number];
export const JOB_REQUIREMENT_SOURCES = [
  "Manual", "Email Copy/Paste", "Zoho Mail", "Chrome Extension", "Referral", "Other",
] as const;
export type JobRequirementSource = typeof JOB_REQUIREMENT_SOURCES[number];

export interface JobRequirement {
  id: number;
  job_title: string;
  external_job_id: string | null;
  job_reference_number: string | null;
  vendor: string | null;
  vendor_id: number | null;
  recruiter_name: string | null;
  recruiter_email: string | null;
  recruiter_phone: string | null;
  recruiter_contact_id: number | null;
  client: string | null;
  client_id: number | null;
  end_client: string | null;
  end_client_id: number | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  work_type: string | null;
  employment_type: string | null;
  contract_type: string | null;
  rate: string | null;
  rate_min: string | null;
  rate_max: string | null;
  rate_currency: string | null;
  rate_type: string | null;
  duration: string | null;
  visa_requirement: string | null;
  clearance_requirement: string | null;
  required_skills: string[];
  preferred_skills: string[];
  minimum_experience: string | null;
  education_requirement: string | null;
  certification_requirement: string | null;
  job_description: string | null;
  raw_email_text: string | null;
  submission_instructions: string | null;
  submission_deadline: string | null;
  number_of_openings: number | null;
  status: string;
  priority: string;
  source: string;
  notes: string | null;
  vendor_name: string | null;
  client_name: string | null;
  end_client_name: string | null;
  recruiter_contact_name: string | null;
  created_by: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export type JobRequirementCreate = Omit<
  JobRequirement,
  "id" | "created_at" | "updated_at" | "created_by" | "vendor_name" | "client_name" | "end_client_name" | "recruiter_contact_name"
>;
export type JobRequirementUpdate = Partial<JobRequirementCreate>;

export interface JobRequirementListParams {
  q?: string;
  status?: string;
  work_type?: string;
  priority?: string;
  source?: string;
  vendor?: string;
  client?: string;
  vendor_id?: number;
  client_id?: number;
  end_client_id?: number;
  recruiter_contact_id?: number;
  organization_id?: number;
  page?: number;
  page_size?: number;
}

export interface JobRequirementListResponse {
  items: JobRequirement[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface JobRequirementParseResult {
  job_title: string;
  job_reference_number: string;
  vendor: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_phone: string;
  client: string;
  end_client: string;
  location: string;
  work_type: string;
  employment_type: string;
  contract_type: string;
  rate_min: string | null;
  rate_max: string | null;
  rate_currency: string;
  rate_type: string;
  duration: string;
  visa_requirement: string;
  clearance_requirement: string;
  required_skills: string[];
  preferred_skills: string[];
  minimum_experience: string;
  education_requirement: string;
  certification_requirement: string;
  submission_deadline: string;
  number_of_openings: number | null;
  submission_instructions: string;
  summary: string;
}

export interface JobEmployeeMatch {
  employee_id: number;
  employee_name: string;
  primary_skill: string | null;
  match_score: number;
  matching_skills: string[];
  missing_skills: string[];
  compatibility_warnings: string[];
  match_reason: string;
  work_authorization: string | null;
  availability: string | null;
  expected_rate: string | null;
  total_experience: string | null;
}
