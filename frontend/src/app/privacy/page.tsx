import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import LegalPageShell from "@/components/legal/LegalPageShell";
import LegalSection from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Privacy Policy — JobLens",
  description: "How JobLens collects, uses, and protects your resume, job, and application data.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      icon={ShieldCheck}
      lastUpdated="June 27, 2026"
      intro="JobLens is a job-search toolkit. This page explains, in plain language, what data we collect, why we collect it, and how you can remove it."
    >
      <LegalSection title="1. What we collect">
        <p>We only collect what's needed to run the features you use:</p>
        <ul>
          <li><strong>Resume content</strong> you upload or paste into the Resume Analyzer, Job Matcher, or Cover Letter Generator.</li>
          <li><strong>Job descriptions</strong> you paste into the Job Matcher or Cover Letter Generator.</li>
          <li><strong>Job application details</strong> you enter into the Job Tracker (company, role, status, notes, dates, links).</li>
          <li><strong>Activity history</strong> — a record of which tools you've run (e.g. "Resume Analyzed"), so your Dashboard can show progress over time.</li>
          <li><strong>Account details</strong> — only if you sign up: your email, name (optional), and a securely hashed password. We never store your password in plain text.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Guest sessions vs. accounts">
        <p>
          JobLens works without an account. On your first visit we generate a random, anonymous guest ID stored in your
          browser's local storage — it identifies your data, not you. If you later sign up or log in, any data created
          as a guest is automatically attached to your new account so you don't lose it.
        </p>
      </LegalSection>

      <LegalSection title="3. How your data is used">
        <p>Your resume and job description text is sent to a third-party language model provider solely to generate the
          analysis, match score, interview prep, or cover letter you requested. We do not use your data to train
          models, and the provider is contractually a data processor, not an owner, of what you submit.</p>
        <p>We never sell, rent, or share your resume, job descriptions, or application data with advertisers, recruiters, or
          data brokers.</p>
      </LegalSection>

      <LegalSection title="4. Where data is stored">
        <p>
          Application data (jobs, analyses, matches, cover letters, activity) is stored in our database, scoped to your
          guest ID or account, and is never visible to other users. Your auth session is kept in a secure, HTTP-only
          cookie that only your browser can use — it isn't readable by page scripts.
        </p>
      </LegalSection>

      <LegalSection title="5. Cookies & tracking">
        <p>
          JobLens does not use advertising cookies, third-party analytics, or cross-site tracking. The only cookie we
          set is a session cookie used to keep you signed in, and the only browser storage we use is your anonymous
          guest ID and a couple of convenience caches (like your most recent resume text) to pre-fill forms.
        </p>
      </LegalSection>

      <LegalSection title="6. Your choices & data deletion">
        <p>You're in control of your data at any time, whether you're a guest or have an account:</p>
        <ul>
          <li>Use <strong>Clear All</strong> on the Job Tracker to delete every saved application.</li>
          <li>Use <strong>Clear</strong> on the Dashboard's Activity panel to wipe your activity history.</li>
          <li>Visit our <Link href="/data-deletion">Data Deletion Request</Link> page for a one-click option that deletes
            every record JobLens has stored for your session — resumes, matches, cover letters, jobs, and activity — and,
            if you have an account, to delete the account itself.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Changes to this policy">
        <p>
          If we make material changes to how we handle your data, we'll update the date at the top of this page. Continued
          use of JobLens after a change means you accept the revised policy.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact us">
        <p>
          Questions about this policy or how your data is handled? Reach out via our <Link href="/contact">Contact Support</Link> page.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
