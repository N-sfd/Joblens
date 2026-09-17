import Link from "next/link";
import Image from "next/image";
import LogoMark from "@/components/Logo";
import UserMenu from "@/components/UserMenu";
import CtaButtons from "@/components/CtaButtons";
import { LEGAL_LINKS } from "@/components/legal/LegalPageShell";

const STORY = [
  {
    src: "/images/joblens-resume-review.jpg",
    alt: "Hands reviewing a printed résumé beside a notebook",
    title: "Start with your résumé",
    desc: "Upload PDF, DOCX, or paste text. JobLens structures experience for evidence mapping — not keyword stuffing.",
  },
  {
    src: "/images/joblens-workspace.jpg",
    alt: "Laptop and résumé on a professional desk",
    title: "Match against a real job",
    desc: "Paste the description. See which requirements are demonstrated, related, weak, or missing.",
  },
  {
    src: "/images/joblens-interview.jpg",
    alt: "Professional interview conversation in a bright office",
    title: "Apply with clarity",
    desc: "Strengthen real evidence, skip invented skills, and walk into interviews knowing why you align.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-white text-slate-900">
      <header className="absolute top-0 inset-x-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/15 backdrop-blur-sm border border-white/25 rounded-lg flex items-center justify-center">
              <LogoMark size={16} className="text-white" />
            </div>
            <span className="font-bold text-white tracking-tight drop-shadow-sm">JobLens</span>
          </div>
          <nav className="hidden sm:flex items-center gap-7 text-sm font-medium text-white/85">
            <a href="#story" className="hover:text-white transition-colors">Product</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
            <a href="#trust" className="hover:text-white transition-colors">Privacy</a>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block [&_button]:text-white [&_a]:text-white">
              <UserMenu />
            </div>
            <Link
              href="/match"
              className="rounded-lg bg-white text-slate-900 text-sm font-semibold py-2 px-4 hover:bg-slate-100 transition-colors"
            >
              Analyze Alignment
            </Link>
          </div>
        </div>
      </header>

      {/* Full-bleed photo hero — no synthetic panels */}
      <section className="relative min-h-[88vh] sm:min-h-[92vh] flex items-end sm:items-center">
        <Image
          src="/images/joblens-hero-photo.jpg"
          alt="Professional reviewing career materials at a modern desk"
          fill
          priority
          className="object-cover object-[center_30%]"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-900/55 to-slate-900/25" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-slate-950/30" />

        <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16 pt-28 sm:py-28">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200 mb-4">
            JobLens — AI Career Intelligence
          </p>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.05] max-w-2xl mb-5">
            Know why you match — not just the score.
          </h1>
          <p className="text-base sm:text-lg text-slate-200 leading-relaxed max-w-xl mb-8">
            JobLens analyzes your résumé against a job description and shows the skills, experience, evidence, and gaps behind every score.
          </p>
          <CtaButtons className="mb-6 [&_.btn-primary]:bg-white [&_.btn-primary]:text-slate-900 [&_.btn-primary]:hover:bg-slate-100 [&_.btn-secondary]:bg-white/10 [&_.btn-secondary]:text-white [&_.btn-secondary]:border-white/30 [&_.btn-secondary]:hover:bg-white/20" />
          <p className="text-sm text-slate-300">
            Resume + Job → Explainable AI Match · Not a hiring prediction
          </p>
        </div>
      </section>

      {/* Image-led product story */}
      <section id="story" className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-12 sm:mb-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              Evidence over keywords
            </h2>
            <p className="text-slate-500 text-base sm:text-lg leading-relaxed">
              See which job requirements your résumé clearly demonstrates, where evidence is weak, and what you can improve — with structured requirement analysis and evidence-based matching.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-16 sm:space-y-24">
          {STORY.map((item, i) => (
            <div
              key={item.title}
              className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center ${
                i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-sm">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
              <div className="max-w-md">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 mb-3">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">{item.title}</h3>
                <p className="text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — text strip, no card grid */}
      <section id="how-it-works" className="relative py-20 sm:py-28 overflow-hidden">
        <Image
          src="/images/joblens-hero-career.jpg"
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-slate-950/85" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight mb-10 max-w-lg">
            How it works
          </h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10">
            {[
              "Upload your résumé",
              "Paste a job description",
              "Review evidence and gaps",
              "Improve what you already have",
            ].map((label, i) => (
              <li key={label} className="text-white">
                <span className="block text-indigo-300 text-sm font-semibold mb-2">{i + 1}</span>
                <span className="text-lg font-semibold leading-snug">{label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-12">
            <Link
              href="/match"
              className="inline-flex items-center rounded-lg bg-white text-slate-900 text-sm font-semibold py-3 px-6 hover:bg-slate-100 transition-colors"
            >
              Analyze Resume Against a Job
            </Link>
          </div>
        </div>
      </section>

      {/* Alignment snapshot — compact, not a fake browser chrome */}
      <section className="py-16 sm:py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="relative aspect-[4/3] overflow-hidden">
            <Image
              src="/images/joblens-workspace.jpg"
              alt="Workspace ready for résumé and job analysis"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600 mb-3">
              What you get
            </p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
              Transparent alignment
            </h2>
            <p className="text-slate-500 leading-relaxed mb-8">
              Overall alignment with required vs preferred skills, strong evidence, related experience, and honest gaps — never a hiring prediction.
            </p>
            <dl className="space-y-4 border-t border-slate-200 pt-6">
              {[
                { k: "Overall Alignment", v: "87% · Strong alignment" },
                { k: "Required Skills", v: "93%" },
                { k: "Experience", v: "86%" },
                { k: "Preferred Skills", v: "69%" },
                { k: "Strong evidence", v: "Python · FastAPI · SQL" },
                { k: "Needs stronger evidence", v: "AWS · Kubernetes" },
              ].map((row) => (
                <div key={row.k} className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4">
                  <dt className="text-sm text-slate-500">{row.k}</dt>
                  <dd className="text-sm font-semibold text-slate-900">{row.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Secondary tools — quiet text row, not a card wall */}
      <section className="py-12 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 shrink-0">
            Also available
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            <Link href="/jobs" className="hover:text-indigo-600 transition-colors">Job Tracker</Link>
            <Link href="/cover-letter" className="hover:text-indigo-600 transition-colors">Cover Letter</Link>
            <Link href="/reminders" className="hover:text-indigo-600 transition-colors">Reminders</Link>
            <Link href="/dashboard" className="hover:text-indigo-600 transition-colors">Dashboard</Link>
          </div>
        </div>
      </section>

      {/* Trust on photo */}
      <section id="trust" className="relative py-20 sm:py-28 overflow-hidden">
        <Image
          src="/images/joblens-interview.jpg"
          alt=""
          fill
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-slate-950/80" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight mb-10 max-w-xl">
            Your career data, handled responsibly
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 text-slate-200">
            <div>
              <h3 className="font-semibold text-white mb-2">No account required</h3>
              <p className="text-sm leading-relaxed text-slate-300">
                Analyze immediately. Sign in only if you want to save.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">Your data stays yours</h3>
              <p className="text-sm leading-relaxed text-slate-300">
                Résumés and jobs are processed for results — never sold or shared.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">Explainable decisions</h3>
              <p className="text-sm leading-relaxed text-slate-300">
                Every major claim links back to résumé evidence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <Image
          src="/images/joblens-resume-review.jpg"
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-white/88" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
            Ready to make your next application more informed?
          </h2>
          <p className="text-slate-600 mb-8 leading-relaxed">
            Upload a résumé, paste a job, and see the evidence behind your alignment score.
          </p>
          <CtaButtons className="justify-center" />
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <LogoMark size={13} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">JobLens</span>
          </div>
          <p className="text-xs text-slate-400">AI Career Intelligence — evidence-based résumé ↔ job alignment.</p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-slate-700 transition-colors">{l.label}</Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
