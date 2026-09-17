/** Map CRM ATS HTTP failures to user-facing copy. Never treat every failure as “session expired”. */

export type AtsErrorContext =
  | "generic"
  | "candidate_create"
  | "candidate_resume"
  | "candidate_duplicate";

export function mapAtsHttpError(opts: {
  status: number;
  detail?: unknown;
  requestId?: string | null;
  context?: AtsErrorContext;
  networkFailure?: boolean;
}): string {
  const { status, detail, requestId, context = "generic", networkFailure } = opts;
  const detailMsg = extractDetailMessage(detail);

  let message: string;
  if (networkFailure) {
    message = "The CRM server could not be reached.";
  } else if (status === 401) {
    message = "Your session has expired. Please sign in again.";
  } else if (status === 403) {
    message =
      context === "candidate_create" || context === "candidate_resume"
        ? "Your account does not have permission to add candidates."
        : detailMsg || "Your account does not have permission for this action.";
  } else if (status === 409) {
    message = detailMsg || "A possible existing candidate was found.";
  } else if (status === 413) {
    message = "The uploaded resume is too large.";
  } else if (status === 422) {
    message =
      context === "candidate_create" || context === "candidate_resume"
        ? "Please review the highlighted candidate information."
        : detailMsg || "Please review the submitted information.";
  } else if (status === 429) {
    message = "Too many requests. Please wait and try again.";
  } else if (status >= 500) {
    message =
      context === "candidate_create" || context === "candidate_resume"
        ? "The candidate could not be saved. Please try again."
        : detailMsg || "Something went wrong. Please try again.";
  } else {
    message = detailMsg || `Request failed (${status}).`;
  }

  if (requestId) {
    return `${message} (Request ID: ${requestId})`;
  }
  return message;
}

export function extractDetailMessage(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: unknown }).msg);
        return null;
      })
      .filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }
  if (detail && typeof detail === "object") {
    if ("message" in detail && typeof (detail as { message: unknown }).message === "string") {
      return String((detail as { message: string }).message);
    }
    if ("msg" in detail) {
      return String((detail as { msg: unknown }).msg);
    }
  }
  return null;
}

/** Whether a failed request should redirect to sign-in (after refresh retry). */
export function shouldRedirectToSignIn(status: number): boolean {
  return status === 401;
}
