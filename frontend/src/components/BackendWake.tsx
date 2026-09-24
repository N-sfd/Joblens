"use client";

import { useEffect } from "react";
import { prefetchWakeBackend } from "@/lib/wakeBackend";

/** Starts waking the Render API as soon as seeker pages mount. */
export default function BackendWake() {
  useEffect(() => {
    prefetchWakeBackend();
  }, []);
  return null;
}
