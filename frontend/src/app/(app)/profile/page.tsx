"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type {
  Profile,
  ProfileUpdate,
  ApplicationAnswer,
  WorkAuthorization,
  JobPreferences,
  ProfessionalLinks,
  ExperienceEntry,
  EducationEntry,
  ProjectEntry,
  CertificationEntry,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import AuthModal from "@/components/AuthModal";
import {
  Loader2, CheckCircle, AlertCircle, Save, UserRound, Briefcase,
  GraduationCap, Link2, Shield, SlidersHorizontal, MessageSquareText,
  FileText, Sparkles,
} from "lucide-react";
import clsx from "clsx";

type SectionKey =
  | "personal" | "summary" | "skills" | "experience" | "education" | "projects" | "certifications"
  | "links" | "work_authorization" | "job_preferences" | "answers" | "documents";

const SECTIONS: { key: SectionKey; label: string; icon: typeof UserRound }[] = [
  { key: "personal", label: "Personal", icon: UserRound },
  { key: "summary", label: "Summary", icon: Sparkles },
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "experience", label: "Experience", icon: Briefcase },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "projects", label: "Projects", icon: Briefcase },
  { key: "certifications", label: "Certs", icon: GraduationCap },
  { key: "links", label: "Links", icon: Link2 },
  { key: "work_authorization", label: "Work Auth", icon: Shield },
  { key: "job_preferences", label: "Preferences", icon: SlidersHorizontal },
  { key: "answers", label: "Answers", icon: MessageSquareText },
  { key: "documents", label: "Documents", icon: FileText },
];

type SaveState = "idle" | "saving" | "saved" | "failed";

function csv(list?: string[] | null): string {
  return (list || []).join(", ");
}
function fromCsv(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

const emptyExp = (): ExperienceEntry => ({ title: "", company: "", start: "", end: "", description: "" });
const emptyEdu = (): EducationEntry => ({ school: "", degree: "", start: "", end: "" });
const emptyProject = (): ProjectEntry => ({ name: "", description: "", url: "" });
const emptyCert = (): CertificationEntry => ({ name: "", issuer: "", date_earned: "" });

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [section, setSection] = useState<SectionKey>("personal");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Editable draft fields
  const [draft, setDraft] = useState<ProfileUpdate>({});
  const [skillsText, setSkillsText] = useState("");
  const [links, setLinks] = useState<ProfessionalLinks>({});
  const [workAuth, setWorkAuth] = useState<WorkAuthorization>({ user_confirmed: false });
  const [prefs, setPrefs] = useState<JobPreferences>({ preferred_currency: "USD" });
  const [experience, setExperience] = useState<ExperienceEntry[]>([emptyExp()]);
  const [education, setEducation] = useState<EducationEntry[]>([emptyEdu()]);
  const [projects, setProjects] = useState<ProjectEntry[]>([emptyProject()]);
  const [certifications, setCertifications] = useState<CertificationEntry[]>([emptyCert()]);

  // New answer form
  const [answerKey, setAnswerKey] = useState("why_interested");
  const [answerQuestion, setAnswerQuestion] = useState("Why are you interested in this role?");
  const [answerText, setAnswerText] = useState("");
  const [answerSaving, setAnswerSaving] = useState(false);

  const applyProfile = useCallback((p: Profile) => {
    setProfile(p);
    setDraft({
      full_name: p.full_name ?? "",
      preferred_name: p.preferred_name ?? "",
      phone: p.phone ?? "",
      address_line_1: p.address_line_1 ?? "",
      address_line_2: p.address_line_2 ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      postal_code: p.postal_code ?? "",
      country: p.country ?? "",
      location: p.location ?? "",
      current_location: p.current_location ?? "",
      headline: p.headline ?? "",
      bio: p.bio ?? "",
      default_resume_id: p.default_resume_id ?? null,
      default_cover_letter_id: p.default_cover_letter_id ?? null,
    });
    setSkillsText((p.skills || []).join(", "));
    setLinks(p.professional_links || {
      linkedin: p.linkedin_url,
      portfolio: p.portfolio_url,
    });
    setWorkAuth(p.work_authorization || { user_confirmed: false });
    setPrefs(p.job_preferences || { preferred_currency: "USD" });
    setExperience(p.experience?.length ? p.experience : [emptyExp()]);
    setEducation(p.education?.length ? p.education : [emptyEdu()]);
    setProjects(p.projects?.length ? p.projects : [emptyProject()]);
    setCertifications(p.certifications?.length ? p.certifications : [emptyCert()]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const p = await api.getProfile();
      applyProfile(p);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load profile.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [applyProfile]);

  useEffect(() => { load(); }, [load]);

  const goSection = (key: SectionKey) => {
    setSection(key);
    setFieldError(null);
    setSaveError(null);
  };

  const saveProfile = async (payload: ProfileUpdate) => {
    setSaveState("saving");
    setSaveError(null);
    setFieldError(null);
    try {
      const updated = await api.updateProfile(payload);
      applyProfile(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      setSaveState("failed");
      if (/invalid|url|required|unavailable/i.test(msg)) setFieldError(msg);
      else setSaveError(msg);
    }
  };

  const saveCurrentSection = async () => {
    if (section === "personal") {
      await saveProfile({
        full_name: draft.full_name || null,
        preferred_name: draft.preferred_name || null,
        phone: draft.phone || null,
        address_line_1: draft.address_line_1 || null,
        address_line_2: draft.address_line_2 || null,
        city: draft.city || null,
        state: draft.state || null,
        postal_code: draft.postal_code || null,
        country: draft.country || null,
        location: draft.location || null,
        current_location: draft.current_location || null,
      });
    } else if (section === "summary") {
      await saveProfile({ headline: draft.headline || null, bio: draft.bio || null });
    } else if (section === "skills") {
      await saveProfile({ skills: fromCsv(skillsText) });
    } else if (section === "experience") {
      const cleaned = experience.filter((e) => e.title.trim() && e.company.trim());
      await saveProfile({ experience: cleaned });
    } else if (section === "education") {
      const cleaned = education.filter((e) => e.school.trim());
      await saveProfile({ education: cleaned });
    } else if (section === "projects") {
      await saveProfile({ projects: projects.filter((p) => p.name.trim()) });
    } else if (section === "certifications") {
      await saveProfile({ certifications: certifications.filter((c) => c.name.trim()) });
    } else if (section === "links") {
      await saveProfile({ professional_links: links });
    } else if (section === "work_authorization") {
      if (!workAuth.user_confirmed) {
        setFieldError("Confirm your work-authorization answers before saving.");
        return;
      }
      await saveProfile({ work_authorization: workAuth });
    } else if (section === "job_preferences") {
      await saveProfile({ job_preferences: prefs });
    } else if (section === "documents") {
      await saveProfile({
        default_resume_id: draft.default_resume_id ?? null,
        default_cover_letter_id: draft.default_cover_letter_id ?? null,
      });
    }
  };

  const addAnswer = async () => {
    if (!answerText.trim()) {
      setFieldError("Enter an answer before saving.");
      return;
    }
    setAnswerSaving(true);
    setFieldError(null);
    try {
      await api.createApplicationAnswer({
        normalized_question_key: answerKey,
        display_question: answerQuestion,
        answer: answerText,
        approval_status: "approved",
      });
      setAnswerText("");
      await load();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save answer.");
    } finally {
      setAnswerSaving(false);
    }
  };

  const deleteAnswer = async (id: number) => {
    try {
      await api.deleteApplicationAnswer(id);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to delete answer.");
    }
  };

  const completeness = profile?.completeness;
  const readiness = profile?.readiness;
  const pct = completeness?.overall_percentage ?? profile?.profile_completion_percentage ?? 0;

  const incompleteClick = (key: string) => {
    const map: Record<string, SectionKey> = {
      personal: "personal",
      summary: "summary",
      skills: "skills",
      experience: "experience",
      education: "education",
      links: "links",
      work_authorization: "work_authorization",
      job_preferences: "job_preferences",
      resume: "documents",
      application_answers: "answers",
    };
    goSection(map[key] || "personal");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-slate-500 py-24">
        <Loader2 size={18} className="animate-spin" /> Loading profile…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-4">
        <ErrorBanner message={loadError} onRetry={load} />
        <div className="card p-5 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Sign in with your JobLens account (email/password) to view and edit your profile.
            This is separate from Clerk sign-in used for the ATS.
          </p>
          <button
            type="button"
            onClick={() => setShowAuth(true)}
            className="btn-primary"
          >
            Log in
          </button>
        </div>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <header>
        <p className="page-kicker">Your account</p>
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Keep application-ready details accurate for Discover Jobs and Apply Options.</p>
      </header>

      {/* Completeness */}
      <div className="card p-5 sm:p-6 bg-gradient-to-br from-indigo-50/80 via-white to-white dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="relative w-20 h-20 shrink-0 mx-auto sm:mx-0">
            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-200 dark:text-slate-700" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${pct}, 100`}
                className="text-indigo-600 dark:text-indigo-400" strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800 dark:text-slate-100">
              {pct}%
            </span>
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Profile completeness</p>
            {completeness?.recommended_next_action && (
              <p className="text-sm text-slate-500 mt-1">{completeness.recommended_next_action}</p>
            )}
            {readiness && (
              <p className="text-xs mt-2">
                Application readiness:{" "}
                <span className={clsx(
                  "font-semibold",
                  readiness.status === "Ready" && "text-emerald-600",
                  readiness.status === "Mostly Ready" && "text-indigo-600",
                  readiness.status === "Needs Information" && "text-amber-600",
                  readiness.status === "Not Ready" && "text-slate-500",
                )}>{readiness.status}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3 justify-center sm:justify-start">
              {(completeness?.incomplete_sections || []).map((key) => (
                <button key={key} type="button" onClick={() => incompleteClick(key)}
                  className="text-[11px] px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100">
                  {completeness?.sections.find((s) => s.key === key)?.label || key}
                </button>
              ))}
              {(completeness?.incomplete_sections || []).length === 0 && (
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle size={12} /> All weighted sections complete
                </span>
              )}
            </div>
          </div>
          <div className="text-center sm:text-right text-xs text-slate-400 shrink-0 space-y-1">
            <p>Save:{" "}
              {saveState === "saving" && <span className="text-indigo-600">Saving…</span>}
              {saveState === "saved" && <span className="text-emerald-600">Saved</span>}
              {saveState === "failed" && <span className="text-red-600">Failed</span>}
              {saveState === "idle" && <span>Ready</span>}
            </p>
            {profile?.updated_at && (
              <p>Updated {new Date(profile.updated_at).toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>

      {/* Section nav */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => goSection(key)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0",
              section === key
                ? "bg-indigo-600 text-white"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-300",
            )}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {(saveError || fieldError) && (
        <ErrorBanner
          message={fieldError || saveError || ""}
          onDismiss={() => { setSaveError(null); setFieldError(null); }}
        />
      )}

      <div className="card p-5 sm:p-6 space-y-4">
        {section === "personal" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Personal Information</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Full name</label>
                <input className="input" value={draft.full_name || ""} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
              </div>
              <div>
                <label className="label">Preferred name</label>
                <input className="input" value={draft.preferred_name || ""} onChange={(e) => setDraft({ ...draft, preferred_name: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Email (from your account)</label>
                <input className="input bg-slate-50 dark:bg-slate-800/50" value={profile?.email || ""} disabled readOnly />
                <p className="text-[11px] text-slate-400 mt-1">Managed by sign-in — not editable here.</p>
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" type="tel" value={draft.phone || ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Current location</label>
                <input className="input" value={draft.current_location || ""} onChange={(e) => setDraft({ ...draft, current_location: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Address</label>
                <input className="input" value={draft.address_line_1 || ""} onChange={(e) => setDraft({ ...draft, address_line_1: e.target.value })} placeholder="Street address" />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input" value={draft.city || ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
              </div>
              <div>
                <label className="label">State / province</label>
                <input className="input" value={draft.state || ""} onChange={(e) => setDraft({ ...draft, state: e.target.value })} />
              </div>
              <div>
                <label className="label">Postal code</label>
                <input className="input" value={draft.postal_code || ""} onChange={(e) => setDraft({ ...draft, postal_code: e.target.value })} />
              </div>
              <div>
                <label className="label">Country</label>
                <input className="input" value={draft.country || ""} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {section === "summary" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Professional Summary</h2>
            <div>
              <label className="label">Headline</label>
              <input className="input" value={draft.headline || ""} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} placeholder="e.g. Senior Backend Engineer" />
            </div>
            <div>
              <label className="label">Summary</label>
              <textarea className="textarea min-h-[120px]" value={draft.bio || ""} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
            </div>
          </>
        )}

        {section === "skills" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Skills</h2>
            <textarea className="textarea min-h-[100px]" value={skillsText} onChange={(e) => setSkillsText(e.target.value)}
              placeholder="Comma-separated skills, e.g. Python, FastAPI, React" />
          </>
        )}

        {section === "experience" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Work Experience</h2>
            {experience.map((row, i) => (
              <div key={i} className="grid sm:grid-cols-2 gap-2 border border-slate-100 dark:border-slate-800 rounded-lg p-3">
                <input className="input" placeholder="Title" value={row.title} onChange={(e) => {
                  const next = [...experience]; next[i] = { ...row, title: e.target.value }; setExperience(next);
                }} />
                <input className="input" placeholder="Company" value={row.company} onChange={(e) => {
                  const next = [...experience]; next[i] = { ...row, company: e.target.value }; setExperience(next);
                }} />
                <input className="input" placeholder="Start" value={row.start || ""} onChange={(e) => {
                  const next = [...experience]; next[i] = { ...row, start: e.target.value }; setExperience(next);
                }} />
                <input className="input" placeholder="End" value={row.end || ""} onChange={(e) => {
                  const next = [...experience]; next[i] = { ...row, end: e.target.value }; setExperience(next);
                }} />
                <textarea className="textarea sm:col-span-2" placeholder="Description" value={row.description || ""} onChange={(e) => {
                  const next = [...experience]; next[i] = { ...row, description: e.target.value }; setExperience(next);
                }} />
              </div>
            ))}
            <button type="button" className="btn-secondary text-xs" onClick={() => setExperience([...experience, emptyExp()])}>Add role</button>
          </>
        )}

        {section === "education" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Education</h2>
            {education.map((row, i) => (
              <div key={i} className="grid sm:grid-cols-2 gap-2 border border-slate-100 dark:border-slate-800 rounded-lg p-3">
                <input className="input" placeholder="School" value={row.school} onChange={(e) => {
                  const next = [...education]; next[i] = { ...row, school: e.target.value }; setEducation(next);
                }} />
                <input className="input" placeholder="Degree" value={row.degree || ""} onChange={(e) => {
                  const next = [...education]; next[i] = { ...row, degree: e.target.value }; setEducation(next);
                }} />
                <input className="input" placeholder="Start" value={row.start || ""} onChange={(e) => {
                  const next = [...education]; next[i] = { ...row, start: e.target.value }; setEducation(next);
                }} />
                <input className="input" placeholder="End" value={row.end || ""} onChange={(e) => {
                  const next = [...education]; next[i] = { ...row, end: e.target.value }; setEducation(next);
                }} />
              </div>
            ))}
            <button type="button" className="btn-secondary text-xs" onClick={() => setEducation([...education, emptyEdu()])}>Add school</button>
          </>
        )}

        {section === "projects" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Projects</h2>
            {projects.map((row, i) => (
              <div key={i} className="grid sm:grid-cols-2 gap-2 border border-slate-100 dark:border-slate-800 rounded-lg p-3">
                <input className="input" placeholder="Name" value={row.name} onChange={(e) => {
                  const next = [...projects]; next[i] = { ...row, name: e.target.value }; setProjects(next);
                }} />
                <input className="input" type="url" placeholder="URL" value={row.url || ""} onChange={(e) => {
                  const next = [...projects]; next[i] = { ...row, url: e.target.value }; setProjects(next);
                }} />
                <textarea className="textarea sm:col-span-2" placeholder="Description" value={row.description || ""} onChange={(e) => {
                  const next = [...projects]; next[i] = { ...row, description: e.target.value }; setProjects(next);
                }} />
              </div>
            ))}
            <button type="button" className="btn-secondary text-xs" onClick={() => setProjects([...projects, emptyProject()])}>Add project</button>
          </>
        )}

        {section === "certifications" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Certifications</h2>
            {certifications.map((row, i) => (
              <div key={i} className="grid sm:grid-cols-2 gap-2 border border-slate-100 dark:border-slate-800 rounded-lg p-3">
                <input className="input" placeholder="Name" value={row.name} onChange={(e) => {
                  const next = [...certifications]; next[i] = { ...row, name: e.target.value }; setCertifications(next);
                }} />
                <input className="input" placeholder="Issuer" value={row.issuer || ""} onChange={(e) => {
                  const next = [...certifications]; next[i] = { ...row, issuer: e.target.value }; setCertifications(next);
                }} />
                <input className="input" type="date" placeholder="Date earned" value={row.date_earned || ""} onChange={(e) => {
                  const next = [...certifications]; next[i] = { ...row, date_earned: e.target.value }; setCertifications(next);
                }} />
              </div>
            ))}
            <button type="button" className="btn-secondary text-xs" onClick={() => setCertifications([...certifications, emptyCert()])}>Add certification</button>
          </>
        )}

        {section === "links" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Professional Links</h2>
            {(["linkedin", "github", "portfolio", "personal_website", "other"] as const).map((key) => (
              <div key={key}>
                <label className="label capitalize">{key.replace("_", " ")}</label>
                <input className="input" type="url" value={links[key] || ""} placeholder="https://"
                  onChange={(e) => setLinks({ ...links, [key]: e.target.value })} />
              </div>
            ))}
          </>
        )}

        {section === "work_authorization" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Work Authorization</h2>
            <p className="text-xs text-slate-500">Sensitive answers require your explicit confirmation. We do not infer these from your resume.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Country where you are applying</label>
                <input className="input" value={workAuth.applying_country || ""} onChange={(e) => setWorkAuth({ ...workAuth, applying_country: e.target.value })} />
              </div>
              <div>
                <label className="label">Current work authorization</label>
                <input className="input" value={workAuth.current_authorization || ""} onChange={(e) => setWorkAuth({ ...workAuth, current_authorization: e.target.value })} />
              </div>
              <div>
                <label className="label">Visa / authorization type</label>
                <input className="input" value={workAuth.visa_type || ""} onChange={(e) => setWorkAuth({ ...workAuth, visa_type: e.target.value })} />
              </div>
              <div>
                <label className="label">Authorization expiration</label>
                <input className="input" type="date" value={workAuth.authorization_expiration || ""} onChange={(e) => setWorkAuth({ ...workAuth, authorization_expiration: e.target.value })} />
              </div>
              <div>
                <label className="label">Sponsorship required now</label>
                <select className="input" value={workAuth.sponsorship_required_now == null ? "" : workAuth.sponsorship_required_now ? "yes" : "no"}
                  onChange={(e) => setWorkAuth({ ...workAuth, sponsorship_required_now: e.target.value === "" ? null : e.target.value === "yes" })}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="label">Sponsorship required in future</label>
                <select className="input" value={workAuth.sponsorship_required_future == null ? "" : workAuth.sponsorship_required_future ? "yes" : "no"}
                  onChange={(e) => setWorkAuth({ ...workAuth, sponsorship_required_future: e.target.value === "" ? null : e.target.value === "yes" })}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Countries authorized to work (comma-separated)</label>
                <input className="input" value={csv(workAuth.authorized_countries)} onChange={(e) => setWorkAuth({ ...workAuth, authorized_countries: fromCsv(e.target.value) })} />
              </div>
              <div>
                <label className="label">Willing to relocate</label>
                <select className="input" value={workAuth.willing_to_relocate == null ? "" : workAuth.willing_to_relocate ? "yes" : "no"}
                  onChange={(e) => setWorkAuth({ ...workAuth, willing_to_relocate: e.target.value === "" ? null : e.target.value === "yes" })}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="label">Security clearance</label>
                <select className="input" value={workAuth.security_clearance == null ? "" : workAuth.security_clearance ? "yes" : "no"}
                  onChange={(e) => setWorkAuth({ ...workAuth, security_clearance: e.target.value === "" ? null : e.target.value === "yes" })}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              {workAuth.security_clearance && (
                <div className="sm:col-span-2">
                  <label className="label">Clearance level</label>
                  <input className="input" value={workAuth.clearance_level || ""} onChange={(e) => setWorkAuth({ ...workAuth, clearance_level: e.target.value })} />
                </div>
              )}
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 mt-2">
              <input type="checkbox" className="mt-1" checked={!!workAuth.user_confirmed}
                onChange={(e) => setWorkAuth({ ...workAuth, user_confirmed: e.target.checked })} />
              I confirm these work-authorization answers are accurate and reviewed by me.
            </label>
          </>
        )}

        {section === "job_preferences" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Job Preferences</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Preferred job titles</label>
                <input className="input" value={csv(prefs.preferred_titles)} onChange={(e) => setPrefs({ ...prefs, preferred_titles: fromCsv(e.target.value) })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Preferred industries</label>
                <input className="input" value={csv(prefs.preferred_industries)} onChange={(e) => setPrefs({ ...prefs, preferred_industries: fromCsv(e.target.value) })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Preferred locations</label>
                <input className="input" value={csv(prefs.preferred_locations)} onChange={(e) => setPrefs({ ...prefs, preferred_locations: fromCsv(e.target.value) })} />
              </div>
              <div>
                <label className="label">Work arrangement</label>
                <select className="input" value={prefs.work_arrangement || ""} onChange={(e) => setPrefs({ ...prefs, work_arrangement: e.target.value || null })}>
                  <option value="">Select…</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">Onsite</option>
                </select>
              </div>
              <div>
                <label className="label">Employment types</label>
                <input className="input" value={csv(prefs.employment_types)} onChange={(e) => setPrefs({ ...prefs, employment_types: fromCsv(e.target.value) })} placeholder="Full-time, Contract" />
              </div>
              <div>
                <label className="label">Minimum salary</label>
                <input className="input" type="number" value={prefs.minimum_salary ?? ""} onChange={(e) => setPrefs({ ...prefs, minimum_salary: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <label className="label">Minimum hourly rate</label>
                <input className="input" type="number" value={prefs.minimum_hourly_rate ?? ""} onChange={(e) => setPrefs({ ...prefs, minimum_hourly_rate: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <label className="label">Currency</label>
                <input className="input" value={prefs.preferred_currency || "USD"} onChange={(e) => setPrefs({ ...prefs, preferred_currency: e.target.value })} />
              </div>
              <div>
                <label className="label">Max travel %</label>
                <input className="input" type="number" min={0} max={100} value={prefs.max_travel_percentage ?? ""} onChange={(e) => setPrefs({ ...prefs, max_travel_percentage: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <label className="label">Available start date</label>
                <input className="input" type="date" value={prefs.available_start_date || ""} onChange={(e) => setPrefs({ ...prefs, available_start_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Relocation preference</label>
                <input className="input" value={prefs.relocation_preference || ""} onChange={(e) => setPrefs({ ...prefs, relocation_preference: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {section === "answers" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Application Answers</h2>
            <p className="text-xs text-slate-500">Sensitive topics (salary, sponsorship, clearance, etc.) default to Always Ask.</p>
            <div className="space-y-2">
              <select className="input" value={answerKey} onChange={(e) => {
                const v = e.target.value;
                setAnswerKey(v);
                const labels: Record<string, string> = {
                  why_interested: "Why are you interested in this role?",
                  why_looking: "Why are you looking for a new position?",
                  salary_expectation: "Salary expectation",
                  hourly_rate_expectation: "Hourly-rate expectation",
                  earliest_start: "Earliest start date",
                  willingness_to_relocate: "Willingness to relocate",
                  sponsorship_requirement: "Sponsorship requirement",
                  years_experience_skill: "Years of experience with a named skill",
                  preferred_work_arrangement: "Preferred work arrangement",
                  additional_information: "Additional information for the employer",
                };
                setAnswerQuestion(labels[v] || answerQuestion);
              }}>
                <option value="why_interested">Why interested</option>
                <option value="why_looking">Why looking</option>
                <option value="salary_expectation">Salary expectation</option>
                <option value="hourly_rate_expectation">Hourly rate</option>
                <option value="earliest_start">Earliest start</option>
                <option value="willingness_to_relocate">Relocate</option>
                <option value="sponsorship_requirement">Sponsorship</option>
                <option value="years_experience_skill">Years with skill</option>
                <option value="preferred_work_arrangement">Work arrangement</option>
                <option value="additional_information">Additional info</option>
              </select>
              <input className="input" value={answerQuestion} onChange={(e) => setAnswerQuestion(e.target.value)} />
              <textarea className="textarea min-h-[90px] break-words" value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
              <button type="button" className="btn-primary text-sm flex items-center gap-2" disabled={answerSaving} onClick={addAnswer}>
                {answerSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save answer
              </button>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(profile?.application_answers || []).map((a: ApplicationAnswer) => (
                <li key={a.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-2 justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words">{a.display_question}</p>
                    <p className="text-xs text-slate-500 mt-0.5 break-words">{a.answer}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {a.is_sensitive ? "Sensitive · " : ""}Reuse: {a.reuse_policy.replace(/_/g, " ")}
                    </p>
                  </div>
                  <button type="button" className="btn-danger text-xs shrink-0" onClick={() => deleteAnswer(a.id)}>Delete</button>
                </li>
              ))}
              {(profile?.application_answers || []).length === 0 && (
                <li className="py-6 text-sm text-slate-400 text-center">No saved answers yet.</li>
              )}
            </ul>
          </>
        )}

        {section === "documents" && (
          <>
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Documents</h2>
            <p className="text-xs text-slate-500">Uses existing Resume Analyzer and Cover Letter history. Defaults are not linked to Job Tracker applications yet.</p>
            <div>
              <label className="label">Default resume</label>
              <select className="input" value={draft.default_resume_id ?? ""} onChange={(e) => setDraft({ ...draft, default_resume_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">None</option>
                {(profile?.documents || []).filter((d) => d.kind === "resume").map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Default cover letter</label>
              <select className="input" value={draft.default_cover_letter_id ?? ""} onChange={(e) => setDraft({ ...draft, default_cover_letter_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">None</option>
                {(profile?.documents || []).filter((d) => d.kind === "cover_letter").map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
            <ul className="mt-4 space-y-2">
              {(profile?.documents || []).map((d) => (
                <li key={`${d.kind}-${d.id}`} className="flex items-center justify-between gap-2 text-sm border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2">
                  <span className="min-w-0 truncate">
                    <span className="text-[11px] uppercase text-slate-400 mr-2">{d.kind}</span>
                    {d.label}
                  </span>
                  {d.is_default && <span className="text-[11px] text-indigo-600 shrink-0">Default</span>}
                </li>
              ))}
              {(profile?.documents || []).length === 0 && (
                <li className="text-sm text-slate-400 text-center py-4">
                  No documents yet. Analyze a resume or generate a cover letter first.
                </li>
              )}
            </ul>
          </>
        )}

        {section !== "answers" && (
          <div className="pt-2 flex justify-end sticky bottom-3">
            <button type="button" onClick={saveCurrentSection} disabled={saveState === "saving"}
              className="btn-primary flex items-center gap-2 shadow-lg">
              {saveState === "saving" ? <Loader2 size={14} className="animate-spin" /> : saveState === "saved" ? <CheckCircle size={14} /> : <Save size={14} />}
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save section"}
            </button>
          </div>
        )}
      </div>

      {!profile && (
        <div className="flex items-center gap-2 text-amber-700 text-sm">
          <AlertCircle size={14} /> Missing required information — start with Personal Information.
        </div>
      )}
    </div>
  );
}
