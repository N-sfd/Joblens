"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard, Users, FileText, Briefcase, Inbox, Building2,
  Building, UserRound, Contact, Activity, Send, CalendarClock, Settings,
} from "lucide-react";

const NAV: { href: string; label: string; icon: React.ElementType }[] = [
  { href: "/ats", label: "ATS Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/job-requirements", label: "Job Requirements", icon: Briefcase },
  { href: "/email-inbox", label: "Email Inbox", icon: Inbox },
  { href: "/crm/recruiters", label: "Recruiters", icon: UserRound },
  { href: "/crm/vendors", label: "Vendors", icon: Building2 },
  { href: "/crm/clients", label: "Clients", icon: Building },
  { href: "/crm/contacts", label: "Contacts", icon: Contact },
  { href: "/crm/activities", label: "Activities", icon: Activity },
  { href: "/submissions", label: "Submissions", icon: Send },
  { href: "/matches", label: "Interviews", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AtsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
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
