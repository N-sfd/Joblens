import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ZohoSettingsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link href="/ats/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Settings
      </Link>

      <div className="mb-6">
        <p className="page-kicker">Integration</p>
        <h1 className="page-title">Zoho Mail</h1>
        <p className="page-subtitle">Securely connect a Zoho mailbox to import recruiter job emails.</p>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900 text-sm">Connection status</p>
            <p className="text-xs text-slate-500 mt-0.5">Not connected</p>
          </div>
          <button className="btn-primary" disabled title="OAuth backend is implemented in a later phase">
            Connect Zoho Mail
          </button>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
          <p className="text-sm text-amber-800 font-medium">Setup in progress</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Zoho OAuth uses backend-only token storage (refresh tokens are encrypted at rest and never
            exposed to the browser). The connect flow and Sync Now are enabled once backend Zoho
            credentials are configured.
          </p>
        </div>
      </div>
    </div>
  );
}
