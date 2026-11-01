import { expect, test, type Page } from "@playwright/test";

/**
 * A human accessibility review found two focus bugs that no static snapshot
 * could see, because both only exist in motion: selecting a club scrolled
 * the keyboard-focused radio off screen (club-select-screen.tsx, "A11y fix
 * 2026-09-16, CRITICAL #1"), and pressing "Wstecz" dropped focus to <body>
 * (app.tsx, "A11y fix 2026-09-16, CRITICAL #2"). tests/e2e/a11y.spec.ts's
 * axe scan takes one static picture per screen and cannot catch either -
 * axe never sees where focus lands after a click, only whether the DOM it is
 * pointed at right now has an accessibility problem.
 *
 * This file plays instead of snapshotting. After every screen transition and
 * every meaningful interaction, it asserts two invariants:
 *
 *   1. Focus never sits on <body> or <html>. Focus that falls to the
 *      document is focus lost - a keyboard or screen-reader user has no idea
 *      where they are any more.
 *   2. The focused element is actually visible: inside the viewport
 *      rectangle, and not painted over by anything else - most notably the
 *      sticky bottom action bar (`.dd-action-bar`, position: fixed, and can
 *      legitimately overlap content at 360px), but the check is general
 *      rather than bar-specific. This is WCAG 2.2 2.4.11 Focus Not Obscured
 *      - the exact criterion the club-list bug violated.
 *
 *      "Obscured" is answered with `document.elementFromPoint` at the
 *      focused element's own centre, not by comparing bounding rectangles:
 *      a naive rectangle overlap check flags a false positive the moment a
 *      HIGHER-stacked layer geometrically overlaps the bar's rectangle
 *      without actually covering it - the squad drawer, the eviction
 *      dialog and the restart confirmation all sit above the action bar in
 *      z-index and can legitimately occupy the same screen space it would
 *      otherwise use. Asking the browser what is actually topmost at that
 *      point sidesteps every one of those cases for free: it also means an
 *      auto-hidden bar (`.is-hidden`, pointer-events: none on the outer
 *      container - see styles.css) is correctly never "in the way", with
 *      no separate case for it here.
 *
 * Both checks use Playwright's auto-waiting implicitly: they read
 * document.activeElement and its geometry right after an awaited action
 * resolves, never a fixed sleep. React's focus-moving effects run
 * synchronously within the same commit that the click's event handler
 * triggers, so by the time page.click() has resolved the DOM already
 * reflects wherever focus ended up - the existing `toBeFocused()` assertions
 * elsewhere in this suite already rely on the same timing.
 *
 * The suite-wide contextOptions.reducedMotion: "reduce" default
 * (playwright.config.ts) applies here too. One consequence worth knowing:
 * under reduced motion, sticky-action-bar.tsx's scroll-driven auto-hide
 * never engages at all (useScrollAwareBar's onScroll handler no-ops when
 * `prefers-reduced-motion: reduce` is set), so `.dd-action-bar` is
 * effectively always visible in every test in this file. That mechanism -
 * hide on scroll down, reveal on scroll up or at the bottom - is exercised
 * separately, under real motion, by the "action bar scroll hide/reveal"
 * describe block in tests/e2e/smoke.spec.ts.
 */

// No trace in this file, although playwright.config.ts keeps one for every
// failed test elsewhere. Measured 2026-09-23: with `trace: "retain-on-failure"`
// the "hidden action bar pointer-through" test failed in both browsers ("bar
// was not still hidden before the focus check") and passed with `--trace off`
// on the same build. Recording adds enough latency between a scroll and the
// focus check for the scroll listener to reveal the bar, so here the trace
// changes the timing under test instead of observing it. Playwright allows
// this override only per file, not per describe block.
test.use({ trace: "off" });

const enabled = (page: Page, action: string) =>
  page.locator(`[data-dd-action="${action}"]:not([disabled])`);

const currentScreen = (page: Page) => page.locator(".dd-root").getAttribute("data-dd-screen");

type FocusSnapshot = {
  readonly tag: string;
  readonly rect: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly width: number;
    readonly height: number;
  };
  /** Whatever `document.elementFromPoint` returns at the focused element's
   * own centre point, if it is neither the element itself nor in an
   * ancestor/descendant relationship with it - i.e. something else is
   * actually painted there instead. `null` when nothing is in the way. */
  readonly obscuredByHtml: string | null;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly outerHtml: string;
} | null;

const readFocusSnapshot = (page: Page): Promise<FocusSnapshot> =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return null;
    const rect = active.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    // Clamped into the viewport so a control that is only partially on
    // screen still samples a point Playwright can reason about, rather than
    // a negative or off-screen coordinate that elementFromPoint always
    // answers with null for.
    const sampleX = Math.min(Math.max(rect.left + rect.width / 2, 0), viewportWidth - 1);
    const sampleY = Math.min(Math.max(rect.top + rect.height / 2, 0), viewportHeight - 1);
    const hit = document.elementFromPoint(sampleX, sampleY);
    const obscured =
      hit !== null && hit !== active && !active.contains(hit) && !hit.contains(active);
    return {
      tag: active.tagName,
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      },
      obscuredByHtml: obscured ? (hit as HTMLElement).outerHTML.slice(0, 160) : null,
      viewportWidth,
      viewportHeight,
      outerHtml: active.outerHTML.slice(0, 160),
    };
  });

/** The two invariants from the module comment, asserted together so a
 * failure always names the interaction that broke them (`context`) rather
 * than leaving that to be reconstructed from a stack trace afterwards.
 *
 * Waits for focus to settle before reading it: app.tsx's own focus-
 * management is a plain `useEffect`, which React defers until after the
 * browser paints - a transition that removes the previously focused element
 * from the DOM natively reverts focus to `<body>` for that instant, before
 * the effect gets a chance to move it onward. That is exactly the "legitimately
 * leaves nothing focused for an instant" case the module comment names;
 * polling for the settled state (rather than reading once, immediately
 * after the action that triggered the transition) is what tells that apart
 * from focus that is actually, permanently lost. If it never settles within
 * the timeout, that IS focus lost, and the assertion below reports it. */
const assertFocusVisible = async (page: Page, context: string): Promise<void> => {
  await page
    .waitForFunction(
      () => {
        const active = document.activeElement;
        return !!active && active !== document.body && active !== document.documentElement;
      },
      undefined,
      { timeout: 3_000 }
    )
    .catch(() => {
      // Swallowed on purpose - the assertions below re-read the same state
      // and report a precise, named failure instead of a bare timeout.
    });

  const snap = await readFocusSnapshot(page);
  if (!snap) throw new Error(`${context}: document.activeElement is null`);

  expect(
    snap.tag === "BODY" || snap.tag === "HTML",
    `${context}: focus fell to <${snap.tag.toLowerCase()}> - focus lost`
  ).toBe(false);

  expect(
    snap.rect.width > 0 && snap.rect.height > 0,
    `${context}: focused element has no rendered box (${snap.outerHtml})`
  ).toBe(true);

  const withinViewport =
    snap.rect.bottom > 0 &&
    snap.rect.top < snap.viewportHeight &&
    snap.rect.right > 0 &&
    snap.rect.left < snap.viewportWidth;
  expect(
    withinViewport,
    `${context}: focused element is scrolled out of the viewport ` +
      `(top=${snap.rect.top}, bottom=${snap.rect.bottom}, viewport height=${snap.viewportHeight}) - ${snap.outerHtml}`
  ).toBe(true);

  expect(
    snap.obscuredByHtml,
    `${context}: something else is painted over the focused element's own centre point ` +
      `(${snap.obscuredByHtml}) - ${snap.outerHtml}`
  ).toBeNull();
};

/**
 * Activates a button by keyboard (focus, then Enter) rather than
 * `.click()`. WCAG's focus criteria are about keyboard/assistive-tech
 * navigation, and driving every action this way keeps that the thing under
 * test - a raw pointer click carries no such guarantee even in a correctly
 * built app: WebKit, unlike Chromium, does not focus a plain `<button>` on
 * a mouse or touch click at all (see manager-screen.tsx's "Losuj" button
 * and offer-card.tsx's squad trigger for two places this repo already
 * works around it). Using `.click()` here would make this suite fail on
 * WebKit for a platform convention that has nothing to do with this game's
 * own focus management, and papering over that by special-casing WebKit
 * would test less than driving every action the way a keyboard user
 * actually would.
 */
const activateAndCheck = async (page: Page, action: string, context: string): Promise<void> => {
  const locator = enabled(page, action);
  await locator.focus();
  await page.keyboard.press("Enter");
  await assertFocusVisible(page, context);
};

test.describe("keyboard-only journey", () => {
  test("keeps focus visible through name entry, an error, recovery, randomising and club selection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");

    const firstName = page.locator("#manager-first-name");
    const lastName = page.locator("#manager-last-name");
    const dalej = () => enabled(page, "dalej");

    // Type a name - deliberately too short, so the very next step is the
    // validation error this journey exists to cover. No mouse click is used
    // anywhere below this line: every field and button is reached by
    // .focus() (standing in for however many Tab/Shift+Tab presses a real
    // player used to land there) and driven by keyboard events only.
    await firstName.focus();
    await page.keyboard.type("J");
    await lastName.focus();
    await page.keyboard.type("Kowalski");
    await dalej().focus();
    await page.keyboard.press("Enter");

    await assertFocusVisible(page, "manager form: validation error");
    await expect(firstName).toBeFocused();
    await expect(firstName).toHaveAttribute("aria-invalid", "true");

    // Recover: the app already moved focus onto the offending field, so
    // fixing it is a direct retype, no refocusing needed.
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Jan");

    // Draw a random name instead of continuing immediately - it overwrites
    // both fields but leaves focus on the button that triggered it (see the
    // "A11y fix (2026-09-16, HIGH #3)" comment in manager-screen.tsx).
    await page.locator('[data-dd-action="losuj"]').focus();
    await page.keyboard.press("Enter");
    await assertFocusVisible(page, "manager form: after drawing a random name");
    await expect(page.locator('[data-dd-action="losuj"]')).toBeFocused();
    await expect(firstName).not.toHaveValue("");
    await expect(lastName).not.toHaveValue("");

    await dalej().focus();
    await page.keyboard.press("Enter");
    await assertFocusVisible(page, "manager screen -> club screen");
    await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "wybor");

    // Arrow through several clubs - the exact interaction that used to
    // scroll the focused radio off screen (CRITICAL #1). Native radio-group
    // keyboard behaviour moves focus and selection together on every
    // ArrowDown, which is also what re-runs the scroll-into-view effect this
    // guards.
    const firstRadio = page.locator('.dd-club-radio-list input[type="radio"]').first();
    await firstRadio.focus();
    await assertFocusVisible(page, "club screen: first radio focused");
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press("ArrowDown");
      await assertFocusVisible(page, `club screen: arrowed to club #${step + 2}`);
    }
    await expect(page.locator(".dd-club-detail")).toBeVisible();

    // Go back - the exact interaction that used to drop focus to <body>
    // (CRITICAL #2).
    await page.locator('[data-dd-action="wstecz"]').focus();
    await page.keyboard.press("Enter");
    await assertFocusVisible(page, "club screen -> manager screen (wstecz)");
    await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "start");
    // The manager identity typed and randomised above must have survived
    // the round trip - BACK (game-reducer.ts) clears neither field.
    await expect(firstName).not.toHaveValue("");

    // Forward again, select a club for real this time, and start the career.
    await dalej().focus();
    await page.keyboard.press("Enter");
    await assertFocusVisible(page, "manager screen -> club screen (second time)");

    const radios = page.locator('.dd-club-radio-list input[type="radio"]');
    await radios.nth(2).focus();
    await page.keyboard.press(" ");
    await assertFocusVisible(page, "club screen: selected a specific club");
    await expect(page.locator(".dd-club-detail")).toBeVisible();

    await page.locator('[data-dd-action="zacznij-kariere"]').focus();
    await page.keyboard.press("Enter");
    await assertFocusVisible(page, "club screen -> career start");
    await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "przeglad");
  });
});

test("keeps focus visible after every transition and interaction across a full game", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await activateAndCheck(page, "losuj", "manager screen: after drawing a random name");
  const timerOff = page.locator('[data-timer-choice="off"]');
  await timerOff.focus();
  await page.keyboard.press("Enter");
  await assertFocusVisible(page, "manager screen: after choosing no timer");
  await activateAndCheck(page, "dalej", "manager screen -> club screen");

  const firstClubRadio = page.locator('.dd-club-radio-list input[type="radio"]').first();
  await firstClubRadio.focus();
  await page.keyboard.press(" ");
  await assertFocusVisible(page, "club screen: after selecting a club");
  // Same reason a11y.spec.ts scrolls back to the top here: nothing about
  // this test needs to reproduce the fixed scroll bug, it needs to get past
  // it reliably so the rest of the walk can run.
  await page.evaluate(() => window.scrollTo(0, 0));
  await activateAndCheck(page, "zacznij-kariere", "club screen -> career start");

  let checkedSquadDrawer = false;
  let checkedRestartPrompt = false;

  const maybeCheckSquadDrawer = async (): Promise<void> => {
    if (checkedSquadDrawer) return;
    const trigger = page.locator(".dd-offer-squad-trigger");
    if (!(await trigger.count())) return;
    await trigger.click();
    await assertFocusVisible(page, "squad drawer: opened from an offer card");
    await page.keyboard.press("Escape");
    await assertFocusVisible(page, "squad drawer: closed with Escape");
    checkedSquadDrawer = true;
  };

  const maybeCheckRestartPrompt = async (): Promise<void> => {
    if (checkedRestartPrompt) return;
    if (!(await enabled(page, "restart-pytaj").count())) return;
    await activateAndCheck(page, "restart-pytaj", "restart prompt: opened");
    await activateAndCheck(page, "restart-nie", "restart prompt: cancelled");
    checkedRestartPrompt = true;
  };

  const activateBierzWithEviction = async (context: string): Promise<void> => {
    await activateAndCheck(page, "bierz", `${context}: bierz`);
    // A signing that would evict a current squad member shows a confirmation
    // overlay instead of resolving immediately. Confirming keeps the walk moving rather than leaving the offer
    // hanging.
    if (await enabled(page, "eksmisja-kontynuuj").count()) {
      await activateAndCheck(page, "eksmisja-kontynuuj", `${context}: eviction confirmed`);
    }
  };

  let guard = 0;
  while (guard < 5000) {
    guard += 1;
    const screen = await currentScreen(page);
    if (!screen) break;

    await maybeCheckSquadDrawer();
    await maybeCheckRestartPrompt();

    if (await enabled(page, "znowu").count()) break;
    if (await enabled(page, "oferty").count()) {
      await activateAndCheck(page, "oferty", `${screen}: oferty`);
    } else if (await enabled(page, "epilog").count()) {
      await activateAndCheck(page, "epilog", `${screen}: epilog`);
    } else if (await enabled(page, "bierz").count()) {
      await activateBierzWithEviction(screen);
    } else if (await enabled(page, "pas").count()) {
      await activateAndCheck(page, "pas", `${screen}: pas`);
    } else if (await enabled(page, "dalej").count()) {
      await activateAndCheck(page, "dalej", `${screen}: dalej`);
    } else {
      throw new Error(`focus walk stuck on screen "${screen}": no known control present`);
    }
  }

  expect(checkedSquadDrawer, "the walk never reached an offer card with a squad trigger").toBe(
    true
  );
  expect(
    checkedRestartPrompt,
    "the walk never saw an enabled restart prompt during the career"
  ).toBe(true);

  // The final screen - reached either through the ordinary werdykt/epilogue
  // path or a mid-career relegation, both of which land here (see
  // a11y.spec.ts's separate relegation test for why those two are different
  // trees). From here, reach the archive the same way the smoke test does:
  // change club (lands on the club screen), then go back (lands on the
  // manager screen, "Wstecz" again, once more away from setup this time).
  await activateAndCheck(page, "zmien-klub", "final screen -> club screen (zmien klub)");
  await activateAndCheck(page, "wstecz", "club screen -> manager screen (wstecz, post-career)");
  await activateAndCheck(page, "archiwum", "manager screen -> archive");
  await activateAndCheck(page, "archiwum-powrot", "archive -> manager screen");
});

/**
 * Product owner report (2026-09-17): arrowing UP to the fifth club left the
 * focused radio under the action bar, and arrowing DOWN made it drift lower
 * with every press. The club screen used to fire several smooth scrolls per
 * selection that cancelled each other; it now issues one scroll to a target
 * computed against the final layout (club-select-scroll.ts).
 *
 * The journey walks the whole list both ways and, after every press, waits
 * for the page to stop moving - the smooth scroll and the panel's expansion
 * both animate, so a fixed sleep would either be flaky or slow - then checks
 * the row holding focus sits between the top of the viewport and the top
 * edge of the action bar. The bar's OUTER box is used: on mobile, with motion
 * on, the bar may have slid its content away, but its fixed box never moves,
 * so this is the stricter reading.
 *
 * Run under both motion preferences, because the suite default
 * (reducedMotion: "reduce", playwright.config.ts) never exercises the smooth
 * path the product owner actually saw.
 */
const waitForScrollToSettle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const STABLE_FRAMES = 8;
        let last = "";
        let stable = 0;
        const tick = (): void => {
          const active = document.activeElement;
          const row = active?.closest("label") ?? active;
          const sample = `${window.scrollY}|${row?.getBoundingClientRect().top ?? 0}`;
          stable = sample === last ? stable + 1 : 0;
          last = sample;
          if (stable >= STABLE_FRAMES) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );

const assertFocusedRowClearOfBar = async (page: Page, context: string): Promise<void> => {
  const geometry = await page.evaluate(() => {
    const active = document.activeElement;
    const row = active?.closest("label");
    const bar = document.querySelector(".dd-action-bar");
    if (!row || !bar) return null;
    const rowRect = row.getBoundingClientRect();
    return {
      rowTop: rowRect.top,
      rowBottom: rowRect.bottom,
      barTop: bar.getBoundingClientRect().top,
      name: row.textContent,
    };
  });
  expect(geometry, `${context}: focus is not on a club row`).not.toBeNull();
  const { rowTop, rowBottom, barTop, name } = geometry!;
  expect(
    rowTop,
    `${context}: "${name}" starts above the viewport (top=${rowTop})`
  ).toBeGreaterThanOrEqual(0);
  expect(
    rowBottom,
    `${context}: "${name}" reaches under the action bar (row bottom=${rowBottom}, bar top=${barTop})`
  ).toBeLessThanOrEqual(barTop);
};

test.describe("club list arrow scrolling", () => {
  const viewports = [
    { width: 360, height: 800 },
    { width: 980, height: 880 },
  ] as const;
  const motions = ["reduce", "no-preference"] as const;

  for (const viewport of viewports) {
    for (const motion of motions) {
      test(`keeps the focused club clear of the action bar at ${viewport.width}x${viewport.height}, reduced motion: ${motion}`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: motion });
        await page.goto("/");
        await activateAndCheck(page, "losuj", "manager screen: random name");
        await activateAndCheck(page, "dalej", "manager screen -> club screen");
        await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "wybor");

        const radios = page.locator('.dd-club-radio-list input[type="radio"]');
        const count = await radios.count();
        expect(count).toBe(18);

        await radios.first().focus();
        await page.keyboard.press(" ");
        await waitForScrollToSettle(page);
        await assertFocusVisible(page, "club #1 selected");
        await assertFocusedRowClearOfBar(page, "club #1 selected");

        const step = async (key: "ArrowDown" | "ArrowUp", index: number): Promise<void> => {
          await page.keyboard.press(key);
          await expect(radios.nth(index)).toBeChecked();
          await waitForScrollToSettle(page);
          const context = `${key} to club #${index + 1}`;
          await assertFocusVisible(page, context);
          await assertFocusedRowClearOfBar(page, context);
        };

        for (let index = 1; index < count; index += 1) await step("ArrowDown", index);
        for (let index = count - 2; index >= 0; index -= 1) await step("ArrowUp", index);
      });
    }
  }
});

test.describe("hidden action bar pointer-through", () => {
  // Product owner report, real device: on a phone, elements sitting under
  // the collapsed action bar could not be tapped. Diagnosis - a `transform`
  // moves what is painted but never changes the box an element occupies in
  // layout, so hiding the bar by translating `.dd-action-bar-inner`
  // off-screen (sticky-action-bar.tsx's `hidden` state) left the OUTER
  // `.dd-action-bar` - position: fixed, full height, pointer-events: auto by
  // default - still pinned across the bottom of the screen, swallowing every
  // tap underneath it. The fix (styles.css) sets pointer-events: none on the
  // outer element while `.is-hidden`, restored under `:focus-within` so a
  // keyboard user tabbing back into the (now visually revealed) bar can
  // still reach it.
  //
  // jsdom has no layout, so nothing in tests/ui can see a "box that still
  // occupies space after its content moved away" - this can only be proven
  // in a real engine. Not run under the suite's reduced-motion default: the
  // auto-hide is disabled entirely under prefers-reduced-motion (see the
  // module comment at the top of this file), so real motion has to be
  // switched on for the scroll to hide the bar at all - the same pattern
  // smoke.spec.ts's "action bar scroll hide/reveal" describe block uses.
  test("lets a tap reach content underneath the bar once it has scrolled away", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await enabled(page, "losuj").click();
    await enabled(page, "dalej").click();
    await expect(page.locator(".dd-root")).toHaveAttribute("data-dd-screen", "wybor");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(
      () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    // One frame between the two scrolls, as in smoke.spec.ts: WebKit can
    // deliver the hook's media-query change at the next rendering update, and
    // a scroll handled before it still sees reduced motion and never hides.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
    const actionBar = page.locator(".dd-action-bar");
    await expect(actionBar).not.toHaveClass(/is-hidden/);
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect(actionBar).toHaveClass(/is-hidden/);

    // A club row that now sits inside the rectangle the bar occupies at the
    // bottom of the viewport - hidden or not, the OUTER `.dd-action-bar` is
    // still `position: fixed` there; only its inner content is transformed
    // away. That rectangle is exactly what used to swallow the tap.
    const targetIndex = await page.evaluate(() => {
      const barRect = document.querySelector(".dd-action-bar")!.getBoundingClientRect();
      const radios = Array.from(
        document.querySelectorAll<HTMLInputElement>('.dd-club-radio-list input[type="radio"]')
      );
      return radios.findIndex((radio) => {
        const rect = radio.getBoundingClientRect();
        return rect.top >= 0 && rect.top < barRect.bottom && rect.bottom > barRect.top;
      });
    });
    expect(
      targetIndex,
      "no club row sits under the hidden bar's rectangle at this scroll offset - adjust the scroll distance above"
    ).toBeGreaterThanOrEqual(0);

    const target = page.locator('.dd-club-radio-list input[type="radio"]').nth(targetIndex);
    await expect(target).not.toBeChecked();
    const box = await target.boundingBox();
    if (!box) throw new Error("target radio is not measurable");

    // A real mouse/touch click at that point, not Playwright's locator
    // click - the locator API detects an intercepting element and retries or
    // fails loudly, which is not what a real tap does. A real tap on a
    // phone just goes to whatever is topmost at that point and nothing
    // visibly happens, which is the actual bug report: the row silently
    // never gets selected.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(target).toBeChecked();

    // Keyboard focus must still reach the bar while it is visually hidden -
    // pointer-events never affects keyboard input, but confirmed rather than
    // assumed, since that is exactly the property the fix leans on. Read
    // everything inside one page.evaluate rather than a Playwright
    // `.focus()` + separate assertions: `element.focus()` triggers the
    // browser's own default scroll-into-view (a real behaviour, not a bug),
    // and by the time a second round-trip back into the page checked the
    // class, WebKit had already scrolled far enough to reveal the bar for
    // real and flip `hidden` back to false through the ordinary scroll
    // listener - a true statement about that scroll, not about whether
    // pointer-events blocked the focus call. `preventScroll: true` removes
    // that confound so this checks exactly one thing: with pointer-events
    // still "none" on the outer element, does a programmatic focus still
    // land, and does the `:focus-within` rule still flip it to "auto".
    const barState = await page.evaluate(() => {
      const bar = document.querySelector(".dd-action-bar");
      const button = document.querySelector('[data-dd-action="wstecz"]');
      if (!(bar instanceof HTMLElement) || !(button instanceof HTMLElement)) return null;
      const wasHidden = bar.classList.contains("is-hidden");
      button.focus({ preventScroll: true });
      return {
        wasHidden,
        focused: document.activeElement === button,
        pointerEvents: getComputedStyle(bar).pointerEvents,
      };
    });
    expect(barState, "bar or its wstecz button is not in the DOM").not.toBeNull();
    expect(barState?.wasHidden, "bar was not still hidden before the focus check").toBe(true);
    expect(barState?.focused, "pointer-events: none also blocked keyboard focus").toBe(true);
    expect(barState?.pointerEvents, "focus-within did not restore pointer-events").toBe("auto");
  });
});
