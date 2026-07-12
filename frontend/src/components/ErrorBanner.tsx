import { AlertTriangle, RefreshCw, X } from "lucide-react";
import clsx from "clsx";

interface Props {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorBanner({ message, onDismiss, onRetry, className }: Props) {
  return (
    <div className={clsx("flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl px-4 py-3.5", className)}>
      <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0 mt-0.5">
        <AlertTriangle size={14} className="text-red-600 dark:text-red-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-800 dark:text-red-300">Something went wrong</p>
        <p className="text-sm text-red-600/90 dark:text-red-400/90 mt-0.5 leading-relaxed">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 transition-colors"
          >
            <RefreshCw size={12} /> Try again
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={onDismiss}
          className="text-red-400 hover:text-red-600 dark:hover:text-red-300 shrink-0 transition-colors"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
