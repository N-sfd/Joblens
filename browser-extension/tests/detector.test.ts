import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectFromHtml,
  normalizeFieldLabel,
  structuralFingerprint,
} from "../src/shared/greenhouseDetector";
import { isSupportedGreenhouseUrl } from "../src/utils/url";
import {
  assertNoValuesInAnalysis,
  parseExtensionMessage,
  MESSAGE_TYPES,
} from "../src/types/messages";

const FIXTURES = join(__dirname, "../../backend/fixtures/greenhouse");

describe("Greenhouse URL detection", () => {
  it("accepts boards.greenhouse.io and job-boards.greenhouse.io", () => {
    expect(isSupportedGreenhouseUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe(true);
    expect(isSupportedGreenhouseUrl("https://job-boards.greenhouse.io/discord/jobs/2")).toBe(true);
  });

  it("rejects unsupported pages", () => {
    expect(isSupportedGreenhouseUrl("https://jobs.lever.co/acme")).toBe(false);
    expect(isSupportedGreenhouseUrl("https://careers.google.com/jobs/1")).toBe(false);
    expect(isSupportedGreenhouseUrl("https://linkedin.com/jobs/view/1")).toBe(false);
    expect(isSupportedGreenhouseUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("M0 HTML fixtures", () => {
  const files = [
    "form_acme_software_engineer.html",
    "form_northwind_designer.html",
    "form_contoso_analyst.html",
  ];

  for (const file of files) {
    it(`detects fields in ${file} without mutation`, () => {
      const html = readFileSync(join(FIXTURES, file), "utf8");
      const doc = new DOMParser().parseFromString(html, "text/html");
      const before = structuralFingerprint(doc);
      const result = detectFromHtml(html, {
        applicationUrl: "https://boards.greenhouse.io/acme/jobs/1",
      });
      const after = structuralFingerprint(doc);
      expect(before).toBe(after);
      expect(result.page_mutated).toBe(false);
      expect(result.filled_any_fields).toBe(false);
      expect(result.submitted).toBe(false);
      expect(result.is_greenhouse).toBe(true);
      expect(result.fields.length).toBeGreaterThan(0);
      assertNoValuesInAnalysis(result);
      for (const f of result.fields) {
        expect((f as { value?: unknown }).value).toBeUndefined();
      }
    });
  }

  it("acme fixture finds supported + sensitive", () => {
    const html = readFileSync(join(FIXTURES, "form_acme_software_engineer.html"), "utf8");
    const result = detectFromHtml(html, {
      applicationUrl: "https://boards.greenhouse.io/acme/jobs/1",
    });
    expect(result.supported_fields).toEqual(
      expect.arrayContaining(["first_name", "last_name", "email", "resume_upload"]),
    );
    expect(result.sensitive_fields.length).toBeGreaterThan(0);
    expect(result.upload_controls.length).toBeGreaterThan(0);
    expect(result.required_fields.length).toBeGreaterThan(0);
  });
});

describe("classification", () => {
  it("classifies sensitive, legal, custom", () => {
    expect(normalizeFieldLabel("Gender (Voluntary)", "text").classification).toBe("sensitive_question");
    expect(normalizeFieldLabel("I certify my answers are true", "checkbox").classification).toBe(
      "legal_attestation",
    );
    expect(normalizeFieldLabel("Why do you want this role?", "textarea").classification).toBe(
      "custom_question",
    );
    expect(normalizeFieldLabel("First Name", "text")).toMatchObject({
      normalized: "first_name",
      classification: "supported",
    });
    expect(normalizeFieldLabel("Expected salary", "text").classification).toBe("unsupported");
  });
});

describe("message schema", () => {
  it("validates known types", () => {
    expect(parseExtensionMessage({ type: "ANALYZE_FORM" })?.type).toBe("ANALYZE_FORM");
    expect(parseExtensionMessage({ type: "NOT_A_TYPE" })).toBeNull();
    expect(MESSAGE_TYPES).toContain("SAVE_DIAGNOSTIC");
  });
});
