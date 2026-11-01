/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrast gate for the palette.
 *
 * This exists because axe cannot do the job here: on the offer screen it
 * judged 10 nodes and abandoned 53, because the card's decoration lives in
 * ::before/::after and axe then refuses to guess a background. See the header
 * of tests/e2e/a11y.spec.ts. Reading the tokens instead of the rendering
 * covers every element they reach and needs no browser.
 *
 * It pins ratios rather than asserting a floor, because four quiet text
 * tokens are below the 4.5:1 that docs/decisions/design-system.md requires,
 * and that was left standing on purpose: every value that clears 4.5:1 sits
 * at or below 54.4% lightness, so meeting it would collapse faint, label,
 * muted and caption into one shade next to --text-meta and flatten the four
 * levels of quiet the design is built on. The palette is being reworked in
 * the UI redesign and the decision belongs there, with the whole screen in
 * view rather than one failing token at a time.
 *
 * Until then: these numbers may go up, never down. A drop is a regression and
 * fails here; an improvement fails here too, and is meant to - it asks
 * whoever made it to come and change the number on purpose.
 */

const TOKEN_PATTERN = /(--[\w-]+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g;

type Oklch = { l: number; c: number; h: number };

const readRootTokens = (): Map<string, Oklch> => {
  // Resolved from the working directory rather than import.meta.url: these
  // tests run in the jsdom environment, where import.meta.url is an http URL
  // and readFileSync rejects it.
  const css = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");
  const root = css.slice(css.indexOf(":root {"));
  const block = root.slice(0, root.indexOf("}"));
  const tokens = new Map<string, Oklch>();
  for (const [, name, l, c, h] of block.matchAll(TOKEN_PATTERN)) {
    tokens.set(name!, { l: Number(l) / 100, c: Number(c), h: Number(h) });
  }
  return tokens;
};

/** Oklch -> linear sRGB, then WCAG relative luminance. Clamped because oklch
 * can address colours outside the sRGB gamut and a negative channel would
 * otherwise produce a luminance no display can show. */
const luminance = ({ l, c, h }: Oklch): number => {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  const red = clamp(4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone);
  const green = clamp(-1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone);
  const blue = clamp(-0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone);

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const ratio = (one: number, other: number): number =>
  (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);

/**
 * Measured against the darkest surface a token can sit on, which is the worst
 * case for dark text and therefore the only one worth recording. Picked from
 * the tokens rather than hardcoded, so darkening a surface shows up here as
 * every text token getting worse at once - which is what it would be.
 */
const CONTRAST_ON_DARKEST_SURFACE: Readonly<Record<string, number>> = {
  "--text-primary": 16.8,
  "--text-secondary": 6.66,
  "--text-meta": 5.45,
  "--text-caption": 4.21,
  "--text-muted": 3.31,
  "--text-label": 2.82,
  "--text-faint": 2.37,

  // Not named --text-*, and left out of the first version of this table for
  // exactly that reason - which is the argument for listing tokens by what
  // they colour rather than by what they are called. All four are worn as
  // text: the seasonal OVR change on a player tile, 8.5px on a starter and
  // 7.5px on a reserve. That is information, not decoration, so 4.5:1 applies
  // and none of them is close - they are the worst contrast in the palette,
  // below even --text-faint.
  "--trend-negative": 2.05,
  "--trend-positive": 2.04,
  "--trend-reserve-positive": 1.86,
  "--trend-reserve-negative": 1.83,
};

/** Sits on the emphasis fills, never on a surface, so the table above says
 * nothing useful about it. Checked separately below. */
const INVERTED_TOKEN = "--text-on-emphasis";

describe("palette contrast", () => {
  const tokens = readRootTokens();

  it("finds the palette where the test expects it", () => {
    expect(tokens.size).toBeGreaterThan(10);
    for (const name of Object.keys(CONTRAST_ON_DARKEST_SURFACE)) {
      expect(tokens.has(name), `${name} is gone from :root`).toBe(true);
    }
  });

  it("holds every text token at its recorded contrast", () => {
    const surfaces = [...tokens].filter(([name]) => name.startsWith("--surface-"));
    expect(surfaces.length).toBeGreaterThan(1);
    const darkest = Math.min(...surfaces.map(([, value]) => luminance(value)));

    const measured = Object.fromEntries(
      Object.keys(CONTRAST_ON_DARKEST_SURFACE).map((name) => [
        name,
        Number(ratio(luminance(tokens.get(name)!), darkest).toFixed(2)),
      ])
    );

    expect(measured).toEqual(CONTRAST_ON_DARKEST_SURFACE);
  });

  it("meets 4.5:1 for the club-select list's points annotation (correction 9, 2026-09-15)", () => {
    // Unlike the "Przygaszony" family above, this token is real information
    // (the club's expected points), not decoration, so the 4.5:1 floor
    // applies and is a floor, not pinned debt - it may only ever pass.
    const hint = luminance(tokens.get("--text-club-list-hint")!);
    const panel = luminance(tokens.get("--surface-panel")!);
    expect(ratio(hint, panel)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps inverted text legible on every emphasis fill", () => {
    const inverted = luminance(tokens.get(INVERTED_TOKEN)!);
    // Every family that gets white content on top: meanings colour buttons and
    // badges, --offer-* the card's kind chip, --competition-* the European and
    // relegation markers in the league table. Checking only the meanings left
    // the other two families passing by luck rather than by rule.
    const fills = [...tokens].filter(
      ([name]) =>
        name.startsWith("--meaning-") ||
        name.startsWith("--offer-") ||
        name.startsWith("--competition-")
    );
    expect(fills.length).toBeGreaterThan(8);

    // No debt on this side, so it is a floor rather than a pinned number:
    // white on the meaning fills is what buttons and badges are made of.
    for (const [name, value] of fills) {
      expect(
        ratio(inverted, luminance(value)),
        `${INVERTED_TOKEN} on ${name}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
