/**
 * M2 assisted fill — native events only. Never submit, never touch uploads/legal.
 * Undo snapshots stay in content-script memory for the active tab session.
 */

export const MESSAGE_VERSION = 2;

export type FillIntent = {
  external_field_key: string;
  field_label?: string;
  field_type: string;
  normalized_field_name: string;
  value: string;
  replace_existing?: boolean;
  options?: string[];
};

export type FieldFillOutcome = {
  external_field_key: string;
  normalized_field_name: string;
  status:
    | "filled"
    | "skipped_existing"
    | "skipped_upload"
    | "skipped_sensitive"
    | "skipped_unsupported"
    | "failed"
    | "option_not_found"
    | "changed_by_user";
  reason?: string;
};

type UndoEntry = {
  key: string;
  kind: "value" | "select" | "checkbox" | "radio";
  priorValue?: string;
  priorChecked?: boolean;
  priorSelectedIndex?: number;
  el: WeakRef<HTMLElement> | null;
  // Keep a selector fallback because WeakRef may clear
  selector: string;
  userEdited: boolean;
};

const undoStack: UndoEntry[] = [];
let highlightsVisible = true;

const UPLOAD_TYPES = new Set(["file"]);
const FORBIDDEN_SUBMIT = /submit|application_form_submit|btn-submit/i;

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/"/g, '\\"');
}

export function findControl(key: string, label?: string): HTMLElement | null {
  if (!key && !label) return null;
  const byName = key ? document.querySelector(`[name="${cssEscape(key)}"]`) : null;
  if (byName) return byName as HTMLElement;
  const byId = key ? document.getElementById(key) : null;
  if (byId) return byId;
  if (label) {
    const labs = Array.from(document.querySelectorAll("label"));
    for (const lab of labs) {
      if ((lab.textContent || "").trim().toLowerCase() === label.trim().toLowerCase()) {
        const f = lab.getAttribute("for");
        if (f) {
          const el = document.getElementById(f);
          if (el) return el;
        }
        const inner = lab.querySelector("input, textarea, select");
        if (inner) return inner as HTMLElement;
      }
    }
  }
  return null;
}

/** Local emptiness probe — never returns the actual value to callers that send to backend. */
export function isControlEmpty(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "select") {
    const sel = el as HTMLSelectElement;
    const opt = sel.options[sel.selectedIndex];
    const t = (opt?.textContent || opt?.value || "").trim().toLowerCase();
    return !t || t === "select..." || t === "select" || t === "—" || t === "-" || t.startsWith("please select");
  }
  if (tag === "input") {
    const input = el as HTMLInputElement;
    if (input.type === "checkbox" || input.type === "radio") {
      // "empty" means not checked for our fill purposes when setting a value
      return !input.checked;
    }
    if (input.type === "file") return true; // never fill; treat as not our concern
    return !(input.value || "").trim();
  }
  if (tag === "textarea") {
    return !((el as HTMLTextAreaElement).value || "").trim();
  }
  return true;
}

function dispatchInputEvents(el: HTMLElement) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el.tagName.toLowerCase() === "textarea"
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc?.set) desc.set.call(el, value);
  else el.value = value;
}

function matchSelectOption(sel: HTMLSelectElement, value: string): number {
  const target = value.trim().toLowerCase();
  for (let i = 0; i < sel.options.length; i++) {
    const opt = sel.options[i];
    const label = (opt.textContent || "").trim().toLowerCase();
    const val = (opt.value || "").trim().toLowerCase();
    if (label === target || val === target) return i;
  }
  // Yes/No common variants
  const aliases: Record<string, string[]> = {
    yes: ["yes", "y", "true", "1"],
    no: ["no", "n", "false", "0"],
  };
  for (const [canon, list] of Object.entries(aliases)) {
    if (list.includes(target)) {
      for (let i = 0; i < sel.options.length; i++) {
        const label = (sel.options[i].textContent || "").trim().toLowerCase();
        const val = (sel.options[i].value || "").trim().toLowerCase();
        if (list.includes(label) || list.includes(val) || label === canon || val === canon) return i;
      }
    }
  }
  return -1;
}

function markHighlight(el: HTMLElement, kind: "filled" | "manual" | "upload" | "review") {
  if (!highlightsVisible) return;
  el.style.outline = kind === "filled"
    ? "2px solid rgba(79,70,229,0.55)"
    : kind === "review"
      ? "2px solid rgba(217,119,6,0.7)"
      : kind === "upload"
        ? "2px solid rgba(147,51,234,0.55)"
        : "2px solid rgba(225,29,72,0.45)";
  el.dataset.joblensFill = kind;
}

export function setHighlightsVisible(on: boolean) {
  highlightsVisible = on;
  if (!on) {
    document.querySelectorAll("[data-joblens-fill]").forEach((n) => {
      (n as HTMLElement).style.outline = "";
    });
  }
}

export function clearUndoStack() {
  undoStack.length = 0;
}

export function probeEmptiness(
  keys: { external_field_key: string; field_label?: string }[],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of keys) {
    const el = findControl(k.external_field_key, k.field_label);
    out[k.external_field_key] = el ? isControlEmpty(el) : true;
  }
  return out;
}

function pushUndo(el: HTMLElement, key: string) {
  const tag = el.tagName.toLowerCase();
  const selector = el.id
    ? `#${cssEscape(el.id)}`
    : el.getAttribute("name")
      ? `[name="${cssEscape(el.getAttribute("name")!)}"]`
      : tag;
  const entry: UndoEntry = {
    key,
    kind: "value",
    el: typeof WeakRef !== "undefined" ? new WeakRef(el) : null,
    selector,
    userEdited: false,
  };
  if (tag === "select") {
    entry.kind = "select";
    entry.priorSelectedIndex = (el as HTMLSelectElement).selectedIndex;
  } else if (tag === "input" && ((el as HTMLInputElement).type === "checkbox")) {
    entry.kind = "checkbox";
    entry.priorChecked = (el as HTMLInputElement).checked;
  } else if (tag === "input" && (el as HTMLInputElement).type === "radio") {
    entry.kind = "radio";
    entry.priorChecked = (el as HTMLInputElement).checked;
  } else {
    entry.priorValue = (el as HTMLInputElement).value;
  }
  // Listen once for user edits after fill
  const onUser = () => {
    entry.userEdited = true;
    el.removeEventListener("input", onUser);
    el.removeEventListener("change", onUser);
  };
  el.addEventListener("input", onUser);
  el.addEventListener("change", onUser);
  undoStack.push(entry);
}

export function fillSelectedFields(intents: FillIntent[]): {
  outcomes: FieldFillOutcome[];
  submitted: boolean;
  uploadTouched: boolean;
  submitClicked: boolean;
} {
  const outcomes: FieldFillOutcome[] = [];
  let uploadTouched = false;
  const submitClicked = false;
  const submitted = false;

  for (const intent of intents) {
    const el = findControl(intent.external_field_key, intent.field_label);
    if (!el) {
      outcomes.push({
        external_field_key: intent.external_field_key,
        normalized_field_name: intent.normalized_field_name,
        status: "failed",
        reason: "field_no_longer_available",
      });
      continue;
    }

    const input = el as HTMLInputElement;
    const type = (input.type || el.tagName).toLowerCase();

    if (UPLOAD_TYPES.has(type) || intent.normalized_field_name.includes("upload")) {
      uploadTouched = uploadTouched || false;
      markHighlight(el, "upload");
      outcomes.push({
        external_field_key: intent.external_field_key,
        normalized_field_name: intent.normalized_field_name,
        status: "skipped_upload",
        reason: "manual_upload_required",
      });
      continue;
    }

    if (FORBIDDEN_SUBMIT.test(intent.external_field_key) || type === "submit") {
      outcomes.push({
        external_field_key: intent.external_field_key,
        normalized_field_name: intent.normalized_field_name,
        status: "skipped_unsupported",
        reason: "submit_control",
      });
      continue;
    }

    if (!intent.replace_existing && !isControlEmpty(el)) {
      outcomes.push({
        external_field_key: intent.external_field_key,
        normalized_field_name: intent.normalized_field_name,
        status: "skipped_existing",
        reason: "already_filled",
      });
      continue;
    }

    try {
      pushUndo(el, intent.external_field_key);
      el.focus();

      if (el.tagName.toLowerCase() === "select") {
        const sel = el as HTMLSelectElement;
        const idx = matchSelectOption(sel, intent.value);
        if (idx < 0) {
          outcomes.push({
            external_field_key: intent.external_field_key,
            normalized_field_name: intent.normalized_field_name,
            status: "option_not_found",
            reason: "ambiguous_or_missing_option",
          });
          continue;
        }
        sel.selectedIndex = idx;
        dispatchInputEvents(sel);
        sel.blur();
      } else if (type === "radio") {
        const name = input.name;
        const radios = name
          ? Array.from(document.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`))
          : [input];
        let matched: HTMLInputElement | null = null;
        for (const r of radios) {
          const ri = r as HTMLInputElement;
          const lab = document.querySelector(`label[for="${cssEscape(ri.id)}"]`);
          const labText = (lab?.textContent || ri.value || "").trim().toLowerCase();
          if (labText === intent.value.trim().toLowerCase() || ri.value.toLowerCase() === intent.value.trim().toLowerCase()) {
            matched = ri;
            break;
          }
        }
        if (!matched) {
          outcomes.push({
            external_field_key: intent.external_field_key,
            normalized_field_name: intent.normalized_field_name,
            status: "option_not_found",
          });
          continue;
        }
        matched.checked = true;
        dispatchInputEvents(matched);
      } else if (type === "checkbox") {
        const want = /^(yes|true|1)$/i.test(intent.value.trim());
        input.checked = want;
        dispatchInputEvents(input);
      } else {
        setNativeValue(input, intent.value);
        dispatchInputEvents(input);
        input.blur();
        if ((input.value || "") !== intent.value) {
          outcomes.push({
            external_field_key: intent.external_field_key,
            normalized_field_name: intent.normalized_field_name,
            status: "failed",
            reason: "value_rejected",
          });
          continue;
        }
      }

      markHighlight(el, "filled");
      outcomes.push({
        external_field_key: intent.external_field_key,
        normalized_field_name: intent.normalized_field_name,
        status: "filled",
      });
    } catch (e) {
      outcomes.push({
        external_field_key: intent.external_field_key,
        normalized_field_name: intent.normalized_field_name,
        status: "failed",
        reason: e instanceof Error ? e.message : "fill_error",
      });
    }
  }

  return { outcomes, submitted, uploadTouched, submitClicked };
}

export function undoLastFill(confirmUserEdited = false): {
  restored: number;
  skipped_user_edited: number;
} {
  let restored = 0;
  let skipped = 0;
  while (undoStack.length) {
    const entry = undoStack.pop()!;
    if (entry.userEdited && !confirmUserEdited) {
      skipped += 1;
      continue;
    }
    const el =
      entry.el?.deref?.() ||
      (document.querySelector(entry.selector) as HTMLElement | null);
    if (!el) continue;
    if (entry.kind === "select" && entry.priorSelectedIndex != null) {
      (el as HTMLSelectElement).selectedIndex = entry.priorSelectedIndex;
      dispatchInputEvents(el);
    } else if (entry.kind === "checkbox" || entry.kind === "radio") {
      (el as HTMLInputElement).checked = !!entry.priorChecked;
      dispatchInputEvents(el);
    } else {
      setNativeValue(el as HTMLInputElement, entry.priorValue || "");
      dispatchInputEvents(el);
    }
    el.style.outline = "";
    delete el.dataset.joblensFill;
    restored += 1;
  }
  return { restored, skipped_user_edited: skipped };
}

/** Safety: never programmatically click submit. */
export function assertNoSubmitSideEffects(): { submitClicked: boolean; formSubmitted: boolean } {
  return { submitClicked: false, formSubmitted: false };
}
