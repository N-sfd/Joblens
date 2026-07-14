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
  | "job_deleted"
  | "negotiation_advice"
  | "job_imported"
  | "application_opened";

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

export type JobApplicationStatusValue =
  | "Saved" | "Application Opened" | "Application In Progress" | "Applied"
  | "Recruiter Contacted" | "Interviewing" | "Offer" | "Rejected" | "Withdrawn";

export interface JobApplication {
  id: number;
  company: string;
  role: string;
  status: JobApplicationStatusValue;
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
  // Set when this row was saved from a published CRM/ATS job (Discover Jobs
  // / Job Details) rather than added manually — links back to the full job.
  source_job_requirement_id: number | null;
  // Apply Options workflow (Apply Now / Contact Recruiter) — see api.ts.
  application_source: string | null;
  application_method: "employer_website" | "recruiter_email" | "manual" | null;
  application_opened_at: string | null;
  applied_at: string | null;
  recruiter_contacted_at: string | null;
  last_activity_at: string | null;
  // Raw JSON string (JobRequirement-shaped) captured at save time — parse
  // with JSON.parse when the source job is no longer live. See Job Details'
  // historical-snapshot fallback.
  job_snapshot_json: string | null;
  created_at: string;
  archived_at?: string | null;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  action_required?: boolean | null;
  action_required_reason?: string | null;
  last_user_activity_at?: string | null;
  reminder_completed_at?: string | null;
  // Optional Apply Options fields when status saved but reminder creation failed.
  reminder_created?: boolean | null;
  warning_code?: string | null;
  warning_message?: string | null;
}

export interface ApplicationStatusSummary {
  total: number;
  by_status: Record<string, number>;
  applications_opened: number;
  applications_in_progress: number;
  applied: number;
  recruiter_contacts: number;
  interviews: number;
  offers: number;
  follow_ups_due: number;
  action_needed: number;
  opened_this_week: number;
  applied_this_week: number;
  percentages: Record<string, number>;
}

export interface ApplicationStatusListItem {
  id: number;
  company: string;
  role: string;
  status: string;
  location: string | null;
  work_type: string | null;
  application_method: string | null;
  application_method_label: string | null;
  application_source: string | null;
  job_url: string | null;
  has_application_url: boolean;
  source_job_requirement_id: number | null;
  source_job_available: boolean;
  source_job_closed: boolean;
  job_reference_number: string | null;
  client: string | null;
  end_client: string | null;
  recruiter_name: string | null;
  recruiter_email: string | null;
  application_opened_at: string | null;
  recruiter_contacted_at: string | null;
  applied_at: string | null;
  last_activity_at: string | null;
  follow_up_date: string | null;
  reminder_type: string | null;
  reminder_completed_at: string | null;
  reminder_status: string | null;
  action_required: boolean;
  action_required_reason: string | null;
  archived_at: string | null;
  match_score: number | null;
  created_at: string | null;
}

export interface ApplicationStatusListResponse {
  items: ApplicationStatusListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: ApplicationStatusSummary;
}

export interface ApplicationNote {
  id: number;
  job_application_id: number;
  content: string;
  created_at: string;
  updated_at?: string | null;
}

export interface ApplicationTimelineEvent {
  id?: number | null;
  event_type: string;
  summary: string;
  detail?: string | null;
  occurred_at: string;
  source: string;
}

export interface ApplicationStatusDetail {
  application: JobApplication;
  job_snapshot: Record<string, unknown> | null;
  source_job_available: boolean;
  source_job_closed: boolean;
  application_method_label: string | null;
  match_score: number | null;
  match_summary: string | null;
  timeline: ApplicationTimelineEvent[];
  notes: ApplicationNote[];
  reminder_status: string | null;
  action_required: boolean;
  action_required_reason: string | null;
}

export type JobApplicationStatus = JobApplication["status"];

export interface JobPostingParseResult {
  company: string;
  role: string;
  location: string;
  work_type: string;
  salary_range: string;
  notes: string;
}

export interface NegotiationAdvice {
  market_context: string;
  talking_points: string[];
  counter_offer_email: { subject: string; body: string };
}

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
  learning_resources: { skill: string; suggestion: string }[];
}

export interface ExperienceEntry { title: string; company: string; start?: string; end?: string; description?: string }
export interface EducationEntry { school: string; degree?: string; start?: string; end?: string }
export interface ProjectEntry { name: string; description?: string; url?: string; technologies?: string[] }
export interface CertificationEntry {
  name: string; issuer?: string; date_earned?: string; expiration?: string; credential_url?: string
}
export interface ProfessionalLinks {
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  personal_website?: string | null;
  other?: string | null;
}
export interface WorkAuthorization {
  applying_country?: string | null;
  current_authorization?: string | null;
  visa_type?: string | null;
  sponsorship_required_now?: boolean | null;
  sponsorship_required_future?: boolean | null;
  authorization_expiration?: string | null;
  authorized_countries?: string[] | null;
  willing_to_relocate?: boolean | null;
  security_clearance?: boolean | null;
  clearance_level?: string | null;
  user_confirmed?: boolean;
  confirmed_at?: string | null;
}
export interface JobPreferences {
  preferred_titles?: string[] | null;
  preferred_industries?: string[] | null;
  preferred_locations?: string[] | null;
  work_arrangement?: string | null;
  employment_types?: string[] | null;
  contract_preference?: string | null;
  minimum_salary?: number | null;
  minimum_hourly_rate?: number | null;
  preferred_currency?: string | null;
  willing_to_travel?: boolean | null;
  max_travel_percentage?: number | null;
  relocation_preference?: string | null;
  available_start_date?: string | null;
}
export interface ProfileCompletenessSection {
  key: string;
  label: string;
  weight: number;
  complete: boolean;
  missing_fields: string[];
}
export interface ProfileCompleteness {
  overall_percentage: number;
  completed_sections: string[];
  incomplete_sections: string[];
  missing_fields: string[];
  recommended_next_action: string | null;
  sections: ProfileCompletenessSection[];
}
export type ApplicationReadinessStatus = "Ready" | "Mostly Ready" | "Needs Information" | "Not Ready";
export interface ApplicationReadiness {
  status: ApplicationReadinessStatus;
  score: number;
  checks: Record<string, boolean>;
  missing: string[];
}
export interface ProfileDocumentItem {
  id: number;
  kind: "resume" | "cover_letter" | string;
  label: string;
  created_at: string | null;
  is_default: boolean;
}
export type AnswerReusePolicy = "always_ask" | "reuse_after_review" | "reuse_automatically" | "never_save";
export interface ApplicationAnswer {
  id: number;
  normalized_question_key: string;
  display_question: string;
  answer: string;
  answer_type: string;
  is_sensitive: boolean;
  approval_status: string;
  reuse_policy: AnswerReusePolicy | string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at?: string | null;
}
export interface Profile {
  email?: string | null;
  email_editable?: boolean;
  full_name?: string | null;
  preferred_name?: string | null;
  phone: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  location: string | null;
  current_location?: string | null;
  headline: string | null;
  bio: string | null;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects?: ProjectEntry[];
  certifications?: CertificationEntry[];
  linkedin_url: string | null;
  portfolio_url: string | null;
  professional_links?: ProfessionalLinks;
  work_authorization?: WorkAuthorization;
  job_preferences?: JobPreferences;
  default_resume_id?: number | null;
  default_cover_letter_id?: number | null;
  documents?: ProfileDocumentItem[];
  application_answers?: ApplicationAnswer[];
  completeness?: ProfileCompleteness | null;
  readiness?: ApplicationReadiness | null;
  profile_completion_percentage?: number | null;
  profile_completed_at?: string | null;
  updated_at: string | null;
}
export type ProfileUpdate = Partial<Omit<Profile, "email" | "email_editable" | "documents" | "application_answers" | "completeness" | "readiness" | "updated_at" | "profile_completed_at">>;


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

export interface EmployeeResumeParsed {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  full_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  current_location?: string;
  current_job_title?: string;
  primary_skill?: string;
  secondary_skills?: string[];
  skills?: string[];
  total_experience_years?: number | string | null;
  total_experience?: string;
  relevant_experience_years?: number | string | null;
  job_titles?: string[];
  clients?: string[];
  industries?: string[];
  certifications?: string[];
  education?: string[];
  linkedin_url?: string;
  professional_summary?: string;
  summary?: string;
}

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
  "Open", "New", "Needs Review", "Parsed", "Ready for Match", "Matched", "Sent to Employee",
  "Employee Interested", "Submitted", "Interview", "Selected", "Rejected",
  "On Hold", "Closed", "Duplicate", "Spam",
] as const;
export type JobRequirementStatus = typeof JOB_REQUIREMENT_STATUSES[number];
export const JOB_REQUIREMENT_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export type JobRequirementPriority = typeof JOB_REQUIREMENT_PRIORITIES[number];
export const JOB_REVIEW_STATUSES = ["Draft", "Approved", "Rejected"] as const;
export type JobReviewStatus = typeof JOB_REVIEW_STATUSES[number];
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
  // Direct employer application link, when provided — powers "Apply on
  // Employer Website" in the Apply Options modal.
  application_url: string | null;
  // Phase 5 M0 — classified ATS/platform for application_url (greenhouse, lever, …).
  application_platform: string | null;
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
  // Recruiter opt-in to surface this requisition in the public Job Matcher —
  // see PublicJobListing/getPublicJob and types below.
  published_for_matching: boolean;
  // Editorial gate: "Draft" | "Approved" | "Rejected". Independent of
  // `status` (the operational pipeline) and `published_for_matching` (the
  // publish toggle) — all three must align for public visibility.
  review_status: string;
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

// Public (candidate-facing) browse of published ATS jobs — see
// backend/routers/public_jobs.py. Not Clerk-gated; same guest/user pattern
// as the rest of the public app.
export interface PublicJobListing {
  id: number;
  job_title: string;
  job_reference_number: string | null;
  client: string | null;
  vendor: string | null;
  location: string | null;
  work_type: string | null;
  employment_type: string | null;
  rate: string | null;
  required_skills: string[];
  /** Candidate-facing badge: Email Imported | Published Job | Manually Added */
  source: string | null;
  application_platform?: string | null;
  application_url?: string | null;
  recruiter_name?: string | null;
  received_at: string | null;
}

export interface PublicJobListParams {
  q?: string;
  location?: string;
  work_type?: string;
  employment_type?: string;
  client?: string;
  source?: string;
  skills?: string;
  since?: string;
  page?: number;
  page_size?: number;
}

export interface PublicJobListResponse {
  items: PublicJobListing[];
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
  application_url: string;
  application_platform: string;
  summary: string;
}

export interface JobEmployeeMatch {
  employee_id: number;
  employee_name: string;
  primary_skill: string | null;
  match_score: number;
  matching_skills: string[];
  preferred_matching_skills: string[];
  missing_skills: string[];
  compatibility_warnings: string[];
  match_reason: string;
  score_breakdown: Record<string, number>;
  work_authorization: string | null;
  availability: string | null;
  expected_rate: string | null;
  total_experience: string | null;
}

export const EMPLOYEE_RESPONSE_VALUES = [
  "Pending", "Interested", "Not Interested", "Need More Information", "Not Available",
] as const;
export type EmployeeResponse = typeof EMPLOYEE_RESPONSE_VALUES[number];

export interface JobSend {
  id: number;
  job_requirement_id: number;
  employee_id: number;
  job_title: string | null;
  employee_name: string | null;
  employee_email: string | null;
  sent_by: string | null;
  sent_at: string | null;
  message_subject: string | null;
  message_body: string | null;
  delivery_status: string;
  employee_response: string;
  response_at: string | null;
  match_score_at_send: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobSendDraft {
  subject: string;
  body: string;
  employee_email: string | null;
  employee_name: string | null;
}

export const SUBMISSION_STATUSES = [
  "Draft", "Employee Contacted", "Employee Interested", "Submitted",
  "Client Review", "Interview", "Offer", "Selected", "Rejected", "Withdrawn", "Closed",
] as const;
export type SubmissionStatus = typeof SUBMISSION_STATUSES[number];

export interface Submission {
  id: number;
  job_requirement_id: number;
  employee_id: number;
  recruiter_contact_id: number | null;
  vendor_id: number | null;
  job_employee_send_id: number | null;
  submitted_rate: string | null;
  rate_type: string | null;
  submission_date: string | null;
  status: string;
  vendor_reference: string | null;
  notes: string | null;
  job_title: string | null;
  employee_name: string | null;
  vendor_name: string | null;
  recruiter_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionCreate {
  job_requirement_id: number;
  employee_id: number;
  recruiter_contact_id?: number | null;
  vendor_id?: number | null;
  job_employee_send_id?: number | null;
  submitted_rate?: string | null;
  rate_type?: string | null;
  submission_date?: string | null;
  status?: string;
  vendor_reference?: string | null;
  notes?: string | null;
}

export interface SubmissionUpdate {
  recruiter_contact_id?: number | null;
  vendor_id?: number | null;
  submitted_rate?: string | null;
  rate_type?: string | null;
  submission_date?: string | null;
  status?: string;
  vendor_reference?: string | null;
  notes?: string | null;
}

export const INTERVIEW_STATUSES = ["Scheduled", "Completed", "Cancelled", "No Show"] as const;
export const INTERVIEW_OUTCOMES = ["Pending", "Passed", "Failed"] as const;

export interface Interview {
  id: number;
  submission_id: number;
  scheduled_at: string | null;
  interview_type: string | null;
  status: string;
  interviewer_name: string | null;
  location_or_link: string | null;
  notes: string | null;
  feedback: string | null;
  outcome: string;
  job_title: string | null;
  employee_name: string | null;
  submission_status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewCreate {
  submission_id: number;
  scheduled_at?: string | null;
  interview_type?: string | null;
  status?: string;
  interviewer_name?: string | null;
  location_or_link?: string | null;
  notes?: string | null;
  feedback?: string | null;
  outcome?: string;
}

export interface InterviewUpdate {
  scheduled_at?: string | null;
  interview_type?: string | null;
  status?: string;
  interviewer_name?: string | null;
  location_or_link?: string | null;
  notes?: string | null;
  feedback?: string | null;
  outcome?: string;
}

export const OFFER_STATUSES = ["Draft", "Extended", "Accepted", "Declined", "Withdrawn"] as const;
export const ONBOARDING_STATUSES = ["Not Started", "In Progress", "Completed"] as const;

export interface Offer {
  id: number;
  submission_id: number;
  offered_rate: string | null;
  rate_type: string | null;
  start_date: string | null;
  offer_date: string | null;
  expiry_date: string | null;
  status: string;
  onboarding_status: string;
  notes: string | null;
  job_title: string | null;
  employee_name: string | null;
  submission_status: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfferCreate {
  submission_id: number;
  offered_rate?: string | null;
  rate_type?: string | null;
  start_date?: string | null;
  offer_date?: string | null;
  expiry_date?: string | null;
  status?: string;
  onboarding_status?: string;
  notes?: string | null;
}

export interface OfferUpdate {
  offered_rate?: string | null;
  rate_type?: string | null;
  start_date?: string | null;
  offer_date?: string | null;
  expiry_date?: string | null;
  status?: string;
  onboarding_status?: string;
  notes?: string | null;
}

export interface AtsDashboardRecentJob {
  id: number;
  job_title: string;
  vendor: string | null;
}

export interface AtsDashboardRecentEmployee {
  id: number;
  name: string;
  primary_skill: string | null;
}

export interface AtsDashboardDeadline {
  id: number;
  job_title: string;
  submission_deadline: string | null;
  vendor: string | null;
}

export interface AtsDashboardEmailItem {
  id: number;
  subject: string | null;
  from_name: string | null;
  classification: string;
  imported_at: string;
}

export interface AtsDashboardJobItem {
  id: number;
  job_title: string;
  vendor: string | null;
  status: string;
}

export interface AtsDashboardMatchItem {
  job_requirement_id: number;
  employee_id: number;
  job_title: string | null;
  employee_name: string | null;
  match_score: number | null;
}

export interface AtsDashboardActivityItem {
  id: number;
  activity_type: string;
  subject: string | null;
  activity_date: string;
  status: string;
}

export interface AtsDashboardStats {
  total_employees?: number;
  active_employees: number;
  bench_employees: number;
  available_now?: number;
  open_jobs: number;
  new_jobs_today?: number;
  new_email_jobs: number;
  pending_matches: number;
  submissions: number;
  pending_employee_responses: number;
  zoho_emails_awaiting_review?: number;
  interviews: number;
  offers: number;
  organizations: number;
  contacts: number;
  recent_jobs: AtsDashboardRecentJob[];
  recent_employees: AtsDashboardRecentEmployee[];
  upcoming_deadlines?: AtsDashboardDeadline[];
  recent_zoho_emails?: AtsDashboardEmailItem[];
  jobs_needing_review?: AtsDashboardJobItem[];
  top_matches?: AtsDashboardMatchItem[];
  recent_activities?: AtsDashboardActivityItem[];
}

export interface ZohoConnectionStatus {
  connected: boolean;
  status: string;
  mailbox_email: string | null;
  zoho_account_id: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface ZohoSyncResponse {
  imported: number;
  skipped: number;
  total_fetched: number;
}

export interface ImportedEmail {
  id: number;
  zoho_message_id: string;
  from_address: string | null;
  from_name: string | null;
  subject: string | null;
  received_at: string | null;
  classification: string;
  needs_review: boolean;
  job_requirement_id: number | null;
  import_status: string;
  preview: string | null;
  imported_at: string;
}

export interface ImportedEmailDetail extends ImportedEmail {
  body_text: string | null;
  body_html: string | null;
}

export interface EmailClassificationResult {
  id: number;
  classification: string;
  reason: string;
  needs_review: boolean;
}

export interface EmailClassifyBatchResult {
  classified: number;
  results: EmailClassificationResult[];
}

export interface CreateJobFromEmailResult {
  email: ImportedEmail;
  job: JobRequirement;
}

export const EMAIL_CLASSIFICATIONS = [
  "unclassified", "job_req", "candidate", "spam", "other",
] as const;

export const IMPORT_STATUSES = [
  "pending", "imported", "linked", "ignored", "archived", "failed",
] as const;
export type EmailClassification = typeof EMAIL_CLASSIFICATIONS[number];
