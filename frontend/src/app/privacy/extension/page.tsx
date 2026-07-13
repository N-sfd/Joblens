import type { Metadata } from "next";
import Link from "next/link";
import { Shield } from "lucide-react";
import LegalPageShell from "@/components/legal/LegalPageShell";
import LegalSection from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Browser Extension Privacy — JobLens",
  description:
    "What the JobLens Greenhouse browser extension inspects, requests, and never collects.",
};

export default function ExtensionPrivacyPage() {
  return (
    <LegalPageShell
      title="JobLens Browser Extension Privacy"
      icon={Shield}
      lastUpdated="July 9, 2026"
      intro="This page covers the optional JobLens Application Assist Chrome extension (Greenhouse only). It supplements the general JobLens Privacy Policy."
    >
      <LegalSection title="Data inspected on employer pages">
        <ul>
          <li>Visible Greenhouse field labels</li>
          <li>Field types and required indicators</li>
          <li>Upload-field purposes (e. and when available)</li>
          <li>Job title and employer when available on the page</li>
        </ul>
        <p>The extension does not render employer-page HTML inside the popup and does not scrape full page HTML.</p>
      </LegalSection>

      <LegalSection title="Data requested from JobLens">
        <ul>
          <li>Only user-approved profile fields needed for the visible form</li>
          <li>A resume you explicitly select</li>
          <li>A cover letter you explicitly select</li>
        </ul>
      </LegalSection>

      <LegalSection title="Data not collected">
        <ul>
          <li>Employer passwords or authentication tokens</li>
          <li>CAPTCHA answers</li>
          <li>Browsing history, unrelated tabs, or unrelated pages</li>
          <li>Existing employer-form values already typed by you</li>
          <li>Demographic answers unless you enter and approve them in JobLens</li>
          <li>Full page HTML or cookies</li>
        </ul>
      </LegalSection>

      <LegalSection title="User control">
        <ul>
          <li>Analysis requires consent for the current tab session</li>
          <li>Fill requires consent and field-by-field review</li>
          <li>Each document upload requires consent</li>
          <li>You review the employer form</li>
          <li>You click the employer Submit button</li>
          <li>You confirm submission separately with “I Submitted”</li>
        </ul>
        <p>JobLens never clicks Submit and never enables automatic submission.</p>
      </LegalSection>

      <LegalSection title="How to revoke access and delete data">
        <ul>
          <li><strong>Disconnect the extension</strong> from the popup (revokes refresh tokens).</li>
          <li><strong>Revoke tokens</strong> by disconnecting or contacting support to revoke all extension sessions for your account.</li>
          <li><strong>Delete diagnostics / fill sessions / application-document history</strong> from your JobLens account settings or by requesting deletion at the contact below.</li>
          <li><strong>Report a security or privacy concern</strong> using the extension’s “Report an issue → Privacy concern” action, or email the contact on the main privacy page.</li>
        </ul>
      </LegalSection>

      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/privacy">General Privacy Policy</Link>
        . User guide: repository file <code>docs/EXTENSION_USER_GUIDE.md</code>.
      </p>
    </LegalPageShell>
  );
}
