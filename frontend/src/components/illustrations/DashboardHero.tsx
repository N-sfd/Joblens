import LogoMark from "@/components/Logo";

export default function DashboardHero() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 sm:px-8 py-7 sm:py-8 mb-8 text-white shadow-lg shadow-indigo-900/20">
      <LogoMark size={180} className="absolute -right-8 -bottom-10 text-white/[0.08] pointer-events-none" />
      <div className="absolute right-16 top-6 w-2 h-2 rounded-full bg-white/20" />
      <div className="absolute right-32 top-14 w-1.5 h-1.5 rounded-full bg-white/15" />

      <div className="relative z-10 max-w-lg">
        <h2 className="text-xl sm:text-2xl font-bold mb-2">Your job search, accelerated by AI</h2>
        <p className="text-indigo-100/90 text-sm leading-relaxed">
          JobLens helps job seekers analyze resumes, match jobs, track applications, and generate tailored cover letters — all in one place.
        </p>
      </div>
    </div>
  );
}
