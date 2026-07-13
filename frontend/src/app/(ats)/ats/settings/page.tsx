import Link from "next/link";
import { Mail, ChevronRight, Shield } from "lucide-react";

export default function AtsSettingsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure integrations, access, and workspace preferences.</p>
      </div>

      <div className="card divide-y divide-slate-100">
        <Link href="/ats/settings/users" className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Shield size={17} className="text-indigo-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-slate-900 text-sm">Staff access</p>
            <p className="text-xs text-slate-500">Assign Recruiter or Admin roles for parse and create actions.</p>
          </div>
          <ChevronRight size={16} className="text-slate-400" />
        </Link>
        <Link href="/ats/settings/zoho" className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Mail size={17} className="text-indigo-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-slate-900 text-sm">Zoho Mail</p>
            <p className="text-xs text-slate-500">Connect a mailbox to import and classify recruiter emails.</p>
          </div>
          <ChevronRight size={16} className="text-slate-400" />
        </Link>
      </div>
    </div>
  );
}
