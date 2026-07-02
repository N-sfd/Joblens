import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import AtsNav from "@/components/AtsNav";

// PROTECTED layout — every page under this (ats) group is gated by the
// middleware.ts route matcher. If you add new ATS pages, no extra protection
// code is needed here; just confirm the path is covered by isProtectedAtsRoute.
export default function AtsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-4 py-4 border-b border-slate-100">
          <Link href="/ats" className="font-bold text-slate-900 text-sm">
            Consult America <span className="text-indigo-600">CRM</span>
          </Link>
          <p className="text-[11px] text-slate-400 mt-0.5">Staffing CRM + ATS</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AtsNav />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-4 px-6 py-3 bg-white border-b border-slate-200">
          <Link href="/ats" className="md:hidden font-bold text-slate-900 text-sm">
            CRM
          </Link>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
              ApplyPilot
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
