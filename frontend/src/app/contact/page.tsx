"use client";

import { useState } from "react";
import Link from "next/link";
import { LifeBuoy, Mail, Github, ArrowRight } from "lucide-react";
import LegalPageShell from "@/components/legal/LegalPageShell";
import LegalSection from "@/components/legal/LegalSection";

const SUPPORT_EMAIL = "support@joblens.app";

const TOPICS = ["General question", "Bug report", "Feature request", "Privacy / data concern", "Account issue"];

export default function ContactPage() {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");

  const mailtoHref = () => {
    const subject = encodeURIComponent(`JobLens support — ${topic}`);
    const body = encodeURIComponent(message || "Describe your question or issue here…");
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <LegalPageShell
      title="Contact Support"
      icon={LifeBuoy}
      intro="Have a question, found a bug, or have a privacy concern? We read every message."
    >
      <LegalSection title="Send us a message">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <label htmlFor="contact-topic" className="label">What's this about?</label>
            <select id="contact-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)}>
              {TOPICS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="contact-message" className="label">Message</label>
            <textarea
              id="contact-message"
              className="textarea h-32"
              placeholder="Tell us what's going on…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <a href={mailtoHref()} className="btn-primary inline-flex items-center gap-2">
            <Mail size={15} /> Open in your email app
          </a>
          <p className="text-xs text-slate-400">
            This opens a pre-filled email to <strong className="text-slate-600">{SUPPORT_EMAIL}</strong> in your default
            mail client — JobLens doesn't store anything you type above.
          </p>
        </div>
      </LegalSection>

      <LegalSection title="Other ways to reach us">
        <ul>
          <li>
            <Mail size={13} className="inline mr-1.5 -mt-0.5" />
            Email us directly at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </li>
          <li>
            <Github size={13} className="inline mr-1.5 -mt-0.5" />
            Report a bug or request a feature on{" "}
            <a href="https://github.com/N-sfd/joblens/issues" target="_blank" rel="noopener noreferrer">GitHub Issues</a>
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Want to delete your data instead?">
        <p>
          Head to the <Link href="/data-deletion">Data Deletion Request</Link> page — most accounts and guest sessions
          can be cleared instantly without contacting support.
        </p>
        <Link href="/data-deletion" className="inline-flex items-center gap-1 text-indigo-600 font-medium hover:underline mt-1">
          Go to Data Deletion <ArrowRight size={13} />
        </Link>
      </LegalSection>
    </LegalPageShell>
  );
}
