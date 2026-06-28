"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, CheckCircle2, AlertTriangle, UserX } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";
import LegalPageShell from "@/components/legal/LegalPageShell";
import LegalSection from "@/components/legal/LegalSection";

type Confirming = "data" | "account" | null;

export default function DataDeletionPage() {
  const { user, isLoading, signOut } = useAuth();
  const router = useRouter();

  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Confirming>(null);

  const wipeData = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteMyData();
      setDone("data");
      setConfirming(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete your data.");
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      setDone("account");
      setConfirming(null);
      await signOut().catch(() => {});
      setTimeout(() => router.push("/"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete your account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <LegalPageShell
      title="Data Deletion Request"
      icon={Trash2}
      intro="Delete everything JobLens has stored for you — instantly, no waiting on a support ticket."
    >
      {done && (
        <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <p>
            {done === "data"
              ? "All your data has been permanently deleted. Your session is now empty."
              : "Your account and all associated data have been permanently deleted. Signing you out…"}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <LegalSection title="Delete all my data">
        <p>
          This permanently removes every resume analysis, job match, cover letter, tracked job application, and AI
          activity entry tied to your current {user ? "account" : "guest session"}. This works whether or not you
          have an account.
        </p>
        {confirming === "data" ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-2">
            <p className="text-sm font-medium text-amber-800 mb-3">
              Are you sure? This can't be undone.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={wipeData} disabled={busy} className="btn-danger flex items-center gap-2">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Yes, delete all my data
              </button>
              <button type="button" onClick={() => setConfirming(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming("data")} className="btn-danger inline-flex items-center gap-2 mt-1">
            <Trash2 size={14} /> Delete all my data
          </button>
        )}
      </LegalSection>

      <LegalSection title="Delete my account">
        {isLoading ? (
          <p className="text-slate-400">Checking your session…</p>
        ) : user ? (
          <>
            <p>
              In addition to wiping your data, this also permanently deletes your account ({user.email}). You'll be
              signed out and will need to sign up again to use an account.
            </p>
            {confirming === "account" ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-2">
                <p className="text-sm font-medium text-red-800 mb-3">
                  This permanently deletes your account and cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={deleteAccount} disabled={busy} className="btn-danger flex items-center gap-2">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <UserX size={14} />}
                    Yes, delete my account
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="btn-secondary">Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming("account")} className="btn-danger inline-flex items-center gap-2 mt-1">
                <UserX size={14} /> Delete my account
              </button>
            )}
          </>
        ) : (
          <p>
            You're currently using a guest session, so there's no account to delete — use{" "}
            <strong>"Delete all my data"</strong> above instead. If you'd previously created an account,{" "}
            <Link href="/">sign in</Link> first to delete it.
          </p>
        )}
      </LegalSection>

      <LegalSection title="What this does not delete">
        <p>
          Deleting your data removes it from JobLens's database immediately. It does not retract anything you've already
          sent to an employer (cover letters, applications) or copies you've downloaded locally. If you've asked our AI
          provider to process a request, that request is not retained by them beyond what's needed to return the
          response — see our <Link href="/privacy">Privacy Policy</Link> for details.
        </p>
      </LegalSection>

      <LegalSection title="Need help instead?">
        <p>
          If something doesn't work as expected, or you have questions before deleting anything, reach out via our{" "}
          <Link href="/contact">Contact Support</Link> page first.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
