/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { CLUBS } from "../../src/data/clubs";
import { App } from "../../src/ui/app";

/**
 * Proves setup-draft.ts (Task 6 part 2) actually reconnects to the real
 * App: fill in the manager form and pick a club WITHOUT starting a career,
 * unmount (simulating a reload/tab-discard before "Zacznij karierę" was
 * ever pressed), mount a fresh App instance, and check that the name and
 * the club both come back - landing straight back on the club screen, not
 * the blank manager screen.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  if (mounted) {
    const { container, root } = mounted;
    await act(async () => root.unmount());
    container.remove();
    mounted = undefined;
  }
});

const mount = async (): Promise<HTMLDivElement> => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => root.render(createElement(App)));
  return container;
};

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

const click = async (element: Element): Promise<void> => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const screen = (container: HTMLElement): string | null =>
  container.querySelector(".dd-root")?.getAttribute("data-dd-screen") ?? null;

describe("setup-draft resume (setup-draft.ts wired through app.tsx)", () => {
  test("a reload on the club screen restores the manager name and the selected club", async () => {
    const club = CLUBS[2];

    const first = await mount();
    expect(screen(first)).toBe("start");

    await setValue(first.querySelector<HTMLInputElement>("#manager-first-name")!, "Zenon");
    await setValue(first.querySelector<HTMLInputElement>("#manager-last-name")!, "Boruta");
    await click(first.querySelector('[data-dd-action="dalej"]')!);

    expect(screen(first)).toBe("wybor");
    await click(first.querySelector(`[data-dd-action="klub:${club!.clubId}"]`)!);
    expect(first.querySelector<HTMLInputElement>(`input[value="${club!.clubId}"]`)!.checked).toBe(
      true
    );

    // Simulate the reload: unmount this instance (nothing in this test ever
    // dispatched START_CAREER, so no career-save exists) and mount a fresh
    // one against the same localStorage.
    await act(async () => mounted!.root.unmount());
    mounted!.container.remove();
    mounted = undefined;

    const second = await mount();

    // Restored straight to the club screen, not the blank manager screen.
    expect(screen(second)).toBe("wybor");
    expect(second.querySelector<HTMLInputElement>(`input[value="${club!.clubId}"]`)!.checked).toBe(
      true
    );

    // Going back confirms the manager's name came back too, not just the
    // fact that step 2 was reached.
    await click(second.querySelector('[data-dd-action="wstecz"]')!);
    expect(screen(second)).toBe("start");
    expect(second.querySelector<HTMLInputElement>("#manager-first-name")!.value).toBe("Zenon");
    expect(second.querySelector<HTMLInputElement>("#manager-last-name")!.value).toBe("Boruta");
  });

  test("going back to the manager screen and forward again keeps the selected club", async () => {
    // Autosave covers every screen (owner request), so an in-session round
    // trip must keep the pick the same way a reload does.
    const club = CLUBS[4];
    const container = await mount();
    await setValue(container.querySelector<HTMLInputElement>("#manager-first-name")!, "Zenon");
    await setValue(container.querySelector<HTMLInputElement>("#manager-last-name")!, "Boruta");
    await click(container.querySelector('[data-dd-action="dalej"]')!);
    await click(container.querySelector(`[data-dd-action="klub:${club!.clubId}"]`)!);

    await click(container.querySelector('[data-dd-action="wstecz"]')!);
    expect(screen(container)).toBe("start");
    await click(container.querySelector('[data-dd-action="dalej"]')!);

    expect(screen(container)).toBe("wybor");
    expect(
      container.querySelector<HTMLInputElement>(`input[value="${club!.clubId}"]`)!.checked
    ).toBe(true);
  });

  test("starting a career clears the draft, so a later reload never resurrects it", async () => {
    const club = CLUBS[4];
    const container = await mount();

    await setValue(container.querySelector<HTMLInputElement>("#manager-first-name")!, "Ola");
    await setValue(container.querySelector<HTMLInputElement>("#manager-last-name")!, "Nowak");
    await click(container.querySelector('[data-dd-action="dalej"]')!);
    await click(container.querySelector(`[data-dd-action="klub:${club!.clubId}"]`)!);
    await click(container.querySelector('[data-dd-action="zacznij-kariere"]')!);

    expect(screen(container)).toBe("przeglad");
    expect(window.localStorage.getItem("deadline-day:setup-draft")).toBeNull();
  });

  test("a resumable career save wins over a leftover setup draft, and clears it", async () => {
    const club = CLUBS[6];

    const first = await mount();
    await setValue(first.querySelector<HTMLInputElement>("#manager-first-name")!, "Ola");
    await setValue(first.querySelector<HTMLInputElement>("#manager-last-name")!, "Nowak");
    await click(first.querySelector('[data-dd-action="dalej"]')!);
    await click(first.querySelector(`[data-dd-action="klub:${club!.clubId}"]`)!);
    await click(first.querySelector('[data-dd-action="zacznij-kariere"]')!);
    expect(screen(first)).toBe("przeglad");

    // A leftover draft written AFTER the career save exists (e.g. an
    // abandoned second attempt at the setup screens in another tab) must
    // never override a resumable career.
    window.localStorage.setItem(
      "deadline-day:setup-draft",
      JSON.stringify({
        schemaVersion: 1,
        firstName: "Kazimierz",
        lastName: "Deja",
        timerWl: true,
        step: "manager",
        clubId: null,
      })
    );

    await act(async () => mounted!.root.unmount());
    mounted!.container.remove();
    mounted = undefined;

    const second = await mount();
    expect(screen(second)).toBe("przeglad");
    expect(window.localStorage.getItem("deadline-day:setup-draft")).toBeNull();
  });

  test("a reload on the club screen reached through a restart keeps the manager and the timer choice", async () => {
    // The draft is cleared at career start, so after "restart-tak" the club
    // screen is the only writer left - it must carry the known manager and
    // the current timer choice, not just the step and the club.
    const club = CLUBS[3];
    const first = await mount();
    await setValue(first.querySelector<HTMLInputElement>("#manager-first-name")!, "Zenon");
    await setValue(first.querySelector<HTMLInputElement>("#manager-last-name")!, "Boruta");
    const timerOff = first.querySelectorAll('[data-dd-action="timer-toggle"]')[1];
    await click(timerOff!);
    expect(timerOff!.classList.contains("is-selected")).toBe(true);
    await click(first.querySelector('[data-dd-action="dalej"]')!);
    await click(first.querySelector(`[data-dd-action="klub:${CLUBS[5]!.clubId}"]`)!);
    await click(first.querySelector('[data-dd-action="zacznij-kariere"]')!);
    expect(screen(first)).toBe("przeglad");

    await click(first.querySelector('[data-dd-action="restart-pytaj"]')!);
    await click(first.querySelector('[data-dd-action="restart-tak"]')!);
    expect(screen(first)).toBe("wybor");
    await click(first.querySelector(`[data-dd-action="klub:${club!.clubId}"]`)!);

    await act(async () => mounted!.root.unmount());
    mounted!.container.remove();
    mounted = undefined;

    const second = await mount();
    expect(screen(second)).toBe("wybor");
    expect(second.querySelector<HTMLInputElement>(`input[value="${club!.clubId}"]`)!.checked).toBe(
      true
    );

    await click(second.querySelector('[data-dd-action="wstecz"]')!);
    expect(screen(second)).toBe("start");
    expect(second.querySelector<HTMLInputElement>("#manager-first-name")!.value).toBe("Zenon");
    expect(second.querySelector<HTMLInputElement>("#manager-last-name")!.value).toBe("Boruta");
    expect(
      second
        .querySelectorAll('[data-dd-action="timer-toggle"]')[1]!
        .classList.contains("is-selected")
    ).toBe(true);
  });
});
