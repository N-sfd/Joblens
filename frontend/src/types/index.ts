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
  recruiter_contact: string | null;
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
}

export interface MatchResult {
  match_score: number;
  likelihood: "low" | "medium" | "high";
  ats_verdict: string;
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
