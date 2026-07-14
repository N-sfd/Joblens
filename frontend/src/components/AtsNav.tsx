"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard, Users, Briefcase, Inbox, Send, Contact, BarChart3, Settings,
} from "lucide-react";
import { useAtsRole, type AtsRole } from "@/lib/atsRole";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  /** Roles that may see this item. All four roles when omitted. */
  roles?: readonly AtsRole[];
};

// Consolidated primary navigation for Recruitment CRM + ATS.
// Obsolete modules (Employees, Job Requirements, Submissions, Recruiters,
// Clients, Vendors, separate Interviews/Offers, seeker tools) stay out of
// this list — legacy URLs redirect via middleware.
const NAV: NavItem[] = [
  { href: "/ats", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/ats/email-inbox",
    label: "Zoho Inbox",
    icon: Inbox,
    roles: ["admin", "manager", "recruiter"],
  },
  { href: "/ats/jobs", label: "Jobs", icon: Briefcase },
  { href: "/ats/candidates", label: "Candidates", icon: Users },
  { href: "/ats/pipeline", label: "Pipeline", icon: Send },
  { href: "/ats/contacts", label: "Contacts", icon: Contact },
  { href: "/ats/reports", label: "Reports", icon: BarChart3 },
  {
    href: "/ats/settings",
    label: "Settings",
    icon: Settings,
    roles: ["admin", "manager", "recruiter", "read_only"],
  },
];

function settingsLabel(role: AtsRole): string {
  if (role === "admin" || role === "manager") return "Settings";
  return "Personal Settings";
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/ats") return pathname === "/ats";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AtsNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const { role, loading } = useAtsRole();

  const items = NAV.filter((item) => {
    if (!item.roles) return true;
    if (loading) return item.roles.includes("read_only") || item.href === "/ats";
    return item.roles.includes(role);
  }).map((item) =>
    item.href === "/ats/settings"
      ? { ...item, label: settingsLabel(loading ? "read_only" : role) }
      : item
  );

  return (
    <nav
      className={clsx(
        compact
          ? "flex md:hidden gap-1 overflow-x-auto px-3 py-2 border-b border-slate-200 bg-white"
          : "flex flex-col gap-0.5 p-3"
      )}
      aria-label="Primary"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              compact
                ? "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                : "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
            aria-current={active ? "page" : undefined}
          >
            {!compact && <Icon size={17} className="shrink-0" aria-hidden />}
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
