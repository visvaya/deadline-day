import { expect, test, type Page } from "@playwright/test";

import { TYTULY } from "../../src/logic/epilogue";

/**
 * Phase 3's Playwright smoke test - the one thing jsdom cannot prove:
 * the game actually renders and runs in a real browser. No screenshots (see
 * playwright.config.ts) and no duplication of tests/ui/dom-parity.test.ts,
 * which already proves the DOM dispatches the right reducer action - this
 * test only cares that a full game completes with a clean console.
 */

const enabled = (page: Page, action: string) =>
  page.locator(`[data-dd-action="${action}"]:not([disabled])`);

const loadedFigtreeFaces = async (page: Page) => {
  // WebKit commits its first paint later than Chromium, so this used to run
  // before React had mounted and .dd-root did not exist yet. What is being
  // asserted is which font faces resolved, never how fast the app renders.
  await page.locator(".dd-root").waitFor();
  return page.evaluate(async () => {
    const root = document.querySelector<HTMLElement>(".dd-root");
    if (!root) throw new Error("Deadline Day root not found");

    const latinGlyphs = "Deadline Day";
    const polishGlyphs = "ąćęłńśźż";
    const [regularLatin, extraBoldLatin, regularPolish, extraBoldPolish] = await Promise.all([
      document.fonts.load('400 16px "Figtree"', latinGlyphs),
      document.fonts.load('800 16px "Figtree"', latinGlyphs),
      document.fonts.load('400 16px "Figtree"', polishGlyphs),
      document.fonts.load('800 16px "Figtree"', polishGlyphs),
    ]);

    return {
      extraBoldLatin: extraBoldLatin.length,
      extraBoldPolish: extraBoldPolish.length,
      fontFamily: getComputedStyle(root).fontFamily,
      regularLatin: regularLatin.length,
      regularPolish: regularPolish.length,
    };
  });
};

/**
 * The club used by tests that do not care which one they get - any of the
 * eighteen works, since nothing here is about difficulty any more. A second,
 * weak club (`radomiak-radom`) is used only by the relegation-seeking test.
 */
/** The order a bare sort() gives: UTF-16 code units of each value as a string. */
const byCodeUnit = (a: string | null, b: string | null): number =>
  String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

const DEFAULT_CLUB_ID = "lech-poznan";

/** Draws a random (always-valid) manager identity and advances past step 1
 * of setup - the club screen (step 2) is a separate call, since several
 * tests need to look at it before picking anything. */
const fillRandomManagerAndContinue = async (page: Page): Promise<void> => {
  await enabled(page, "losuj").click();
  await enabled(page, "dalej").click();
};

/** Picks a club on the step-2 screen and starts the career. */
const chooseClubAndStart = async (page: Page, clubId: string): Promise<void> => {
  await page.locator(`[data-dd-action="klub:${clubId}"]`).click();
  await enabled(page, "zacznij-kariere").click();
};

/** Shared setup for tests that just need an open offer with a random
 * manager, a chosen club and the timer off - skips the countdown as a
 * source of flake. */
const startGameWithoutTimer = async (page: Page, clubId = DEFAULT_CLUB_ID): Promise<void> => {
  await enabled(page, "losuj").click();
  await page.locator('[data-timer-choice="off"]').click();
  await enabled(page, "dalej").click();
  await chooseClubAndStart(page, clubId);
  await enabled(page, "oferty").click();
};

const expectNoHorizontalOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
};

const applyGameSeed = async (page: Page, seed: number) => {
  await page.addInitScript((fixedSeed) => {
    Object.defineProperty(globalThis.crypto, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView | null>(array: T): T => {
        const target = array as unknown as { 0: number; length: number } | null;
        if (target && target.length > 0) target[0] = fixedSeed;
        return array;
      },
    });
  }, seed);
};

test("blocks every class of manager-name validation error before accepting a valid pair", async ({
  page,
}) => {
  // One case per branch in validateNameField (manager-identity.ts), in the
  // order that function checks them: control/bidi character, length, shape,
  // profanity token. Each is fixed before the next is introduced, so every
  // click of "dalej" here is blocked by exactly one cause.
  await page.goto("/");

  const firstName = page.locator("#manager-first-name");
  const lastName = page.locator("#manager-last-name");
  // Task 6, part 1 (2026-09-21): each field now carries its own error
  // paragraph (manager-screen.tsx) rather than one shared
  // "#manager-form-error" - every class exercised below invalidates exactly
  // one field, so there is always exactly one `[role="alert"]` on screen.
  const alert = page.locator('[role="alert"]');

  // Class 1: too short (also covers "too long" via the same branch).
  await firstName.fill("J");
  await lastName.fill("Kowalski");
  await enabled(page, "dalej").click();
  await expect(alert).toHaveText("Imię musi mieć od 2 do 30 znaków.");
  await expect(firstName).toBeFocused();
  await expect(firstName).toHaveAttribute("aria-invalid", "true");
  await expect(lastName).not.toHaveAttribute("aria-invalid", "true");

  // Class 2: invalid shape - a digit is neither a letter nor a separator.
  await firstName.fill("Jan");
  await lastName.fill("Kowal5ki");
  await enabled(page, "dalej").click();
  await expect(alert).toHaveText(
    "Nazwisko może zawierać tylko litery, pojedynczą spację, myślnik albo apostrof."
  );
  await expect(lastName).toBeFocused();

  // Class 3: a raw bidi-format character (invisible, but still rejected
  // before normalisation ever runs - containsControlOrBidi in
  // manager-identity.ts).
  await lastName.fill("Kowalski");
  await firstName.fill(`Jan${String.fromCharCode(0x200e)}`);
  await enabled(page, "dalej").click();
  await expect(alert).toHaveText("Imię zawiera niedozwolone znaki.");
  await expect(firstName).toBeFocused();

  // Class 4: a profanity token - the message names the field, never quotes
  // the rejected value back at the player.
  await firstName.fill("Jan");
  await lastName.fill("Kurwa");
  await enabled(page, "dalej").click();
  await expect(alert).toHaveText("Wybierz inne nazwisko.");
  expect(await alert.textContent()).not.toContain("Kurwa");
  await expect(lastName).toBeFocused();

  // A valid pair finally proceeds to step 2.
  await lastName.fill("Kowalski");
  await enabled(page, "dalej").click();
  await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "wybor");
});

test("shows exactly the six allowed facts and requires a club before starting the career", async ({
  page,
}) => {
  await page.goto("/");
  await fillRandomManagerAndContinue(page);
  await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "wybor");

  // Nothing selected yet: no detail panel, and the primary action is present
  // but disabled - the global constraint that this screen is not a HUD and
  // never starts a career without an explicit choice.
  await expect(page.locator(".dd-club-detail")).toHaveCount(0);
  await expect(page.locator('[data-dd-action="zacznij-kariere"]')).toBeDisabled();

  await page.locator(`[data-dd-action="klub:${DEFAULT_CLUB_ID}"]`).click();

  const stats = page.locator("[data-dd-club-stat]");
  await expect(stats).toHaveCount(6);
  const keys = await stats.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-dd-club-stat"))
  );
  expect([...keys].sort(byCodeUnit)).toEqual(
    ["miejsce", "punkty", "budzet", "przychod", "zmiana-budzetu", "udzial-plac"].sort(byCodeUnit)
  );

  await enabled(page, "zacznij-kariere").click();
  await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "przeglad");
  await expect(page.locator(".dd-club-bar")).toContainText("Lech");
});

test("shows the incompatible-save message and starts a fresh career", async ({ page }) => {
  // A save from a retired schema (12, before this stage's schema 13) is
  // valid JSON but must never be resumed - game-save.ts's readStoredState
  // rejects it on the schema/engine check, and inspectGameSave reports
  // "discarded" rather than silently falling back to a blank state.
  await page.addInitScript(() => {
    localStorage.setItem(
      "deadline-day:game-save",
      JSON.stringify({ schemaVersion: 12, savedAt: Date.now(), state: {} })
    );
  });
  await page.goto("/");

  await expect(page.locator(".dd-notification")).toContainText(
    "Nie udało się wznowić niezgodnego zapisu. Rozpocznij nową karierę."
  );
  await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "start");
  // The incompatible entry itself must not resurrect the notice on a second
  // load - app.tsx clears it, in an effect, once the message has rendered.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("deadline-day:game-save")))
    .toBeNull();
  await page.reload();
  await expect(page.locator(".dd-notification")).toHaveCount(0);
});

test("marks the countdown as urgent only in its final five seconds", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await fillRandomManagerAndContinue(page);
  await chooseClubAndStart(page, DEFAULT_CLUB_ID);
  await enabled(page, "oferty").click();

  const timer = page.locator(".dd-timer");
  const fill = timer.locator("i");
  await expect(timer).not.toHaveClass(/napiete/);
  const normalColor = await fill.evaluate((element) => getComputedStyle(element).backgroundColor);

  await page.clock.runFor(10_000);

  await expect(timer).toHaveClass(/napiete/);
  const urgentColor = await fill.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(urgentColor).not.toBe(normalColor);
});

test("keeps the countdown the same width when it drops to one digit", async ({ page }) => {
  // Tabular digits make every digit equally wide, but "10" is still one digit
  // wider than "9" unless the clock holds two digits' width.
  await page.clock.install();
  await page.goto("/");
  await fillRandomManagerAndContinue(page);
  await chooseClubAndStart(page, DEFAULT_CLUB_ID);
  await enabled(page, "oferty").click();

  const clock = page.locator(".dd-offer-clock");
  const seconds = clock.locator("strong");
  const remaining = Number(await seconds.textContent());
  await page.clock.runFor((remaining - 10) * 1000);
  await expect(seconds).toHaveText("10");
  const twoDigits = await clock.boundingBox();
  await page.clock.runFor(1000);
  await expect(seconds).toHaveText("9");
  const oneDigit = await clock.boundingBox();
  if (!twoDigits || !oneDigit) throw new Error("Offer clock is not measurable");
  expect(oneDigit.width).toBe(twoDigits.width);
});

test("gives the notification's close button a target of at least 24 by 24 px", async ({ page }) => {
  // WCAG 2.2 AA 2.5.8. axe does not measure target size, so this does.
  await page.addInitScript(() => {
    localStorage.setItem(
      "deadline-day:game-save",
      JSON.stringify({ schemaVersion: 12, savedAt: Date.now(), state: {} })
    );
  });
  await page.goto("/");
  const close = page.locator(".dd-notification-close");
  await expect(close).toBeVisible();
  const box = await close.boundingBox();
  if (!box) throw new Error("Notification close button is not measurable");
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
});

test("keeps setup panels and actions constrained and visible on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto("/");

  const selectedTimer = page.locator('[data-timer-choice="on"]');
  await expect(selectedTimer).toHaveCSS("border-top-width", "2px");
  const selectedState = selectedTimer.locator(".dd-setup-choice-state");
  await expect(selectedState).toHaveText("wybrano");
  const descriptionBounds = await selectedTimer
    .locator(".dd-setup-choice-description")
    .boundingBox();
  const stateBounds = await selectedState.boundingBox();
  if (!descriptionBounds || !stateBounds) throw new Error("Selected timer state is not measurable");
  expect(stateBounds.y).toBeGreaterThan(descriptionBounds.y + descriptionBounds.height);

  const actionBar = page.locator(".dd-action-bar");
  const hero = page.locator(".dd-setup-hero");
  const actionBounds = await actionBar.boundingBox();
  const heroBounds = await hero.boundingBox();
  if (!actionBounds || !heroBounds) throw new Error("Desktop setup panels are not measurable");
  const rootBounds = await page.locator(".dd-root").boundingBox();
  if (!rootBounds) throw new Error("Desktop root shell is not measurable");
  const viewportCenter = rootBounds.x + rootBounds.width / 2;
  expect(actionBounds.width).toBeLessThanOrEqual(590);
  expect(heroBounds.width).toBeLessThanOrEqual(590);
  expect(Math.abs(actionBounds.x + actionBounds.width / 2 - viewportCenter)).toBeLessThanOrEqual(1);
  expect(Math.abs(heroBounds.x + heroBounds.width / 2 - viewportCenter)).toBeLessThanOrEqual(1);
  expect(actionBounds.y + actionBounds.height).toBe(500);
  expect(heroBounds.y).toBe(0);
  // The radius lives on the inner wrapper, not the fixed-position outer bar
  // - see .dd-action-bar-inner in styles.css, split out for the hide/reveal
  // slide animation.
  await expect(page.locator(".dd-action-bar-inner")).toHaveCSS("border-top-left-radius", "12px");
  await expect(hero).toHaveCSS("border-bottom-left-radius", "12px");

  await page.evaluate(() => window.scrollTo(0, 160));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(actionBar).not.toHaveClass(/is-hidden/);

  await enabled(page, "losuj").click();
  await enabled(page, "dalej").click();
  await chooseClubAndStart(page, DEFAULT_CLUB_ID);
  const clubBar = page.locator(".dd-club-bar");
  const clubBounds = await clubBar.boundingBox();
  if (!clubBounds) throw new Error("Desktop club bar is not measurable");
  expect(clubBounds.width).toBeLessThanOrEqual(590);
  expect(clubBounds.y).toBe(0);
  await expect(page.locator(".dd-hud")).toHaveCSS("border-bottom-left-radius", "12px");
  await expect(page.locator('[data-dd-action="restart-pytaj"]')).toHaveCSS(
    "border-top-width",
    "0px"
  );
});

test.describe("action bar scroll hide/reveal", () => {
  // The suite-wide default (playwright.config.ts) sets reducedMotion: "reduce"
  // for stability - it killed the scroll races that used to cost this file
  // most of its flakiness, and WebKit specifically cannot land a click
  // through the club screen's smooth scrollIntoView once real motion is
  // running (the same Chromium/WebKit layout-and-focus divergence this
  // project already documents elsewhere in this file). So this test does
  // NOT override reducedMotion at the context level - setup below (manager,
  // club choice) walks the same stable reduced-motion path every other test
  // uses. sticky-action-bar.tsx deliberately disables scroll-driven hiding
  // under prefers-reduced-motion (an accessibility choice: a player who
  // asked for less motion gets a bar that stays put), so once we reach the
  // screen this test actually exercises, motion is flipped back on at
  // runtime via page.emulateMedia - the supported way to change
  // prefers-reduced-motion mid-test - purely for the hide/reveal assertions
  // below. It is then flipped back to reduced motion to pin the opposite,
  // accessibility-relevant behaviour (see the end of this test).

  test("keeps the offer card and action bar usable at 360 px", async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await fillRandomManagerAndContinue(page);
    await chooseClubAndStart(page, DEFAULT_CLUB_ID);

    const forecastHelp = page.locator('[data-dd-action="forecast-help"]');
    await forecastHelp.hover();
    const forecastHelpPanel = page.locator(".dd-hud .dd-info-popover-panel");
    await expect(forecastHelpPanel).toHaveAttribute("data-open", "true");
    await expect(forecastHelpPanel).toBeVisible();
    const forecastHelpBounds = await forecastHelpPanel.boundingBox();
    if (!forecastHelpBounds) throw new Error("Forecast help panel is not measurable");
    expect(forecastHelpBounds.width).toBeGreaterThanOrEqual(180);
    expect(forecastHelpBounds.x).toBeGreaterThanOrEqual(0);
    expect(forecastHelpBounds.x + forecastHelpBounds.width).toBeLessThanOrEqual(360);

    await enabled(page, "oferty").click();

    await expect(page.locator(".dd-offer-card")).toBeVisible();
    const metricHelp = page.locator('[data-dd-action="metric-help"]');
    await expect(metricHelp).toHaveCount(2);
    await metricHelp.first().hover();
    const metricHelpPanel = page
      .locator(".dd-analyst-metric")
      .first()
      .locator(".dd-info-popover-panel");
    await expect(metricHelpPanel).toHaveAttribute("data-open", "true");
    await expect(metricHelpPanel).toBeVisible();
    const actionBar = page.locator(".dd-action-bar");
    await expect(actionBar).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const bounds = await actionBar.boundingBox();
    if (!bounds) throw new Error("Action bar is not measurable");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);

    const squadTrigger = page.locator(".dd-offer-squad-trigger");
    await squadTrigger.click();
    const squadDrawer = page.getByRole("dialog", { name: "Kadra" });
    await expect(squadDrawer).toBeVisible();
    await expect(squadDrawer).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".dd-squad-drawer-close")).toBeFocused();
    const drawerBounds = await squadDrawer.boundingBox();
    if (!drawerBounds) throw new Error("Squad drawer is not measurable");
    expect(drawerBounds.height).toBeLessThan(720);
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(squadDrawer).toHaveCount(0);
    await expect(squadTrigger).toBeFocused();

    // Everything above ran under the suite-wide reduced-motion default so
    // WebKit could get through the club screen. From here on the test is
    // actually about the hide/reveal behaviour, which sticky-action-bar.tsx
    // disables under prefers-reduced-motion - so switch to real motion now,
    // at the screen under test, rather than for the whole test. Confirm the
    // hook's own matchMedia listener has re-armed before scrolling, instead
    // of hoping the emulation lands before the next `scrollTo`.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(
      () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
    await expect(actionBar).not.toHaveClass(/is-hidden/);
    await page.evaluate(() => window.scrollTo(0, 160));
    await expect(actionBar).toHaveClass(/is-hidden/);
    const enabledAction = page.locator(".dd-action-bar button:not([disabled])").first();
    await enabledAction.focus();
    await expect(enabledAction).toBeFocused();
    await expect(actionBar).toHaveCSS("opacity", "1");
    // At the very bottom of the page the bar reveals itself again, whichever way
    // the last scroll went - the `atBottom` branch in sticky-action-bar.tsx, pinned
    // by tests/ui/common-components.test.ts. That branch runs inside a
    // requestAnimationFrame callback, so wait for one frame first: without it this
    // assertion would read the stale hidden state left by the scroll to 160 px.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
    await expect(actionBar).not.toHaveClass(/is-hidden/);

    // The reduced-motion path itself: sticky-action-bar.tsx must keep the bar
    // visible on scroll when the visitor asked for less motion, so pin that
    // behaviour explicitly rather than leaving it uncovered.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, 160));
    await expect(actionBar).not.toHaveClass(/is-hidden/);
  });

  // Owner decision ("Tylko chowanie paska", 2026-09-18): auto-hide gates on
  // narrow OR short, not just narrow, so a landscape phone - wide enough to
  // trip the desktop `min-width: 768px` layout, but exactly as cramped as a
  // portrait one - defaults to autoHide too. 844x390 is roughly an iPhone
  // 15/16-class phone rotated; the LAYOUT still has to look desktop (a
  // narrowed, centred bar) even though it auto-hides like mobile.
  test("auto-hide still engages on a landscape phone even though the layout is desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    await fillRandomManagerAndContinue(page);
    await chooseClubAndStart(page, DEFAULT_CLUB_ID);
    await enabled(page, "oferty").click();

    const actionBar = page.locator(".dd-action-bar");
    await expect(actionBar).toBeVisible();
    // The desktop layout: narrowed and centred, not full-bleed.
    const bounds = await actionBar.boundingBox();
    if (!bounds) throw new Error("Action bar is not measurable");
    expect(bounds.width).toBeLessThan(600);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(
      () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
    await expect(actionBar).not.toHaveClass(/is-hidden/);
    await page.evaluate(() => window.scrollTo(0, 160));
    await expect(actionBar).toHaveClass(/is-hidden/);
  });
});

test("keeps nearby percentile labels and sale separators clear at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  // Every attempt must start from an empty save, otherwise reloading resumes
  // the previous attempt instead of showing the difficulty picker.
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // Storage can be unavailable; the app copes and so does this test.
    }
  });

  let checkedNearbyLabels = false;
  let checkedSaleSeparator = false;

  // Both conditions depend on which cards a seed happens to deal, and every
  // change to the engine reshuffles that - phase 3b moved the stream from the
  // fifth card of every game onwards and left seed 1 without a nearby-
  // percentile card at all. Rather than pin a lucky seed and re-pin it after
  // each engine change (commit bd532d4 already had to once), walk a handful of
  // seeds until both conditions have been seen.
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    if (checkedNearbyLabels && checkedSaleSeparator) break;
    await applyGameSeed(page, seed);
    await page.goto("/");
    await startGameWithoutTimer(page);

    for (let offerIndex = 0; offerIndex < 30; offerIndex += 1) {
      let guard = 0;
      while (!(await enabled(page, "pas").count()) && guard < 10) {
        guard += 1;
        if (await enabled(page, "oferty").count()) {
          await enabled(page, "oferty").click();
        } else if (await enabled(page, "dalej").count()) {
          await enabled(page, "dalej").click();
        } else {
          break;
        }
      }
      if (!(await enabled(page, "pas").count())) break;

      // The trigger is a button, and tiles are buttons now: any button inside
      // it would be a nested-interactive failure on every single offer.
      await expect(page.locator(".dd-offer-squad-trigger button")).toHaveCount(0);

      const card = page.locator(".dd-offer-card");
      if (!checkedSaleSeparator && (await card.getAttribute("class"))?.includes("is-sale")) {
        const separator = page.locator(".dd-cash-share");
        await expect(separator).toBeVisible();
        await expect(separator).toHaveCSS("height", "3px");
        await expect(separator).toHaveAttribute("aria-hidden", "true");
        checkedSaleSeparator = true;
      }

      const rail = page.locator(".dd-evidence-rail");
      const markers = rail.locator(".dd-rail-marker");
      const markerCount = await markers.count();

      // When there are multiple markers (potential for nearby percentiles), verify they have distinct shapes
      if (!checkedNearbyLabels && markerCount === 2) {
        const markerShapes = await markers.evaluateAll((elements) =>
          elements.map((element) => {
            const dataMarker = element.getAttribute("data-marker");
            const bounds = element.getBoundingClientRect();
            return {
              shape: dataMarker,
              left: bounds.left,
              right: bounds.right,
              top: bounds.top,
              bottom: bounds.bottom,
            };
          })
        );

        const [first, second] = markerShapes;
        if (!first || !second) throw new Error("Percentile markers are not measurable");

        // Markers should have distinct shapes (circle vs diamond) to be distinguishable
        expect(first.shape).not.toBe(second.shape);

        // Both markers must stay within the rail's horizontal bounds
        const railBounds = await rail.boundingBox();
        if (!railBounds) throw new Error("Rail bounds not measurable");

        expect(first.left).toBeGreaterThanOrEqual(railBounds.x);
        expect(first.right).toBeLessThanOrEqual(railBounds.x + railBounds.width);
        expect(second.left).toBeGreaterThanOrEqual(railBounds.x);
        expect(second.right).toBeLessThanOrEqual(railBounds.x + railBounds.width);

        checkedNearbyLabels = true;
      }

      if (checkedNearbyLabels && checkedSaleSeparator) break;
      await enabled(page, "pas").click();
    }
  }

  expect(checkedNearbyLabels).toBe(true);
  expect(checkedSaleSeparator).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test("keeps offers usable without the timer at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await expectNoHorizontalOverflow(page);
  await page.locator('[data-action-bar-choice="alwaysVisible"]').click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("deadline-day:ui-preferences") ?? "null"))
    )
    .toEqual({ schemaVersion: 2, actionBarMode: "alwaysVisible" });
  await page.reload();
  await expect(page.locator('[data-action-bar-choice="alwaysVisible"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.locator('[data-timer-choice="off"]').click();
  await expect(page.locator('[data-timer-choice="off"]')).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const noteBounds = await page.locator(".dd-setup-options .dd-note").last().boundingBox();
  const setupBarBounds = await page.locator(".dd-action-bar").boundingBox();
  if (!noteBounds || !setupBarBounds) throw new Error("Setup layout is not measurable");
  expect(noteBounds.y + noteBounds.height).toBeLessThanOrEqual(setupBarBounds.y);
  await enabled(page, "losuj").click();
  await enabled(page, "dalej").click();
  await chooseClubAndStart(page, DEFAULT_CLUB_ID);
  await enabled(page, "oferty").click();

  await expect(page.locator(".dd-offer-card")).toBeVisible();
  await expect(page.locator(".dd-offer-clock")).toHaveCount(0);
  await expect(page.locator(".dd-timer")).toHaveCount(0);
  await expect(page.locator('[data-dd-action="czas"]')).toHaveCount(0);
  await expect(page.locator(".dd-action-bar")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("resumes the same offer after a mid-game reload", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await startGameWithoutTimer(page);

  await expect(page.locator(".dd-offer-card")).toBeVisible();
  const offerName = await page.locator(".dd-offer-name").textContent();
  const clubName = await page.locator(".dd-club-heading h1").textContent();

  await page.reload();

  // The reload must land back on the same offer, not the setup screen -
  // proves src/ui/game-save.ts survives a real full-page reload, the one
  // thing jsdom (tests/ui/game-setup.test.ts) cannot exercise.
  await expect(page.locator(".dd-setup-content")).toHaveCount(0);
  await expect(page.locator(".dd-offer-card")).toBeVisible();
  await expect(page.locator(".dd-offer-name")).toHaveText(offerName ?? "");
  await expect(page.locator(".dd-club-heading h1")).toHaveText(clubName ?? "");
  await expect(page.locator(".dd-notification")).toContainText("Wznowiono przerwaną partię.");
});

test("plays a full game to the legacy screen in a real browser", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 800 });

  const consoleErrors: string[] = [];
  // Any level: browsers differ in how they report a content security policy violation.
  const cspViolations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    if (/content security policy/i.test(msg.text())) cspViolations.push(msg.text());
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const response = await page.goto("/");
  // The preview server sends the production headers (public/_headers, vite.config.ts).
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");

  const figtree = await loadedFigtreeFaces(page);
  expect(figtree.fontFamily).toContain("Figtree");
  expect(figtree.regularLatin).toBeGreaterThan(0);
  expect(figtree.extraBoldLatin).toBeGreaterThan(0);
  expect(figtree.regularPolish).toBeGreaterThan(0);
  expect(figtree.extraBoldPolish).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);

  // Turn the countdown off before starting. CZAS_BAZOWY is 15s and an
  // expired countdown auto-resolves as a pass (game-reducer's TICK case) -
  // clicking this button, which the game exposes anyway, is the clean real-
  // browser equivalent of the fake timers tests/ui/dom-parity.test.ts uses
  // in jsdom. With the timer off, the "czas" (stall) control never renders -
  // that action is already covered by unit tests and dom-parity.
  await enabled(page, "losuj").click();
  await page.locator('[data-timer-choice="off"]').click();
  await enabled(page, "dalej").click();
  await chooseClubAndStart(page, DEFAULT_CLUB_ID);
  await expectNoHorizontalOverflow(page);

  let turn = 0;
  let checkedEpilogue = false;

  const playOneCareer = async (): Promise<void> => {
    for (let guard = 0; guard < 5000; guard += 1) {
      await expectNoHorizontalOverflow(page);
      if (await page.locator('[data-dd-action="znowu"]').count()) break;

      if (await page.locator(".dd-epilogue-summary").count()) {
        await expect(page.locator('.dd-epilogue-content h2[tabindex="-1"]')).toBeFocused();
        if (!checkedEpilogue) {
          checkedEpilogue = true;
          await expect(page.locator(".dd-epilogue-headlines")).toBeVisible();
          await expect(page.locator('.dd-action-bar [data-dd-action="dalej"]')).toBeVisible();
          await expect(page.locator(".dd-btn")).toHaveCount(0);
        }
      }

      // A signing that would evict a squad member opens a confirmation
      // overlay that blocks every other control until it is answered - left
      // unanswered, the next click waits out the whole test timeout.
      if (await enabled(page, "eksmisja-kontynuuj").count()) {
        await enabled(page, "eksmisja-kontynuuj").click();
      } else if (await enabled(page, "oferty").count()) {
        await enabled(page, "oferty").click();
      } else if (await enabled(page, "epilog").count()) {
        await enabled(page, "epilog").click();
      } else if (await enabled(page, "pas").count()) {
        // "pas" is only ever on screen together with the other card controls.
        const slot = turn % 3;
        turn += 1;
        if (slot === 0 && (await enabled(page, "bierz").count())) {
          await enabled(page, "bierz").click();
        } else if (slot === 1) {
          await enabled(page, "targ").click();
        } else {
          await enabled(page, "pas").click();
        }
      } else if (await enabled(page, "dalej").count()) {
        if (await page.locator(".dd-league-table").count()) {
          await expect(page.locator(".dd-league-table").first()).toBeVisible();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          );
          expect(overflow).toBeLessThanOrEqual(0);
        }
        await enabled(page, "dalej").click();
      } else {
        throw new Error("smoke driver stuck: no known control present");
      }
    }
  };

  /**
   * Careers, not one career. Since 2026-08-23 relegation ends the tenure and
   * skips the epilogue entirely - about a quarter of games on this level with
   * this policy - and the UI draws its own seed, so the walk cannot ask for a
   * career that reaches season six. It replays until one does.
   */
  // oxlint-disable-next-line no-unmodified-loop-condition -- playOneCareer() sets checkedEpilogue.
  for (let career = 0; career < 8 && !checkedEpilogue; career += 1) {
    if (career > 0) await enabled(page, "znowu").click();
    await playOneCareer();
  }

  const legacyBox = page.locator(".dd-legacy-points");
  await expect(legacyBox).toHaveText(/^-?\d+$/);
  expect(checkedEpilogue).toBe(true);

  const titleBox = page.locator(".dd-legacy-score h3");
  const title = await titleBox.textContent();
  expect(TYTULY).toContain(title);

  await expectNoHorizontalOverflow(page);

  await enabled(page, "zmien-klub").click();
  await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "wybor");
  await expect(page.locator(".dd-club-fieldset")).toBeVisible();
  await expect(page.locator(".dd-setup-hero h1")).toBeFocused();

  // The manager survives "Zmień klub" - only the club and baseline are
  // cleared (game-reducer.ts's CONFIRM_RESTART) - so stepping back to step 1
  // must still show the identity typed earlier, not a blank form.
  await enabled(page, "wstecz").click();
  await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "start");
  await expect(page.locator("#manager-first-name")).not.toHaveValue("");
  await expect(page.locator("#manager-last-name")).not.toHaveValue("");

  expect(cspViolations).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("scrolls an expanded report into view without a second scrollbar", async ({ page }) => {
  // Everything here is layout, which is exactly what the jsdom tests cannot
  // see: jsdom has no layout, so scrollHeight never exceeds clientHeight and
  // no unit test can tell whether any of this works.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await fillRandomManagerAndContinue(page);
  await chooseClubAndStart(page, DEFAULT_CLUB_ID);

  // Shortened only now: the setup screen needs the room, the drawer needs the
  // lack of it - the reports have to overflow for any of this to mean
  // anything.
  await page.setViewportSize({ width: 360, height: 520 });

  // Straight from the squad review: one tap into a position's reports. Walk
  // the tiles until one has more than a single player, rather than skipping
  // the test - a conditional skip can end up never running at all.
  const tiles = page.locator("button.dd-player-tile");
  const tileCount = await tiles.count();
  let rows = page.locator(".dd-player-trigger");
  for (let i = 0; i < tileCount; i += 1) {
    await tiles.nth(i).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    rows = page.getByRole("dialog").locator(".dd-player-trigger");
    if ((await rows.count()) > 1) break;
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(await rows.count()).toBeGreaterThan(1);

  const drawer = page.getByRole("dialog");
  await expectNoHorizontalOverflow(page);

  const content = drawer.locator(".dd-squad-drawer-content");
  const list = drawer.locator(".dd-position-reports");

  // Exactly one scroller. Two nested ones put two bars side by side and make
  // it a lottery which one a gesture moves.
  const scrollers = await drawer.evaluate(
    (node) =>
      Array.from(node.querySelectorAll<HTMLElement>("*")).filter((el) => {
        const overflow = getComputedStyle(el).overflowY;
        return (overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight;
      }).length
  );
  expect(scrollers).toBeLessThanOrEqual(1);
  expect(await list.evaluate((node) => getComputedStyle(node).overflowY)).not.toBe("auto");

  // Expanding the last row must bring its report into view rather than leave
  // it below the fold.
  await rows.last().click();
  await expect(drawer.locator(".dd-player-report:not([hidden])")).toHaveCount(1);

  const geometry = await content.evaluate((scroller) => {
    const row = scroller.querySelector<HTMLElement>(
      ".dd-player-report:not([hidden])"
    )?.parentElement;
    if (!row) throw new Error("no expanded row");
    const box = scroller.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    return {
      scrolled: scroller.scrollTop,
      overflows: scroller.scrollHeight > scroller.clientHeight,
      topGap: rowBox.top - box.top,
      visible: rowBox.top < box.bottom && rowBox.bottom > box.top,
    };
  });

  expect(geometry.overflows).toBe(true);
  expect(geometry.visible).toBe(true);
  expect(geometry.scrolled).toBeGreaterThan(0);
  // Air above it, but under the 7px gap between cards - any more and it drags
  // the previous card's bottom edge back into view, which reads as a
  // mis-aimed scroll rather than a margin.
  expect(geometry.topGap).toBeGreaterThanOrEqual(0);
  expect(geometry.topGap).toBeLessThan(7);

  // The exit button does not drift away with the content.
  const exit = drawer.locator('[data-dd-action="kadra-zamknij"]');
  await expect(exit).toBeInViewport();
  await expect(exit).toHaveText("Zamknij");
  await expectNoHorizontalOverflow(page);

  await exit.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("spaces a rating the same way wherever it is rendered", async ({ page }) => {
  // The ovr sits between two satellites: the age on its left, its delta on the
  // right. They must look equally close, which is not the same as measuring
  // equally close - the glyphs' side bearings differ on the two sides, so the
  // age's box gap is set half a pixel tighter to compensate. The figures behind
  // that are in the stylesheet, calibrated off 6x screenshots.
  //
  // What this checks is that both gaps exist everywhere a rating is rendered,
  // and that the deliberate difference stays small. The bug it was written for:
  // the declaration lived on the tile's own grid, so the offer card - which
  // renders the same delta in a paragraph - got no gap at all.
  await page.setViewportSize({ width: 410, height: 860 });
  await page.goto("/");
  await fillRandomManagerAndContinue(page);
  await chooseClubAndStart(page, DEFAULT_CLUB_ID);
  await page.locator("button.dd-player-tile").first().waitFor();

  const tiles = await page.locator(".dd-player-tile .dd-player-rating").evaluateAll((ratings) =>
    ratings.flatMap((rating) => {
      const box = (selector: string) => rating.querySelector(selector)?.getBoundingClientRect();
      const age = box(".dd-player-age");
      const ovr = box("strong");
      const delta = box(".dd-season-change");
      if (!age || !ovr || !delta) return [];
      return [{ before: ovr.left - age.right, after: delta.left - ovr.right }];
    })
  );

  expect(tiles.length).toBeGreaterThan(10);
  for (const { before, after } of tiles) {
    // Both gaps present - neither side glued to the number.
    expect(before).toBeGreaterThanOrEqual(1.4);
    expect(after).toBeGreaterThanOrEqual(1.9);
    // The age's side is the tighter one, and only just: this is a correction of
    // well under a pixel, not a structural asymmetry.
    expect(after - before).toBeGreaterThan(0);
    expect(after - before).toBeLessThan(1);
  }

  // The same delta gap in the position report, which renders the pair at a
  // third size again. Reached by opening a position's reports, so this cannot
  // silently measure nothing the way an offer-type-dependent path would.
  await page.locator("button.dd-player-tile").first().click();
  await page.getByRole("dialog").waitFor();
  const reports = await page.locator(".dd-player-row-ovr").evaluateAll((rows) =>
    rows.flatMap((row) => {
      const delta = row.querySelector(".dd-season-change");
      if (!delta) return [];
      // The ovr is a bare text node, so measure from the row's own left edge:
      // the delta is the only element in it.
      const range = document.createRange();
      range.setStart(row, 0);
      range.setEnd(row, 1);
      return [delta.getBoundingClientRect().left - range.getBoundingClientRect().right];
    })
  );

  expect(reports.length).toBeGreaterThan(0);
  const tileGap = tiles[0]!.after;
  for (const gap of reports) {
    expect(gap).toBeGreaterThan(1.5);
    // Within a pixel of the tile's gap: one grammar, not two.
    expect(Math.abs(gap - tileGap)).toBeLessThan(1);
  }

  // And the offer card's own tiles, which are narrower than the formation's.
  // That narrowness is what exposed the ovr drifting off centre, so measuring
  // only the formation line was measuring the case that could not fail.
  await page.keyboard.press("Escape");
  await enabled(page, "oferty").click();
  await page.locator(".dd-offer-position-tiles .dd-player-tile").first().waitFor();
  const offerTiles = await page
    .locator(".dd-offer-position-tiles .dd-player-rating")
    .evaluateAll((ratings) =>
      ratings.flatMap((rating) => {
        const tile = rating.closest(".dd-player-tile");
        const ovr = rating.querySelector("strong");
        if (!tile || !ovr) return [];
        const tileBox = tile.getBoundingClientRect();
        const ovrBox = ovr.getBoundingClientRect();
        return [Math.abs(ovrBox.left + ovrBox.width / 2 - (tileBox.left + tileBox.width / 2))];
      })
    );

  expect(offerTiles.length).toBeGreaterThan(0);
  for (const offset of offerTiles) {
    expect(offset).toBeLessThanOrEqual(1);
  }
});

test("centres what is inside a formation tile", async ({ page }) => {
  // The visible half of the same report: with the tile stretched, its
  // contents no longer sat where the design puts them.
  await page.setViewportSize({ width: 410, height: 860 });
  await page.goto("/");
  await fillRandomManagerAndContinue(page);
  await chooseClubAndStart(page, DEFAULT_CLUB_ID);
  await page.locator("button.dd-player-tile").first().waitFor();

  const offsets = await page.locator(".dd-formation-line").evaluateAll((lines) =>
    lines.flatMap((line) =>
      Array.from(line.querySelectorAll<HTMLElement>(".dd-player-tile")).flatMap((tile) => {
        const box = tile.getBoundingClientRect();
        const centre = box.left + box.width / 2;
        return Array.from(tile.querySelectorAll<HTMLElement>(".dd-player-rating strong")).map(
          (ovr) => {
            const ovrBox = ovr.getBoundingClientRect();
            return Math.abs(ovrBox.left + ovrBox.width / 2 - centre);
          }
        );
      })
    )
  );

  expect(offsets.length).toBeGreaterThan(0);
  // Starter and substitute alike, on the tile's centre line.
  for (const offset of offsets) {
    expect(offset).toBeLessThanOrEqual(1);
  }
});

test("opts out of the text inflation that caused it", async ({ page }) => {
  // The other half of the same fix, and the half no headless browser can
  // exercise: text-size-adjust exists purely to switch off a mobile-Safari
  // behaviour that does not happen here. Desktop WebKit neither reports the
  // property in computed style nor keeps it in cssRules - it drops it at
  // parse time as unsupported - so both of those checks would pass in
  // Chromium and fail in WebKit for a reason that has nothing to do with the
  // bug. The shipped stylesheet is read as text instead, which is
  // engine-independent and is what a phone would actually receive.
  //
  // This is the honest limit of what a test can claim here; the geometry
  // above covers what happens if the inflation gets through anyway.
  await page.goto("/");
  const href = await page
    .locator('link[rel="stylesheet"]')
    .first()
    .evaluate((node) => (node as HTMLLinkElement).href);
  const css = await (await page.request.get(href)).text();

  expect(css).toContain("-webkit-text-size-adjust:100%");
});

test("hides the depth row it still carries, and locks the page behind the drawer", async ({
  page,
}) => {
  // Two things jsdom cannot answer: whether a row with the hidden attribute is
  // actually off screen when a class sets `display: flex` on it, and whether
  // the document still scrolls behind an open drawer.
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/");
  await fillRandomManagerAndContinue(page);
  await chooseClubAndStart(page, DEFAULT_CLUB_ID);
  await enabled(page, "oferty").click();

  const depth = page.locator(".dd-offer-position-line").first();
  await expect(depth).toBeHidden();
  await expect(page.locator(".dd-offer-position-line").nth(1)).toBeVisible();

  await page.locator(".dd-offer-position-squad").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator(".dd-squad-drawer button.dd-player-tile").first().click();

  const anchor = page.locator(".dd-player-trigger").first();
  const before = await anchor.evaluate((node) => node.getBoundingClientRect().top);
  await page.evaluate(() => {
    window.scrollTo(0, 2000);
    document.documentElement.scrollTop = 2000;
  });
  const after = await anchor.evaluate((node) => node.getBoundingClientRect().top);

  // The page underneath must not move at all while the drawer is open.
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
});

test("the squad-depth confirmation fits a 360px viewport", async ({ page }) => {
  // The dialog's real CSS in a real engine: jsdom has no layout, so it cannot
  // answer whether the panel fits or whether the page starts scrolling
  // sideways. Reaching the dialog through play would need a squad packed to
  // its limit, which is state no production build should expose - so the
  // exact markup the component renders is injected instead. This asserts the
  // stylesheet, not React; the behaviour is covered by the jsdom test.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.locator(".dd-root").waitFor();

  await page.evaluate(() => {
    const make = (tag: string, className: string, text?: string): HTMLElement => {
      const node = document.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const notification = make("div", "dd-notification", "Poprzednia decyzja została zapisana");
    const overlay = make("div", "dd-eviction-overlay");
    overlay.setAttribute("role", "presentation");
    const panel = make("div", "dd-eviction-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "eviction-title");
    panel.setAttribute("aria-describedby", "eviction-body");
    const kicker = make("div", "dd-eviction-kicker", "Liczebność kadry");
    kicker.setAttribute("aria-hidden", "true");
    const content = make("div", "dd-eviction-content");
    const title = make("h2", "dd-eviction-title", "Limit zawodników na ŚO został osiągnięty");
    title.id = "eviction-title";
    const body = make("div", "dd-eviction-body");
    body.id = "eviction-body";
    body.append(
      make(
        "p",
        "dd-eviction-intro",
        "W celu finalizacji transferu musielibyśmy zwolnić jednego zawodnika:"
      )
    );
    const changes = make("dl", "dd-eviction-changes");
    for (const [direction, label, player] of [
      ["arrival", "Dołączy", "K. Nowy (78 OVR, 24 lata)"],
      ["departure", "Odejdzie", "M. Wójcik (52 OVR, 35 lat)"],
    ]) {
      const row = make("div", `dd-eviction-change dd-eviction-${direction}`);
      row.append(make("dt", "", label), make("dd", "", player));
      changes.append(row);
    }
    body.append(changes, make("p", "dd-eviction-question", "Czy chcesz kontynuować?"));
    const actions = make("div", "dd-eviction-actions");
    for (const [className, action, label] of [
      ["dd-eviction-cancel", "eksmisja-anuluj", "Wróć do oferty"],
      ["dd-eviction-confirm", "eksmisja-kontynuuj", "Potwierdź transfer"],
    ]) {
      const button = make("button", className!, label);
      button.setAttribute("type", "button");
      button.setAttribute("data-dd-action", action!);
      actions.append(button);
    }
    content.append(title, body, actions);
    panel.append(kicker, content);
    overlay.append(panel);
    document.querySelector(".dd-root")!.append(notification, overlay);
  });

  const panel = page.locator(".dd-eviction-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator(".dd-eviction-kicker")).toHaveText("Liczebność kadry");
  await expect(page.locator(".dd-eviction-arrival")).toContainText("K. Nowy");
  await expect(page.locator(".dd-eviction-departure")).toContainText("M. Wójcik");
  await expect(page.locator('[data-dd-action="eksmisja-anuluj"]')).toBeVisible();
  await expect(page.locator('[data-dd-action="eksmisja-kontynuuj"]')).toBeVisible();

  const layers = await page.evaluate(() => ({
    notification: Number.parseInt(
      getComputedStyle(document.querySelector(".dd-notification")!).zIndex
    ),
    overlay: Number.parseInt(
      getComputedStyle(document.querySelector(".dd-eviction-overlay")!).zIndex
    ),
  }));
  expect(layers.overlay).toBeGreaterThan(layers.notification);

  // The page never scrolls sideways - the standing 360px rule. Compared
  // against clientWidth rather than a literal 360: Chromium reserves a
  // classic vertical scrollbar and WebKit overlays it, so the viewport's own
  // usable width differs by ~15px between the two engines while "does it
  // scroll horizontally" means the same thing in both.
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(clientWidth);
  expect(box.height).toBeLessThanOrEqual(800);
});

test("keeps the action bar and the squad drawer the same distance above an iPhone's home indicator", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "only Chromium can stand in for a device's safe area");
  // A portrait iPhone: 34px reserved at the bottom for the home indicator. Without viewport-fit=cover
  // the page reads every inset as 0 and the buttons sit on the indicator; with the whole inset as
  // padding they sit far above it.
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 47, bottom: 34, left: 0, right: 0 },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await startGameWithoutTimer(page);

  const gapBelow = async (selector: string) => {
    const box = (await page.locator(selector).last().boundingBox())!;
    return 844 - (box.y + box.height);
  };
  const barGap = await gapBelow(".dd-action-bar-inner button");
  await page.locator(".dd-offer-position-squad").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const drawerGap = await gapBelow('[data-dd-action="kadra-zamknij"]');

  expect(barGap).toBeCloseTo(21, 0);
  expect(drawerGap).toBeCloseTo(barGap, 0);
});
