"use client";

import { useState } from "react";
import { History, ChevronDown, ChevronUp } from "lucide-react";

interface HistoryPanelProps<T> {
  title?: string;
  items: T[];
  loading: boolean;
  getKey: (item: T) => number;
  renderItem: (item: T) => { primary: string; secondary?: string; date: string };
  onSelect: (item: T) => void;
}

export default function HistoryPanel<T>({
  title = "History",
  items,
  loading,
  getKey,
  renderItem,
  onSelect,
}: HistoryPanelProps<T>) {
  const [open, setOpen] = useState(false);

  if (!loading && items.length === 0) return null;

  return (
    <div className="card mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <History size={14} className="text-indigo-500" /> {title}
          {items.length > 0 && <span className="text-xs text-slate-400 font-normal">({items.length})</span>}
        </span>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {loading ? (
            <p className="px-5 py-4 text-sm text-slate-400">Loading...</p>
          ) : (
            items.slice(0, 10).map((item) => {
              const { primary, secondary, date } = renderItem(item);
              return (
                <button
                  key={getKey(item)}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{primary}</p>
                    {secondary && <p className="text-xs text-slate-400 truncate">{secondary}</p>}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
