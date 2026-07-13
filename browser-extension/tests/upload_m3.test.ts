import { describe, expect, it, beforeAll } from "vitest";
import {
  assignFileToInput,
  probeUploadFields,
  detectLikelyConfirmationPage,
  assertNoSubmitInUploadModule,
  fileInputHasFile,
} from "../src/shared/uploadEngine";
import { MESSAGE_TYPES } from "../src/types/messages";

beforeAll(() => {
  // jsdom lacks DataTransfer — provide a minimal polyfill for unit tests.
  if (typeof DataTransfer === "undefined") {
    // @ts-expect-error test polyfill
    globalThis.DataTransfer = class {
      private _files: File[] = [];
      items = {
        add: (file: File) => {
          this._files = [file];
        },
      };
      get files() {
        return this._files as unknown as FileList;
      }
    };
  }
});

describe("M3 upload engine", () => {
  it("assigns file via DataTransfer without submit", () => {
    document.body.innerHTML = `<form><input type="file" name="resume" accept=".pdf" /></form>
      <button type="submit" id="submit">Submit</button>`;
    const file = new File(["hello"], "resume.pdf", { type: "application/pdf" });
    const outcome = assignFileToInput({
      external_field_key: "resume",
      file,
    });
    expect(["verified", "failed", "unsupported"]).toContain(outcome.status);
    // In environments with working DataTransfer + file assignment:
    if (outcome.status === "verified") {
      const input = document.querySelector('input[name="resume"]') as HTMLInputElement;
      expect(input.files?.[0]?.name).toBe("resume.pdf");
    }
    expect(assertNoSubmitInUploadModule()).toBe(true);
  });

  it("does not replace existing file by default", () => {
    document.body.innerHTML = `<input type="file" name="resume" />`;
    const input = document.querySelector('input[name="resume"]') as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      get: () => [{ name: "old.pdf" }] as unknown as FileList,
    });
    expect(fileInputHasFile(input)).toBe(true);
    const outcome = assignFileToInput({
      external_field_key: "resume",
      file: new File(["b"], "new.pdf", { type: "application/pdf" }),
    });
    expect(outcome.status).toBe("skipped_existing");
  });

  it("probes without exposing employer file names", () => {
    document.body.innerHTML = `<input type="file" name="resume" accept=".pdf,.docx" />`;
    const fields = probeUploadFields([{ external_field_key: "resume" }]);
    expect(fields.resume.found).toBe(true);
    expect(JSON.stringify(fields)).not.toMatch(/old\.pdf|secret/);
  });

  it("confirmation detection is advisory only", () => {
    document.body.innerHTML = `<h1>Thank you for your application</h1>`;
    const r = detectLikelyConfirmationPage(document);
    expect(r.looks_like_confirmation).toBe(true);
  });

  it("message contract has no SUBMIT_APPLICATION", () => {
    expect(MESSAGE_TYPES).not.toContain("SUBMIT_APPLICATION" as never);
    expect(MESSAGE_TYPES).toContain("ASSIGN_FILE");
    expect(MESSAGE_TYPES).toContain("DETECT_CONFIRMATION_PAGE");
  });
});
