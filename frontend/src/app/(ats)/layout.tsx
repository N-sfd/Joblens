import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

// PROTECTED layout — every page under this (ats) group is gated by the
// middleware.ts route matcher. If you add new ATS pages, no extra protection
// code is needed here; just confirm the path is covered by isProtectedAtsRoute.
export default function AtsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center gap-4 px-6 py-3 bg-white border-b border-slate-200">
        <Link href="/employees" className="font-bold text-slate-900 text-sm">
          ATS Dashboard
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600">
          <Link href="/employees" className="hover:text-slate-900">Employees</Link>
          <Link href="/job-requirements" className="hover:text-slate-900">Job Requirements</Link>
          <Link href="/matches" className="hover:text-slate-900">Matches</Link>
          <Link href="/submissions" className="hover:text-slate-900">Submissions</Link>
          <Link href="/settings" className="hover:text-slate-900">Settings</Link>
        </nav>
        <div className="ml-auto">
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
