import type { Metadata } from "next";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import LegalPageShell from "@/components/legal/LegalPageShell";
import LegalSection from "@/components/legal/LegalSection";

export const metadata: Metadata = {
  title: "Terms of Use — JobLens",
  description: "The terms that govern your use of JobLens.",
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Use"
      icon={FileSignature}
      lastUpdated="June 27, 2026"
      intro="By using JobLens you agree to these terms. They're written to be readable, not to bury you in legalese."
    >
      <LegalSection title="1. The service">
        <p>
          JobLens is a toolkit for job seekers: resume analysis, job matching, application tracking, and
          cover-letter drafting.
          cover letter generation. It's provided "as is," free of charge, without warranty of any kind.
        </p>
      </LegalSection>

      <LegalSection title="2. Generated content">
        <p>
          Scores, suggestions, interview questions, and cover letters are generated automatically and are <strong>advisory
          only</strong>. They may contain inaccuracies. You're responsible for reviewing and editing any generated
          content before sending it to an employer, and for verifying claims made about your own experience.
        </p>
      </LegalSection>

      <LegalSection title="3. Your responsibilities">
        <ul>
          <li>Only upload resumes and job descriptions you have the right to use.</li>
          <li>Don't use JobLens to generate misleading, fraudulent, or plagiarized application materials.</li>
          <li>Don't attempt to abuse, overload, or reverse-engineer the service or its model integrations.</li>
          <li>Keep your account credentials confidential if you create one.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Your data">
        <p>
          You retain ownership of everything you upload or paste into JobLens. We process it only to deliver the feature
          you requested — see our <Link href="/privacy">Privacy Policy</Link> for details, and our{" "}
          <Link href="/data-deletion">Data Deletion Request</Link> page to remove it at any time.
        </p>
      </LegalSection>

      <LegalSection title="5. No employment guarantee">
        <p>
          JobLens helps you present your application materials more effectively. It does not guarantee interviews,
          offers, or any specific outcome in your job search.
        </p>
      </LegalSection>

      <LegalSection title="6. Limitation of liability">
        <p>
          JobLens and its operators are not liable for any indirect, incidental, or consequential damages arising from
          your use of the service, including decisions made based on generated scores or suggestions, to the fullest
          extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="7. Changes">
        <p>
          We may update these terms as the product evolves. We'll update the date at the top of this page when we do.
          Continuing to use JobLens after a change means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          Questions about these terms? Visit our <Link href="/contact">Contact Support</Link> page.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
