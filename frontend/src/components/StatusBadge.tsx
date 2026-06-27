import clsx from "clsx";

const styles: Record<string, string> = {
  Applied: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  Interviewing: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  Offer: "bg-green-50 text-green-700 ring-1 ring-green-200",
  Rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
  Saved: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const dotStyles: Record<string, string> = {
  Applied: "bg-blue-500",
  Interviewing: "bg-purple-500",
  Offer: "bg-green-500",
  Rejected: "bg-red-500",
  Saved: "bg-slate-400",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold",
        styles[status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      )}
    >
      <span className={clsx("w-1.5 h-1.5 rounded-full", dotStyles[status] ?? "bg-slate-400")} />
      {status}
    </span>
  );
}
