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
  email: string;
  phone: string | null;
  location: string | null;
  visa_status: string | null;
  availability: string | null;
  expected_rate: string | null;
  primary_skill: string | null;
  secondary_skills: string | null;
  total_experience: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type EmployeeCreate = Omit<Employee, "id" | "created_at" | "updated_at">;
export type EmployeeUpdate = Partial<EmployeeCreate>;

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
  parsed_certifications: string[];
  parsed_education: string[];
  parsed_summary: string | null;
  is_primary: boolean;
  uploaded_at: string;
  updated_at: string;
}

// ATS-only (private) — manually created job requirements, never exposed to
// the public job-seeker tools above.
export type JobRequirementWorkType = "Remote" | "Hybrid" | "Onsite";
export type JobRequirementStatus =
  | "New" | "Parsed" | "Ready for Match" | "Matched" | "Sent to Employee"
  | "Interested" | "Submitted" | "Interview" | "Selected" | "Rejected" | "Closed";
export type JobRequirementPriority = "Low" | "Medium" | "High" | "Urgent";
export type JobRequirementSource = "Manual" | "Email Copy/Paste" | "Zoho Mail Later" | "Chrome Extension Later";

export interface JobRequirement {
  id: number;
  job_title: string;
  vendor: string | null;
  recruiter_name: string | null;
  recruiter_email: string | null;
  recruiter_phone: string | null;
  client: string | null;
  end_client: string | null;
  location: string | null;
  work_type: string | null;
  rate: string | null;
  duration: string | null;
  visa_requirement: string | null;
  required_skills: string[];
  preferred_skills: string[];
  job_description: string | null;
  raw_email_text: string | null;
  submission_deadline: string | null;
  status: string;
  priority: string;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type JobRequirementCreate = Omit<JobRequirement, "id" | "created_at" | "updated_at">;
export type JobRequirementUpdate = Partial<JobRequirementCreate>;

export interface JobRequirementParseResult {
  job_title: string;
  vendor: string;
  recruiter_name: string;
  recruiter_email: string;
  recruiter_phone: string;
  client: string;
  end_client: string;
  location: string;
  work_type: string;
  rate: string;
  duration: string;
  visa_requirement: string;
  required_skills: string[];
  preferred_skills: string[];
  submission_deadline: string;
  summary: string;
}
