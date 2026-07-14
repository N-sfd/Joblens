"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard, Users, Briefcase, Inbox, Send, Contact, BarChart3, Settings,
} from "lucide-react";

// Consolidated 8-item nav (Recruitment CRM + ATS):
//   - Candidates -> /ats/candidates (Employees + resume workflows)
//   - Pipeline -> /ats/submissions (Job Sends/Interviews/Offers fold in during Pipeline phase)
//   - Reports -> stub page until the Reports phase
const NAV: { href: string; label: string; icon: React.ElementType }[] = [
  { href: "/ats", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ats/email-inbox", label: "Zoho Inbox", icon: Inbox },
  { href: "/ats/jobs", label: "Jobs", icon: Briefcase },
  { href: "/ats/candidates", label: "Candidates", icon: Users },
  { href: "/ats/submissions", label: "Pipeline", icon: Send },
  { href: "/ats/contacts", label: "Contacts", icon: Contact },
  { href: "/ats/reports", label: "Reports", icon: BarChart3 },
  { href: "/ats/settings", label: "Settings", icon: Settings },
];

export default function AtsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/ats" ? pathname === "/ats" : (pathname === href || pathname.startsWith(href + "/"));
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon size={17} className="shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
