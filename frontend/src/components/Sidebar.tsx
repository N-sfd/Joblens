"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Target,
  PenTool,
  X,
} from "lucide-react";
import clsx from "clsx";

const nav = [
  { href: "/",             label: "Dashboard",      icon: LayoutDashboard },
  { href: "/resume",       label: "Resume Analyzer", icon: FileText },
  { href: "/jobs",         label: "Job Tracker",     icon: Briefcase },
  { href: "/match",        label: "Job Matcher",     icon: Target },
  { href: "/cover-letter", label: "Cover Letter",    icon: PenTool },
];

interface Props {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-64 max-w-[85vw] h-full bg-slate-900 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Briefcase size={16} className="text-white" />
          </div>
          <p className="text-white font-bold text-base leading-none">JobLens</p>
        </div>
        {/* Close button — mobile only */}
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
