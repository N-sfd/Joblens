export default function EmailInboxPage() {
  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <p className="page-kicker">ATS</p>
      <h1 className="page-title">Zoho Email Inbox</h1>
      <p className="page-subtitle">Imported recruiter emails classified for job creation.</p>
      <div className="card p-10 mt-6 text-center">
        <p className="text-slate-500 font-medium">Zoho Mail integration is not connected yet.</p>
        <p className="text-slate-400 text-sm mt-1">
          Connect a mailbox under Settings → Zoho Mail to import and classify recruiter emails.
        </p>
      </div>
    </div>
  );
}
