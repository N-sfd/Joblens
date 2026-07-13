/** URL helpers — Greenhouse hosts only for M1 active analysis. */

const GREENHOUSE_HOSTS = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
]);

export function isSupportedGreenhouseUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (GREENHOUSE_HOSTS.has(host)) return true;
    // Embedded boards sometimes use gh_jid on employer domains — M1 does not
    // request host permission for those; document before expanding.
    return false;
  } catch {
    return false;
  }
}

export function extractBoardToken(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/greenhouse\.io\/([^/?#]+)/i);
  return m?.[1] ?? null;
}

export function normalizeJobLensOrigin(raw: string): string {
  return raw.trim().replace(/\/$/, "").replace(/\/api\/?$/i, "");
}
