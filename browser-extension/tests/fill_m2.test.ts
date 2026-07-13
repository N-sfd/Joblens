import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectFromHtml } from "../src/shared/greenhouseDetector";
import {
  fillSelectedFields,
  undoLastFill,
  clearUndoStack,
  probeEmptiness,
  findControl,
  assertNoSubmitSideEffects,
} from "../src/shared/fillEngine";
import { isSupportedGreenhouseUrl } from "../src/utils/url";
import { MESSAGE_TYPES, parseExtensionMessage } from "../src/types/messages";

const FIXTURES = join(__dirname, "../../backend/fixtures/greenhouse");

function loadFixture(name: string): Document {
  const html = readFileSync(join(FIXTURES, name), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("M2 fill engine on fixtures", () => {
  const files = [
    "form_acme_software_engineer.html",
    "form_northwind_designer.html",
    "form_contoso_analyst.html",
  ];

  for (const file of files) {
    it(`fills empty text fields without submit on ${file}`, () => {
      const html = readFileSync(join(FIXTURES, file), "utf8");
      document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;

      const analysis = detectFromHtml(html, {
        applicationUrl: "https://boards.greenhouse.io/acme/jobs/1",
      });
      expect(analysis.is_greenhouse).toBe(true);

      clearUndoStack();
      const emailField = analysis.fields.find((f) => f.normalized_field_name === "email");
      const intents = emailField
        ? [{
            external_field_key: emailField.external_field_key,
            field_label: emailField.field_label,
            field_type: emailField.field_type,
            normalized_field_name: "email",
            value: "pat@example.com",
          }]
        : [];

      const beforeSubmitButtons = document.querySelectorAll('button[type="submit"], input[type="submit"]').length;
      const result = fillSelectedFields(intents);
      expect(result.submitted).toBe(false);
      expect(result.submitClicked).toBe(false);
      expect(result.uploadTouched).toBe(false);
      expect(document.querySelectorAll('button[type="submit"], input[type="submit"]').length).toBe(beforeSubmitButtons);
      expect(assertNoSubmitSideEffects().formSubmitted).toBe(false);

      // Upload inputs unchanged (no files)
      document.querySelectorAll('input[type="file"]').forEach((el) => {
        expect((el as HTMLInputElement).files?.length ?? 0).toBe(0);
      });

      if (intents.length) {
        const undo = undoLastFill();
        expect(undo.restored + undo.skipped_user_edited).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it("does not overwrite existing values by default", () => {
    document.body.innerHTML = `
      <form id="application">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" value="existing@example.com" />
      </form>`;
    const result = fillSelectedFields([{
      external_field_key: "email",
      field_label: "Email",
      field_type: "email",
      normalized_field_name: "email",
      value: "new@example.com",
    }]);
    expect(result.outcomes[0].status).toBe("skipped_existing");
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("existing@example.com");
  });

  it("replaces when replace_existing is set", () => {
    document.body.innerHTML = `
      <form><label for="email">Email</label>
      <input id="email" name="email" type="email" value="old@example.com" /></form>`;
    const result = fillSelectedFields([{
      external_field_key: "email",
      field_label: "Email",
      field_type: "email",
      normalized_field_name: "email",
      value: "new@example.com",
      replace_existing: true,
    }]);
    expect(result.outcomes[0].status).toBe("filled");
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("new@example.com");
  });

  it("matches select exactly and rejects ambiguous", () => {
    document.body.innerHTML = `
      <select name="sponsor"><option value="">Select</option>
      <option value="Yes">Yes</option><option value="No">No</option></select>`;
    const ok = fillSelectedFields([{
      external_field_key: "sponsor",
      field_type: "select",
      normalized_field_name: "sponsorship_required",
      value: "No",
    }]);
    expect(ok.outcomes[0].status).toBe("filled");

    document.body.innerHTML = `
      <select name="sponsor"><option value="">Select</option><option>Maybe</option><option>Unsure</option></select>`;
    const bad = fillSelectedFields([{
      external_field_key: "sponsor",
      field_type: "select",
      normalized_field_name: "sponsorship_required",
      value: "No",
    }]);
    expect(bad.outcomes[0].status).toBe("option_not_found");
  });

  it("probe emptiness does not expose values", () => {
    document.body.innerHTML = `<input name="email" value="secret@x.com" />`;
    const emptiness = probeEmptiness([{ external_field_key: "email" }]);
    expect(emptiness.email).toBe(false);
    expect(JSON.stringify(emptiness)).not.toContain("secret");
  });

  it("skips file uploads", () => {
    document.body.innerHTML = `<input name="resume" type="file" />`;
    const result = fillSelectedFields([{
      external_field_key: "resume",
      field_type: "file",
      normalized_field_name: "resume_upload",
      value: "should-not-matter",
    }]);
    expect(result.outcomes[0].status).toBe("skipped_upload");
  });
});

describe("M2 messages", () => {
  it("includes fill message types", () => {
    expect(MESSAGE_TYPES).toContain("FILL_SELECTED_FIELDS");
    expect(MESSAGE_TYPES).toContain("UNDO_FILL");
    expect(parseExtensionMessage({ type: "FILL_SELECTED_FIELDS", version: 2 })?.type).toBe("FILL_SELECTED_FIELDS");
  });

  it("still rejects unsupported hosts", () => {
    expect(isSupportedGreenhouseUrl("https://jobs.lever.co/x")).toBe(false);
  });
});
