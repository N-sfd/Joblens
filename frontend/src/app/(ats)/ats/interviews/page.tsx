export default function InterviewsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <p className="page-kicker">ATS</p>
      <h1 className="page-title">Interviews</h1>
      <p className="page-subtitle">Track candidate interviews across active submissions.</p>
      <div className="card p-10 mt-6 text-center">
        <p className="text-slate-500 font-medium">No interviews yet.</p>
        <p className="text-slate-400 text-sm mt-1">Interviews will appear here once submissions advance to the interview stage.</p>
      </div>
    </div>
  );
}
