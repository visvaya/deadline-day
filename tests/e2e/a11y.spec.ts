import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Runtime half of the accessibility gate. The static half is
 * the jsx-a11y rules in oxlint.config.ts, and the two are not
 * substitutes: the linter reads JSX it never runs, so it sees a handler on a
 * div in a branch no test reaches, while axe sees computed contrast and the
 * real accessibility tree but only where this walk actually goes. That is why
 * the walk visits every phase the reducer can render and says so out loud -
 * an unvisited screen here is an unchecked screen, and silence would look the
 * same as a pass.
 *
 * Zero violations, not a stored baseline of permitted ones. That was the
 * original plan, written before anyone measured; the
 * structural rules came back clean, and a gate that permits a list of
 * failures is one people learn to scroll past.
 *
 * "best-practice" is included as of 2026-09-16. Running it once surfaced
 * "region" 35 times, all traced to two shared components - the sticky action
 * bar and the HUD - that sat outside any landmark. The action bar is now a
 * plain `role="region"` (see sticky-action-bar.tsx). The HUD's landmark could
 * not go directly on its `<dl>` - "region" is outside the roles HTML permits
 * that element to take, and forcing it broke the dt/dd pairing axe checks
 * with "dlitem", one violation the first fix introduced for every cell. The
 * landmark instead sits on a wrapper `<div>` that the `<dl>` renders inside
 * and disappears from for layout via `display: contents` (see hud.tsx and
 * .dd-hud-list in styles.css), so the dl keeps its native list role and the
 * four number cells keep their flex layout unchanged. Both fixes resolve the
 * rule rather than suppress it, and the tag stays on to catch the next
 * component that repeats the mistake.
 *
 * color-contrast is the exception and is switched off here on purpose. Two
 * separate reasons, either of which alone would be enough:
 *
 *   1. axe cannot see this UI's contrast. On the offer screen it judged 10
 *      nodes and gave up on 53 - "background could not be determined due to a
 *      pseudo element" - because the card's decoration is drawn in ::before
 *      and ::after. A check that silently skips five sixths of the screen it
 *      is pointed at reports a pass that means nothing.
 *   2. The palette knowingly fails 4.5:1 on four quiet text tokens. That is
 *      measured, owned and pinned by tests/ui/palette-contrast.test.ts, which
 *      computes the ratios from the tokens themselves and so covers every
 *      element they reach, pseudo-decorated or not.
 *
 * So contrast is measured where it can be measured completely, and axe is
 * left to do what it does reliably: roles, names, labels, focus order,
 * heading structure and target size.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Every value app.tsx can put in data-dd-screen. "start" (the manager form)
 * and "wybor" (the club screen) are two separate screens now, both reached
 * on the way into every career; before this stage they
 * were unreachable, and therefore unscanned, before this stage. */
const EXPECTED_SCREENS = [
  "start",
  "wybor",
  "przeglad",
  "okno",
  "polSezonu",
  "koniecSezonu",
  "werdykt",
  "epilog",
  "final",
  "archiwum",
];

type Finding = {
  screen: string;
  rule: string;
  impact: string;
  target: string;
};

const enabled = (page: Page, action: string) =>
  page.locator(`[data-dd-action="${action}"]:not([disabled])`);

const currentScreen = (page: Page) => page.locator(".dd-root").getAttribute("data-dd-screen");

/** Flattened to one row per offending node: a rule broken in six places is
 * six things to fix, and collapsing them to the rule name hides five. */
const scan = async (page: Page, screen: string): Promise<Finding[]> => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .disableRules(["color-contrast"])
    .analyze();
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      screen,
      rule: violation.id,
      impact: violation.impact ?? "unknown",
      target: node.target.join(" "),
    }))
  );
};

/**
 * Manager -> club -> career, with the timer off. Takes an optional `visit`
 * callback so a caller mid-walk (the full-game test below) can scan the
 * "start" and "wybor" screens as it passes through them, rather than only
 * ever seeing whichever one a scripted helper happened to leave behind.
 */
const startGameWithoutTimer = async (
  page: Page,
  clubId = "lech-poznan",
  visit?: () => Promise<void>
): Promise<void> => {
  await enabled(page, "losuj").click();
  await page.locator('[data-timer-choice="off"]').click();
  await enabled(page, "dalej").click();
  if (visit) await visit();
  await page.locator(`[data-dd-action="klub:${clubId}"]`).click();
  // Selecting a club scrolls its detail panel into view, and the sticky
  // action bar can then sit outside the 360 px viewport - Playwright refuses
  // to click it and retries until the test times out.
  await page.evaluate(() => window.scrollTo(0, 0));
  await enabled(page, "zacznij-kariere").click();
};

test("meets WCAG 2.2 AA on every screen of a full game", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const findings: Finding[] = [];
  const phases = new Set<string>();
  const scanned = new Set<string>();

  /**
   * Keyed finer than the phase for the offer window, which is one phase and
   * several different cards that differ in layout and controls, not only in
   * wording. Scanning "okno" once would have meant scanning whichever card
   * happened to come first and calling the phase covered. Which kinds turn up
   * is left to the run rather than pinned with a seed: nothing asserts on
   * them, so a rarer card is extra coverage when it appears and costs nothing
   * when it does not.
   *
   * The key is the kind chip's own text, so it separates four of the five
   * offer types. PANIC is deliberately not one of them: it renders the same
   * "Kupno" chip and the same is-purchase markup as KUPNO and differs only in
   * the agent's sentence, so there is no fifth DOM for axe to look at. If that
   * ever stops being true - a deadline badge, a different control - this key
   * stops distinguishing it and has to read the type rather than the label.
   */
  const scanKey = async (phase: string): Promise<string> => {
    if (phase !== "okno") return phase;
    const kind = await page.locator(".dd-offer-kind").first().textContent();
    return `okno:${kind?.split("·")[0]?.trim() ?? "?"}`;
  };

  const visit = async (): Promise<void> => {
    const phase = await currentScreen(page);
    if (!phase) return;
    phases.add(phase);
    const key = await scanKey(phase);
    if (scanned.has(key)) return;
    scanned.add(key);
    findings.push(...(await scan(page, key)));
  };

  await visit();
  await startGameWithoutTimer(page, "lech-poznan", visit);

  /**
   * One career is no longer guaranteed to reach every screen. Since
   * 2026-08-23 relegation ends the tenure on the spot and skips the epilogue
   * entirely, and the walk cannot choose a seed - the UI draws its own. So it
   * plays careers until every expected phase has been seen, which on the
   * measured 15.5% relegation rate for this policy is almost always the first
   * one and effectively never more than a handful.
   */
  const stillMissing = (): string[] =>
    EXPECTED_SCREENS.filter((screen) => screen !== "archiwum" && !phases.has(screen));

  for (let career = 0; career < 8; career += 1) {
    for (let guard = 0; guard < 5000; guard += 1) {
      await visit();
      if (await enabled(page, "znowu").count()) break;

      // Signing whenever the club can afford to is what fills the parts of the
      // UI an all-pass game never renders: transfer log rows, squad changes,
      // the "signed by you" markers on the legacy screen.
      // A signing that would evict a squad member opens a confirmation
      // overlay that blocks every other control until it is answered.
      if (await enabled(page, "eksmisja-kontynuuj").count())
        await enabled(page, "eksmisja-kontynuuj").click();
      else if (await enabled(page, "oferty").count()) await enabled(page, "oferty").click();
      else if (await enabled(page, "epilog").count()) await enabled(page, "epilog").click();
      else if (await enabled(page, "bierz").count()) await enabled(page, "bierz").click();
      else if (await enabled(page, "pas").count()) await enabled(page, "pas").click();
      else if (await enabled(page, "dalej").count()) await enabled(page, "dalej").click();
      else throw new Error("a11y walk stuck: no known control present");
    }
    await visit();
    if (stillMissing().length === 0) break;
    await enabled(page, "znowu").click();
  }

  // The archive is an overlay rather than a phase, and it is worth scanning
  // full rather than empty - the game just finished, so it has a row in it.
  await enabled(page, "archiwum").click();
  await visit();
  await enabled(page, "archiwum-powrot").click();

  expect([...phases].sort()).toEqual([...EXPECTED_SCREENS].sort());
  expect(findings).toEqual([]);
});

test("meets WCAG 2.2 AA with the squad drawer and restart prompt open", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await startGameWithoutTimer(page);
  await enabled(page, "oferty").click();

  await page.locator(".dd-offer-squad-trigger").click();
  await expect(page.getByRole("dialog", { name: "Kadra" })).toBeVisible();
  expect(await scan(page, "szuflada-kadry")).toEqual([]);

  // The reports mode is a different tree in the same dialog: tiles are
  // buttons, the header grows a back arrow, and every row is a disclosure.
  await page.locator("button.dd-player-tile").first().click();
  await expect(page.locator(".dd-player-trigger").first()).toBeVisible();
  expect(await scan(page, "szuflada-raportow")).toEqual([]);

  await page.locator(".dd-player-trigger").first().click();
  await expect(page.locator(".dd-player-report:not([hidden])")).toHaveCount(1);
  expect(await scan(page, "szuflada-raport-rozwiniety")).toEqual([]);

  await page.keyboard.press("Escape");

  await enabled(page, "restart-pytaj").click();
  await expect(enabled(page, "restart-tak")).toBeVisible();
  expect(await scan(page, "potwierdzenie-restartu")).toEqual([]);
});

test("meets WCAG 2.2 AA on the desktop two-column layout", async ({ page }) => {
  // The 360 px walk above never renders this: the offer screen splits into two
  // columns on a wide viewport, which moves reading order and focus order.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  expect(await scan(page, "start-desktop")).toEqual([]);

  await startGameWithoutTimer(page, "lech-poznan", async () => {
    expect(await scan(page, "wybor-desktop")).toEqual([]);
  });
  expect(await scan(page, "przeglad-desktop")).toEqual([]);

  await enabled(page, "oferty").click();
  expect(await scan(page, "okno-desktop")).toEqual([]);
});

/**
 * The legacy screen a relegated tenure reaches is a different tree: no
 * epilogue seasons, different headings, a different top bar. The walk above
 * cannot force it - the UI draws its own seed - so this test buys nothing on
 * the weakest club (`radomiak-radom`, "Najniższa prognoza sportowa" in
 * src/data/clubs.ts), where relegation is the overwhelmingly likely outcome,
 * and retries a couple of careers rather than pinning one.
 */
test("meets WCAG 2.2 AA on the legacy screen after relegation", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await startGameWithoutTimer(page, "radomiak-radom");

  for (let career = 0; career < 6; career += 1) {
    for (let guard = 0; guard < 5000; guard += 1) {
      if (await enabled(page, "znowu").count()) break;
      // A signing that would evict a squad member opens a confirmation
      // overlay that blocks every other control until it is answered.
      if (await enabled(page, "eksmisja-kontynuuj").count())
        await enabled(page, "eksmisja-kontynuuj").click();
      else if (await enabled(page, "oferty").count()) await enabled(page, "oferty").click();
      else if (await enabled(page, "epilog").count()) await enabled(page, "epilog").click();
      else if (await enabled(page, "pas").count()) await enabled(page, "pas").click();
      else if (await enabled(page, "dalej").count()) await enabled(page, "dalej").click();
      else throw new Error(`relegation walk stuck on "${await currentScreen(page)}"`);
    }

    const heading = await page.locator(".dd-club-bar").textContent();
    if (heading?.includes("przerwana spadkiem")) {
      expect(await scan(page, "final-po-spadku")).toEqual([]);
      // The ceiling reveal is what section 12 forbids a short ending to drop:
      // either the reveals themselves, or the note saying nobody was bought.
      expect(await page.locator(".dd-player-reveals, .dd-note").count()).toBeGreaterThan(0);
      return;
    }
    await enabled(page, "znowu").click();
  }

  throw new Error("no career ended in relegation after six attempts with the weakest club");
});
