"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard, Users, FileText, Briefcase, Inbox, UserRound,
  Building2, Building, Send, Mail, CalendarCheck, BadgeCheck, Settings, Activity, ClipboardList,
} from "lucide-react";

const NAV: { href: string; label: string; icon: React.ElementType }[] = [
  { href: "/ats", label: "ATS Dashboard", icon: LayoutDashboard },
  { href: "/ats/employees", label: "Employees", icon: Users },
  { href: "/ats/employee-resumes", label: "Employee Resumes", icon: FileText },
  { href: "/ats/jobs", label: "Job Requirements", icon: Briefcase },
  { href: "/ats/email-inbox", label: "Zoho Email Inbox", icon: Inbox },
  { href: "/ats/recruiters", label: "Recruiters", icon: UserRound },
  { href: "/ats/vendors", label: "Vendors", icon: Building2 },
  { href: "/ats/clients", label: "Clients", icon: Building },
  { href: "/ats/activities", label: "Activities", icon: Activity },
  { href: "/ats/job-sends", label: "Job Sends", icon: Mail },
  { href: "/ats/submissions", label: "Submissions", icon: Send },
  { href: "/ats/interviews", label: "Interviews", icon: CalendarCheck },
  { href: "/ats/offers", label: "Offers", icon: BadgeCheck },
  { href: "/ats/onboarding", label: "Onboarding", icon: ClipboardList },
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
