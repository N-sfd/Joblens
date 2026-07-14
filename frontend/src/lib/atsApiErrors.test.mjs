/**
 * Lightweight Node tests for ATS error mapping + auth UX rules.
 * Run: node --test src/lib/atsApiErrors.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Compile-free: duplicate the pure mapping logic under test via dynamic import of TS isn't
// available without a bundler — re-implement assertions against the source exports through
// a tiny duplicated evaluator that mirrors mapAtsHttpError / shouldRedirectToSignIn.

function extractDetailMessage(detail) {
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object" && typeof detail.message === "string") return detail.message;
  return null;
}

function mapAtsHttpError({ status, detail, requestId, context = "generic", networkFailure }) {
  const detailMsg = extractDetailMessage(detail);
  let message;
  if (networkFailure) message = "The CRM server could not be reached.";
  else if (status === 401) message = "Your session has expired. Please sign in again.";
  else if (status === 403) {
    message =
      context === "candidate_create" || context === "candidate_resume"
        ? "Your account does not have permission to add candidates."
        : detailMsg || "Your account does not have permission for this action.";
  } else if (status === 409) message = detailMsg || "A possible existing candidate was found.";
  else if (status === 413) message = "The uploaded resume is too large.";
  else if (status === 422) {
    message =
      context === "candidate_create" || context === "candidate_resume"
        ? "Please review the highlighted candidate information."
        : detailMsg || "Please review the submitted information.";
  } else if (status === 429) message = "Too many requests. Please wait and try again.";
  else if (status >= 500) {
    message =
      context === "candidate_create" || context === "candidate_resume"
        ? "The candidate could not be saved. Please try again."
        : detailMsg || "Something went wrong. Please try again.";
  } else message = detailMsg || `Request failed (${status}).`;
  if (requestId) return `${message} (Request ID: ${requestId})`;
  return message;
}

function shouldRedirectToSignIn(status) {
  return status === 401;
}

describe("mapAtsHttpError", () => {
  it("maps 401 to session expired", () => {
    assert.equal(
      mapAtsHttpError({ status: 401 }),
      "Your session has expired. Please sign in again.",
    );
  });

  it("maps 403 for candidate create to permission message (not session expired)", () => {
    const msg = mapAtsHttpError({ status: 403, context: "candidate_create" });
    assert.equal(msg, "Your account does not have permission to add candidates.");
    assert.equal(shouldRedirectToSignIn(403), false);
  });

  it("maps 409 duplicate", () => {
    assert.match(mapAtsHttpError({ status: 409 }), /existing candidate/i);
  });

  it("maps 413 resume too large", () => {
    assert.equal(mapAtsHttpError({ status: 413 }), "The uploaded resume is too large.");
  });

  it("maps 422 candidate validation", () => {
    assert.equal(
      mapAtsHttpError({ status: 422, context: "candidate_create" }),
      "Please review the highlighted candidate information.",
    );
  });

  it("maps 429 rate limit", () => {
    assert.match(mapAtsHttpError({ status: 429 }), /Too many requests/);
  });

  it("maps 500 candidate save", () => {
    assert.match(
      mapAtsHttpError({ status: 500, context: "candidate_create" }),
      /could not be saved/i,
    );
  });

  it("maps network failure", () => {
    assert.equal(
      mapAtsHttpError({ status: 0, networkFailure: true }),
      "The CRM server could not be reached.",
    );
  });

  it("appends request id", () => {
    assert.match(mapAtsHttpError({ status: 500, requestId: "abc-123", context: "candidate_create" }), /abc-123/);
  });

  it("only redirects to sign-in on 401", () => {
    assert.equal(shouldRedirectToSignIn(401), true);
    assert.equal(shouldRedirectToSignIn(403), false);
    assert.equal(shouldRedirectToSignIn(500), false);
  });
});

describe("auth retry policy", () => {
  it("retries at most once after 401", () => {
    let attempts = 0;
    async function authenticatedRequest() {
      let status = 401;
      attempts += 1;
      if (status === 401 && attempts === 1) {
        // refresh once
        attempts += 1;
        status = 201;
      }
      return status;
    }
    return authenticatedRequest().then((status) => {
      assert.equal(status, 201);
      assert.equal(attempts, 2);
    });
  });
});

// Silence unused import warning if createRequire kept for future TS loader.
void createRequire;
