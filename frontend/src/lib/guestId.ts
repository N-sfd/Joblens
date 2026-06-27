const STORAGE_KEY = "guestId";

/** Stable anonymous ID for job tracker (no login). Created on first visit. */
export function getGuestId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
