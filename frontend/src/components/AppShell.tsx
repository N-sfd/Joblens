"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Sidebar, { nav } from "./Sidebar";
import LogoMark from "./Logo";
import UserMenu from "./UserMenu";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = nav.find((n) => n.href === pathname);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile, fixed on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-30 transition-transform duration-300 md:relative md:translate-x-0 md:flex md:shrink-0 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Sidebar onClose={() => setOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-white/80 backdrop-blur-sm border-b border-slate-200 shrink-0">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <LogoMark size={13} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">JobLens</span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-sm">
            <span className="text-slate-400 font-medium">JobLens</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-800 font-semibold">{current?.label ?? "Dashboard"}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <SignedIn>
              <Link
                href="/ats"
                className="hidden sm:inline text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                ATS Dashboard
              </Link>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="hidden sm:inline text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors"
                >
                  ATS Sign in
                </button>
              </SignInButton>
              <UserMenu />
            </SignedOut>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
