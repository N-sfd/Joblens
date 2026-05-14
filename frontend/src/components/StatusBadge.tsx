import clsx from "clsx";

const styles: Record<string, string> = {
  Applied: "bg-blue-100 text-blue-700",
  Interviewing: "bg-purple-100 text-purple-700",
  Offer: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  Saved: "bg-slate-100 text-slate-600",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
        styles[status] ?? "bg-slate-100 text-slate-600"
      )}
    >
      {status}
    </span>
  );
}
