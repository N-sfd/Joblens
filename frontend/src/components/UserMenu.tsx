"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import AuthModal from "./AuthModal";

export default function UserMenu() {
  const { user, isLoading, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showMenu]);

  if (isLoading) {
    return <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" />;
  }

  if (!user) {
    return (
      <>
        <div className="flex items-center gap-2.5">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            Guest Session
          </span>
          <button
            type="button"
            onClick={() => setShowAuth(true)}
            className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 rounded-lg transition-colors"
          >
            Sign in
          </button>
        </div>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  const initial = (user.name || user.email)[0].toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setShowMenu((v) => !v)}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center">
          {initial}
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-100 dark:border-slate-800 py-1.5 z-40">
          <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{user.name || "Account"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => { setShowMenu(false); signOut(); }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
