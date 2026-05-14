"use client";

import { useState } from "react";
import { Menu, Briefcase } from "lucide-react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

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
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <Briefcase size={13} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">JobLens</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
