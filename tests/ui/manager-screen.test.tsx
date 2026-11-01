/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ManagerIdentity } from "../../src/data/types";
import { validateManagerIdentity } from "../../src/logic/manager-identity";
import { ManagerScreen } from "../../src/ui/screens/manager-screen";
import { clearSetupDraft, readSetupDraft } from "../../src/ui/setup-draft";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Step 1 of career setup, standing alone (not wired into app.tsx yet - see
 * the component's own docblock). Everything here goes through the same
 * `validateManagerIdentity`/`randomManagerIdentity` contract Task 4 built and
 * tested on its own; this file tests the FORM around that contract: focus,
 * aria wiring, and that the screen never lets a bad value through.
 */

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
  clearSetupDraft();
});

const render = async (
  initialManager: ManagerIdentity | null = null,
  timerWl = true
): Promise<{
  container: HTMLDivElement;
  continued: ManagerIdentity[];
}> => {
  const continued: ManagerIdentity[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () =>
    root.render(
      createElement(ManagerScreen, {
        initialManager,
        onContinue: (manager: ManagerIdentity) => continued.push(manager),
        // Timer/archive plumbing is exercised in the app-level wiring tests
        // (dom-parity.test.ts); this suite is about the manager form itself.
        timerWl,
        dispatch: () => {},
        onOpenArchive: () => {},
      })
    )
  );
  return { container, continued };
};

const firstNameInput = (container: HTMLElement): HTMLInputElement =>
  container.querySelector<HTMLInputElement>("#manager-first-name")!;
const lastNameInput = (container: HTMLElement): HTMLInputElement =>
  container.querySelector<HTMLInputElement>("#manager-last-name")!;
const button = (container: HTMLElement, action: string): HTMLButtonElement =>
  container.querySelector<HTMLButtonElement>(`[data-dd-action="${action}"]`)!;

const setValue = async (input: HTMLInputElement, value: string): Promise<void> => {
  await act(async () => {
    // The native setter, called below with an explicit `this`: React tracks the value
    // through it, so assigning input.value directly would not fire onChange.
    // oxlint-disable-next-line typescript/unbound-method -- bound by .call(input, ...) below.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const click = async (element: HTMLElement): Promise<void> => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("manager screen", () => {
  test("renders separate first/last name fields with the right autocomplete hints", async () => {
    const { container } = await render();

    const first = firstNameInput(container);
    const last = lastNameInput(container);

    expect(first.getAttribute("autocomplete")).toBe("given-name");
    expect(last.getAttribute("autocomplete")).toBe("family-name");
    expect(container.querySelector(`label[for="${first.id}"]`)?.textContent).toBe("Imię");
    expect(container.querySelector(`label[for="${last.id}"]`)?.textContent).toBe("Nazwisko");
  });

  test("Losuj draws a valid pair into both fields", async () => {
    const { container } = await render();

    await click(button(container, "losuj"));

    const first = firstNameInput(container);
    const last = lastNameInput(container);
    expect(first.value.length).toBeGreaterThan(0);
    expect(last.value.length).toBeGreaterThan(0);
    expect(validateManagerIdentity({ firstName: first.value, lastName: last.value })).toEqual({
      ok: true,
      value: { firstName: first.value, lastName: last.value },
    });
  });

  test("Dalej with a valid pair calls onContinue with the normalised identity", async () => {
    const { container, continued } = await render();

    await setValue(firstNameInput(container), "  Jan   Maria  ");
    await setValue(lastNameInput(container), "Kowalski");
    await click(button(container, "dalej"));

    expect(continued).toEqual([{ firstName: "Jan Maria", lastName: "Kowalski" }]);
  });

  test("Dalej blocks an empty first name, focuses it, and wires the error via aria-describedby", async () => {
    const { container, continued } = await render();

    await setValue(lastNameInput(container), "Kowalski");
    await click(button(container, "dalej"));

    expect(continued).toEqual([]);
    const first = firstNameInput(container);
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute("aria-invalid")).toBe("true");
    const describedBy = first.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.id).toBe(describedBy);
    expect(alert.textContent).toBe("Imię musi mieć od 2 do 30 znaków.");
    // The last name field must not also be marked invalid - only one field
    // fails at a time, and the message must point at the right one.
    expect(lastNameInput(container).getAttribute("aria-invalid")).toBeNull();
  });

  test("Dalej with both fields empty reports both errors at once and focuses the first field", async () => {
    const { container, continued } = await render();

    await click(button(container, "dalej"));

    expect(continued).toEqual([]);
    const first = firstNameInput(container);
    const last = lastNameInput(container);
    expect(document.activeElement).toBe(first);

    expect(first.getAttribute("aria-invalid")).toBe("true");
    expect(last.getAttribute("aria-invalid")).toBe("true");

    const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
    expect(alerts).toHaveLength(2);
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      "Imię musi mieć od 2 do 30 znaków.",
      "Nazwisko musi mieć od 2 do 30 znaków.",
    ]);

    const firstDescribedBy = first.getAttribute("aria-describedby");
    const lastDescribedBy = last.getAttribute("aria-describedby");
    expect(firstDescribedBy).toBeTruthy();
    expect(lastDescribedBy).toBeTruthy();
    expect(firstDescribedBy).not.toBe(lastDescribedBy);
    expect(document.getElementById(firstDescribedBy!)?.textContent).toBe(
      "Imię musi mieć od 2 do 30 znaków."
    );
    expect(document.getElementById(lastDescribedBy!)?.textContent).toBe(
      "Nazwisko musi mieć od 2 do 30 znaków."
    );
  });

  test("Dalej blocks a name with digits (invalid shape) on the offending field", async () => {
    const { container, continued } = await render();

    await setValue(firstNameInput(container), "Jan");
    await setValue(lastNameInput(container), "Kowal5ki");
    await click(button(container, "dalej"));

    expect(continued).toEqual([]);
    const last = lastNameInput(container);
    expect(document.activeElement).toBe(last);
    expect(last.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Nazwisko może zawierać tylko litery, pojedynczą spację, myślnik albo apostrof."
    );
  });

  test("Dalej blocks a profane token without ever quoting the typed value", async () => {
    const { container, continued } = await render();

    await setValue(firstNameInput(container), "Jan");
    await setValue(lastNameInput(container), "Kurwa");
    await click(button(container, "dalej"));

    expect(continued).toEqual([]);
    const alertText = container.querySelector('[role="alert"]')?.textContent ?? "";
    expect(alertText).toBe("Wybierz inne nazwisko.");
    // The alert names the FIELD, never the rejected value itself.
    expect(alertText).not.toContain("Kurwa");
  });

  // A11y fix (2026-09-16, HIGH #3): the randomise button filled both fields
  // but announced nothing to a screen reader - the fields changing was a
  // sighted-only cue. Chosen fix: a polite, visually hidden live region next
  // to the button rather than moving focus, so a player who dislikes the
  // draw can press "Losuj" again immediately.
  describe("a11y fix: randomise announces the draw", () => {
    test("Losuj announces the drawn pair in a polite, visually hidden status region", async () => {
      const { container } = await render();

      await click(button(container, "losuj"));

      const first = firstNameInput(container);
      const last = lastNameInput(container);
      const status = container.querySelector('[role="status"][aria-live="polite"]')!;
      expect(status).not.toBeNull();
      expect(status.classList.contains("dd-visually-hidden")).toBe(true);
      expect(status.textContent).toBe(`Wylosowano: ${first.value} ${last.value}.`);
    });

    // Exists before the first draw (even if empty) so assistive tech has a
    // baseline to diff the first announcement against.
    test("the status region exists (empty) before any draw", async () => {
      const { container } = await render();

      const status = container.querySelector('[role="status"][aria-live="polite"]');
      expect(status).not.toBeNull();
      expect(status!.textContent).toBe("");
    });
  });

  test("warns that this is a development version whose saves may be lost", async () => {
    const { container } = await render();

    expect(container.textContent).toContain(
      "Wersja rozwojowa: partia w toku i zapisane kariery mogą przepaść po aktualizacji gry."
    );
  });

  test("starts from initialManager when one is provided", async () => {
    const { container } = await render({ firstName: "Anna", lastName: "Nowak" });

    expect(firstNameInput(container).value).toBe("Anna");
    expect(lastNameInput(container).value).toBe("Nowak");
  });

  describe("setup-draft autosave (setup-draft.ts)", () => {
    test("writes typed field text to the draft as the player types", async () => {
      const { container } = await render();

      await setValue(firstNameInput(container), "Ja");
      expect(readSetupDraft()).toMatchObject({ firstName: "Ja", step: "manager" });

      await setValue(lastNameInput(container), "Kow");
      expect(readSetupDraft()).toMatchObject({
        firstName: "Ja",
        lastName: "Kow",
        step: "manager",
      });
    });

    test("writes even a not-yet-valid draft (still mid-typing)", async () => {
      const { container } = await render();

      await setValue(firstNameInput(container), "J");
      // "J" alone fails validateManagerIdentity (too short) but the draft
      // is not a record of validity - it is a record of what was typed.
      expect(readSetupDraft()?.firstName).toBe("J");
    });

    test("the current timerWl value is written to the draft", async () => {
      // dispatch is a no-op stub in this harness (the real TOGGLE_TIMER
      // wiring lives in app.tsx/game-reducer.ts, exercised elsewhere), so
      // this checks the write effect the way it can actually be observed
      // here: against the `timerWl` prop the screen was given.
      await render(null, false);

      expect(readSetupDraft()?.timerWl).toBe(false);
    });
  });

  test("correction 11: the fields and randomise button sit inside one framed panel", async () => {
    const { container } = await render();

    const panel = container.querySelector(".dd-manager-panel");
    expect(panel).not.toBeNull();
    expect(panel!.querySelector(".dd-manager-form")).not.toBeNull();
    expect(panel!.querySelector('[data-dd-action="losuj"]')).not.toBeNull();
    expect(firstNameInput(container).closest(".dd-manager-panel")).toBe(panel);
    expect(lastNameInput(container).closest(".dd-manager-panel")).toBe(panel);
  });

  // Round 2 correction (2026-09-15): the old note explained the club sees
  // the name on every offer - dropped in favour of asking the question
  // directly, matching the shorter register of the section heading.
  test("round 2 correction: the intro asks the naming question directly", async () => {
    const { container } = await render();

    expect(container.textContent).toContain("Jak chcesz nazwać swojego menedżera?");
    expect(container.textContent).not.toContain("Twój klub zobaczy je w każdej ofercie");
  });
});

describe("manager screen styling contracts (correction 11, 12 and 13)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

  const ruleBody = (selector: string): string => {
    // Escapes every regex metacharacter, not just `.`/`#` - needed once a
    // selector carries an attribute matcher like `[aria-invalid="true"]`,
    // whose `[`, `]` and `"` are otherwise read as regex syntax.
    const escaped = selector.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`Rule not found: ${selector}`);
    return match[1]!;
  };

  // Correction 13 (2026-09-16): the panel's own frame was removed so the
  // section sits at the same depth as its neighbours (heading -> controls
  // with a visible outline, not heading -> panel -> controls). It carries
  // no border or fill of its own any more - the strong outline moved onto
  // the inputs themselves, checked below.
  test("the panel carries no frame of its own - no border, no fill", () => {
    const body = ruleBody(".dd-manager-panel");
    expect(body).not.toMatch(/border:/);
    expect(body).not.toMatch(/background:/);
  });

  test("input and button never drop below the 44px touch target floor", () => {
    expect(ruleBody(".dd-manager-field input")).toMatch(/min-height:\s*44px/);
    expect(ruleBody(".dd-manager-random")).toMatch(/min-height:\s*44px/);
  });

  // Round 3 correction (2026-09-15): below 16px, mobile browsers (Vivaldi on
  // Android included, not just Safari) auto-zoom the viewport on focus and
  // never zoom back out on blur. The fix is exactly one number, and the
  // 44px floor above still holds because it is a `min-height`, not tied to
  // font-size.
  test("round 3 correction: the name inputs use a 16px font-size, never below it", () => {
    const body = ruleBody(".dd-manager-field input");
    expect(body).toMatch(/font-size:\s*16px/);
    expect(body).not.toMatch(/font-size:\s*15px/);
  });

  test("vertical spacing around the controls was tightened, not the controls themselves", () => {
    // Was 12px before correction 12 - the field-to-field gap and the
    // randomise button's top margin shrink; min-height (checked above) does
    // not, so the 44px floor still holds regardless of this spacing.
    expect(ruleBody(".dd-manager-form")).toMatch(/gap:\s*8px/);
    expect(ruleBody(".dd-manager-random")).toMatch(/margin-top:\s*8px/);
  });

  // Correction 13 (2026-09-16): now that the panel carries no frame, the
  // strong `--border-control` outline moved onto the input itself - the
  // same treatment the neighbouring Timer/Archiwum cards (`.dd-setup-
  // choice`) give their controls, on the same white `--surface-panel` fill.
  // One outline in the section, on the control the player actually touches,
  // not on the inert container around it.
  test("the inputs carry the strong control border, on the white card fill", () => {
    const body = ruleBody(".dd-manager-field input");
    expect(body).toMatch(/border:\s*1px solid var\(--border-control\)/);
    expect(body).toMatch(/background:\s*var\(--surface-panel\)/);
    // Invalid state and focus indicator both still work, and the focus ring
    // is shape-based (an outline, not a colour swap), so it is not weakened
    // by the border now being visible at rest.
    expect(ruleBody('.dd-manager-field input[aria-invalid="true"]')).toMatch(
      /border-color:\s*var\(--meaning-negative\)/
    );
    expect(ruleBody(".dd-manager-field input:focus-visible")).toMatch(
      /outline:\s*3px solid var\(--meaning-positive\)/
    );
  });
});
