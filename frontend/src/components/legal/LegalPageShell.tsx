import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import LogoMark from "@/components/Logo";

interface Props {
  title: string;
  icon: LucideIcon;
  lastUpdated?: string;
  intro?: string;
  children: ReactNode;
}

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/contact", label: "Contact Support" },
  { href: "/data-deletion", label: "Data Deletion" },
];

export default function LegalPageShell({ title, icon: Icon, lastUpdated, intro, children }: Props) {
  return (
    <div className="bg-white min-h-screen text-slate-900">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
              <LogoMark size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-900">JobLens</span>
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5">
          <Icon size={20} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">{title}</h1>
        {lastUpdated && <p className="text-xs text-slate-400 mb-6">Last updated: {lastUpdated}</p>}
        {intro && <p className="text-slate-500 leading-relaxed mb-8">{intro}</p>}
        <div className="space-y-8">{children}</div>
      </main>

      <footer className="border-t border-slate-100 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <LogoMark size={13} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">JobLens</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-slate-700 transition-colors">{l.label}</Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
