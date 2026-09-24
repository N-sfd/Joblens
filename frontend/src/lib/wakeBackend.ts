/** Wake the Render free-tier API (sleeps after ~15m idle). Shared across callers. */

let wakePromise: Promise<boolean> | null = null;
let wakeCoolUntil = 0;

/**
 * Ping same-origin `/api/health` (Vercel → Render) and wait for the backend to
 * answer. Cold starts can take 45–90s on free Render.
 */
export function wakeBackend(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (Date.now() < wakeCoolUntil) return Promise.resolve(true);
  if (wakePromise) return wakePromise;

  wakePromise = (async () => {
    try {
      const res = await fetch("/api/health", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) {
        wakeCoolUntil = Date.now() + 5 * 60_000;
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      // Allow a fresh wake attempt after this one settles.
      const finished = wakePromise;
      window.setTimeout(() => {
        if (wakePromise === finished) wakePromise = null;
      }, 2_000);
    }
  })();

  return wakePromise;
}

/** Fire-and-forget warm-up for seeker pages (does not block UI). */
export function prefetchWakeBackend(): void {
  if (typeof window === "undefined") return;
  void wakeBackend();
}
