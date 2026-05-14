"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Circle, Bot } from "lucide-react";
import clsx from "clsx";

interface AgentActivityProps {
  steps: string[];
  isRunning: boolean;
  isDone: boolean;
  stepDuration?: number;
  className?: string;
}

export default function AgentActivity({
  steps,
  isRunning,
  isDone,
  stepDuration = 700,
  className,
}: AgentActivityProps) {
  const [current, setCurrent] = useState(-1);

  // Start animation when running begins
  useEffect(() => {
    if (isRunning) setCurrent(0);
  }, [isRunning]);

  // Advance one step at a time while running
  useEffect(() => {
    if (!isRunning || isDone || current < 0 || current >= steps.length - 1) return;
    const t = setTimeout(() => setCurrent((c) => c + 1), stepDuration);
    return () => clearTimeout(t);
  }, [isRunning, isDone, current, steps.length, stepDuration]);

  // When API returns, complete all remaining steps instantly
  useEffect(() => {
    if (isDone) setCurrent(steps.length);
  }, [isDone, steps.length]);

  if (!isRunning && !isDone) return null;

  return (
    <div className={clsx("card p-5 border-indigo-100", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
          <Bot size={13} className="text-indigo-600" />
        </div>
        <span className="font-semibold text-slate-700 text-sm">Agent Activity</span>
        <span className="ml-auto flex items-center gap-1.5">
          {isRunning && !isDone ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-600 font-medium">Running</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span className="text-xs text-slate-400 font-medium">Complete</span>
            </>
          )}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-2.5">
        {steps.map((step, i) => {
          const done = isDone || i < current;
          const active = !isDone && i === current && isRunning;
          const pending = !done && !active;

          return (
            <div
              key={i}
              className={clsx(
                "flex items-center gap-3 text-sm transition-all duration-300",
                pending && "opacity-40",
                active && "opacity-100",
                done && "opacity-100"
              )}
            >
              {done ? (
                <CheckCircle size={15} className="text-green-500 shrink-0" />
              ) : active ? (
                <Loader2 size={15} className="text-indigo-500 animate-spin shrink-0" />
              ) : (
                <Circle size={15} className="text-slate-300 shrink-0" />
              )}
              <span
                className={clsx(
                  "transition-colors duration-200",
                  done && "text-slate-700",
                  active && "text-indigo-600 font-medium",
                  pending && "text-slate-400"
                )}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
