import clsx from "clsx";

const styles: Record<string, string> = {
  Applied: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-900",
  Interviewing: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-900",
  Offer: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-900",
  Rejected: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-900",
  Saved: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700",
  Withdrawn: "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600",
  "Recruiter Contacted": "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200 dark:ring-teal-900",
  "Application Opened": "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 ring-1 ring-cyan-200 dark:ring-cyan-900",
  "Application In Progress": "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-900",
};

const dotStyles: Record<string, string> = {
  Applied: "bg-blue-500",
  Interviewing: "bg-purple-500",
  Offer: "bg-green-500",
  Rejected: "bg-red-500",
  Saved: "bg-slate-400",
  Withdrawn: "bg-slate-500",
  "Recruiter Contacted": "bg-teal-500",
  "Application Opened": "bg-cyan-500",
  "Application In Progress": "bg-amber-500",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold",
        styles[status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700"
      )}
    >
      <span className={clsx("w-1.5 h-1.5 rounded-full", dotStyles[status] ?? "bg-slate-400")} />
      {status}
    </span>
  );
}
