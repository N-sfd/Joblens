export default function OffersPage() {
  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <p className="page-kicker">ATS</p>
      <h1 className="page-title">Offers</h1>
      <p className="page-subtitle">Offers extended to consultants for client roles.</p>
      <div className="card p-10 mt-6 text-center">
        <p className="text-slate-500 font-medium">No offers yet.</p>
        <p className="text-slate-400 text-sm mt-1">Offers will appear here once submissions reach the offer stage.</p>
      </div>
    </div>
  );
}
