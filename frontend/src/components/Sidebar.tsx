"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Target,
  PenTool,
  BellRing,
  Compass,
  UserRound,
  ClipboardList,
  X,
} from "lucide-react";
import clsx from "clsx";
import LogoMark from "./Logo";
import { LEGAL_LINKS } from "./legal/LegalPageShell";

export const nav = [
  { href: "/dashboard",     label: "Dashboard",           icon: LayoutDashboard },
  { href: "/profile",       label: "Profile",             icon: UserRound },
  { href: "/jobs/discover", label: "Discover Jobs",       icon: Compass },
  { href: "/applications/status", label: "Application Status", icon: ClipboardList },
  { href: "/resume",        label: "Resume Analyzer",     icon: FileText },
  { href: "/jobs",          label: "Job Tracker",         icon: Briefcase },
  { href: "/match",         label: "Job Matcher",         icon: Target },
  { href: "/cover-letter",  label: "Cover Letter",        icon: PenTool },
  { href: "/reminders",     label: "Reminders",           icon: BellRing },
];

interface Props {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-64 max-w-[85vw] h-full bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/40 ring-1 ring-white/10">
            <LogoMark size={17} className="text-white" />
          </div>
          <div className="leading-none">
            <p className="text-white font-bold text-base tracking-tight">JobLens</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Career toolkit</p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider px-3 pb-2">
          Tools
        </p>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={clsx(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-white/[0.07] text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-indigo-500" />
              )}
              <Icon size={16} className={active ? "text-indigo-400" : ""} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Trust & legal links */}
      <div className="px-5 py-4 border-t border-white/5">
        <nav className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={onClose} className="hover:text-slate-300 transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
