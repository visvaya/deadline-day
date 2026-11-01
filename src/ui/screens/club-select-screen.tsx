import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CLUBS, ratingForClubId } from "../../data/clubs";
import { initialEuropeanBerth } from "../../data/european-berths-2026";
import type { ClubRecord, ManagerIdentity } from "../../data/types";
import {
  projectedTransferBudgetChange,
  projectedTransferBudgetChangeWithCups,
  projectedWageShare,
} from "../../logic/club-projection";
import { scaledRecurringRevenue } from "../../logic/finance-scale";
import { initialClubBudget } from "../../logic/finance";
import { ord, pl, znak } from "../../logic/format";
import { initialClubProjection, initialLeagueProjection } from "../../logic/league-projection";
import { AppHero } from "../components/app-hero";
import { SectionHeading } from "../components/section-heading";
import { StickyActionBar } from "../components/sticky-action-bar";
import { clubSelectScrollTarget } from "../club-select-scroll";
import { EUROPEAN_CUP_NAMES } from "../european-cup-names";
import { getInputModality } from "../input-modality";
import { writeSetupDraftFields } from "../setup-draft";
import { mapAt } from "../../logic/invariant";

/**
 * Step 2 of career setup: pick one of the eighteen Ekstraklasa clubs.
 * Rendered by `app.tsx` for `faza: "wybor"` - reached from the manager
 * screen, and again after a restart or "Zmień klub", when the manager is
 * already known.
 */
export type ClubSelectScreenProps = {
  readonly onBack: () => void;
  readonly onStart: (_clubId: string) => void;
  /** The validated manager already in game state. Written into the setup
   * draft alongside the club, because this screen can be entered with no
   * draft at all (after a restart the draft was cleared at career start) -
   * without it, a reload here would restore an empty name. */
  readonly manager: ManagerIdentity;
  /** The current timer choice, persisted in the draft for the same reason. */
  readonly timerWl: boolean;
  /** Prefill from setup-draft.ts - the validated club id this screen last
   * wrote there (before a reload, or before "Wstecz" in this session), or
   * null. Read by app.tsx on every entry to this screen. */
  readonly initialSelectedClubId?: string | null;
};

export type RatingSide = "attack" | "defence";

/**
 * Five-step scale for a `TEAM_RATINGS` multiplier, at the exact boundaries
 * the plan pins down. `>=` on every threshold, so a club sitting precisely on
 * a boundary reads as the stronger of the two levels. Shared by `ratingLabel`
 * (the words) and `ratingDots` (the decorative indicator) so the two never
 * drift apart.
 */
export const ratingLevel = (value: number): 1 | 2 | 3 | 4 | 5 => {
  if (value >= 1.1) return 5;
  if (value >= 1.03) return 4;
  if (value >= 0.97) return 3;
  if (value >= 0.9) return 2;
  return 1;
};

const RATING_WORDS: Record<1 | 2 | 3 | 4 | 5, readonly [string, string]> = {
  5: ["bardzo mocny", "bardzo mocna"],
  4: ["mocny", "mocna"],
  3: ["przeciętny", "przeciętna"],
  2: ["słaby", "słaba"],
  1: ["bardzo słaby", "bardzo słaba"],
};

export const ratingLabel = (value: number, side: RatingSide): string =>
  RATING_WORDS[ratingLevel(value)][side === "attack" ? 0 : 1];

const RATING_DOT_COUNT = 5;

export type RatingDotState = "filled" | "empty";

/**
 * Decorative indicator supplementing `ratingLabel` - filled vs. hollow dots,
 * not colour, carry the level, and the adjacent word still carries the
 * meaning (same treatment as the Staff Assessment stars in design-system.md,
 * "gwiazdki... są dekoracją"). Derived only from the `TEAM_RATINGS`
 * multiplier via `ratingLevel`, never from anything ceiling-correlated.
 *
 * Correction 4 (2026-09-15): this used to hand back a string of two
 * different Unicode glyphs ("●"/"○") for the caller to print verbatim. Those
 * are two unrelated glyph designs, not one shape rendered two ways, so the
 * hollow circle's stroke drew visibly bigger than the solid circle's fill -
 * nothing a `box-sizing` fix could reach, because no box model was involved
 * at all. Returning a per-dot state instead lets the component render each
 * dot as its own element with one shared box (`.dd-club-rating-dot`), so
 * "filled" and "empty" differ only in `background`, never in size.
 */
export const ratingDots = (value: number): readonly RatingDotState[] => {
  const level = ratingLevel(value);
  return Array.from({ length: RATING_DOT_COUNT }, (_, index) =>
    index < level ? "filled" : "empty"
  );
};

/**
 * Provisional per-club accent colour - deliberately small, deliberately not
 * `src/data/club-visuals.ts`. See design-system.md, "Barwy klubowe", for why
 * the real model (1-3 colours, a pattern, all three club populations,
 * sourced from RSSSF and club sites) is separate, later, step-7+ work: this
 * table is a narrower fill-in, not that model.
 *
 * Product owner decision, 2026-09-15: fill in all eighteen clubs from RSSSF
 * Poland Team Colours (https://www.rsssf.org/colours/poland.html), the
 * source the plan already names as the basis for the eventual full table.
 * RSSSF describes kits in words ("green shirts, white shorts"), never hex,
 * so every value below is a REPRESENTATIVE rendering of a colour NAME from
 * that source, not an official club brand colour - each entry's comment
 * quotes the exact RSSSF wording it came from. Where RSSSF lists a
 * multi-colour shirt ("Red & blue halves", "Yellow & black stripes"), the
 * FIRST-listed colour is taken as the accent; this is a judgement call, not
 * something RSSSF states, and several clubs share the same named colour
 * ("red", "blue", "yellow") and therefore the same representative hex - that
 * is honest reuse of one word's rendering, not a claim that those clubs'
 * real kits match.
 *
 * Legia is the one exception: its green predates this pass and already has
 * traceable provenance (the 2026-08-09 UI mockup renders its crest with
 * `fill="#116639"`), so it is kept as-is even though
 * RSSSF actually lists Legia's shirt as "White with black edges" - the two
 * disagree, and the mockup value wins per explicit instruction, not because
 * it is more correct.
 *
 * Three clubs have no RSSSF line at all (Raków Częstochowa, Radomiak Radom,
 * Wieczysta Kraków - all either newly promoted or too recently reformed for
 * that page) and correctly keep no entry: they render the neutral monogram,
 * exactly as every club did before this pass.
 */
const PROVISIONAL_CLUB_ACCENT: Readonly<Record<string, string>> = {
  // RSSSF: "Blue & white stripes" (jersey) - first-listed colour, blue.
  "lech-poznan": "#1b4f9c",
  // Kept as-is; see the block comment above for why this stays #116639
  // despite RSSSF listing Legia's shirt as "White with black edges".
  "legia-warszawa": "#116639",
  // RSSSF: "Yellow; red edges" (jersey) - first-listed colour, yellow.
  "jagiellonia-bialystok": "#ffd500",
  // RSSSF: "Dark blue & red halves" (jersey) - first-listed colour, dark blue.
  "pogon-szczecin": "#0c2f5e",
  // RSSSF: "Red; white sleeves" (jersey) - first-listed colour, red.
  "gornik-zabrze": "#c8102e",
  // RSSSF: "Red & white stripes; black edges" (jersey) - first-listed colour, red.
  cracovia: "#c8102e",
  // RSSSF: "Red; white edges" (jersey) - first-listed colour, red.
  "widzew-lodz": "#c8102e",
  // RSSSF: "Green; white edges" (jersey) - first-listed colour, green.
  "slask-wroclaw": "#1e7a34",
  // RSSSF: "Red & blue halves" (jersey) - first-listed colour, red.
  "piast-gliwice": "#c8102e",
  // RSSSF: "Red & yellow stripes" (jersey) - first-listed colour, red.
  "korona-kielce": "#c8102e",
  // RSSSF: "Yellow; blue edges" (jersey) - first-listed colour, yellow.
  "motor-lublin": "#ffd500",
  // RSSSF: "Orange; black & green edges" (jersey) - first-listed colour, orange.
  "zaglebie-lubin": "#e8720c",
  // RSSSF: "Blue; white edges" (jersey) - first-listed colour, blue.
  "wisla-plock": "#1b4f9c",
  // RSSSF: "Red; white edges" (jersey) - first-listed colour, red.
  "wisla-krakow": "#c8102e",
  // RSSSF: "Yellow & black stripes" (jersey) - first-listed colour, yellow.
  "gks-katowice": "#ffd500",
};

const hexChannels = (hex: string): readonly [number, number, number] => {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
};

const linearize = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a `#rrggbb` colour, 0 (black) to 1 (white). */
const relativeLuminance = (hex: string): number => {
  const [r, g, b] = hexChannels(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
};

/**
 * The reactive outline design-system.md requires "from the first line":
 * light accent colours (relative luminance above the halfway point) get a
 * dark outline, dark ones get a light outline. This is what keeps a future
 * yellow or white club colour from disappearing against the light panel -
 * and by the same rule, colours the monogram letter sitting inside the
 * badge, since that text is INSIDE the coloured shape, not beside it.
 *
 * This only picks the TONE. The colour itself lives in styles.css as one of
 * two palette tokens - `--text-primary` for "dark", `--text-on-emphasis` for
 * "light" - so no colour value lives in TypeScript.
 */
export const accentOutlineTone = (hex: string): "dark" | "light" =>
  relativeLuminance(hex) > 0.5 ? "dark" : "light";

const clubMonogram = (name: string): string =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

type ClubStatKey = "miejsce" | "punkty" | "budzet" | "przychod" | "zmiana-budzetu" | "udzial-plac";

type ClubStat = {
  readonly key: ClubStatKey;
  readonly label: string;
  readonly value: string;
  /** Present only for `zmiana-budzetu` on the five clubs with a season-1
   * European berth: the cup-free figure, shown in parentheses next to the
   * cup-inclusive main value. Absent for the other thirteen, where it would
   * just repeat the main value. */
  readonly cupFreeValue?: string;
};

/**
 * Correction (2026-09-15, round 3): the three keys sharing one asterisk and
 * one footnote below - `Prognozowane miejsce`, `Oczekiwane punkty` and
 * `Prognozowana zmiana budżetu po sezonie`. They share a footnote because
 * they share a cause: this screen computes from the club's ratings BEFORE a
 * squad exists and EXCLUDES European cup income
 * (`initialClubProjection`/`projectedTransferBudgetChange`), while the
 * in-game HUD computes from the actually generated squad and formation and
 * DOES include cup income (`freezeSeasonForecast`, `annualForecast`). Both
 * numbers are legitimate; they just answer different questions at different
 * points in the career. `Budżet pierwszego okna`, `Stały przychód` and
 * `Udział płac` are not pre-season projections in that same sense - they
 * read the club's finances directly, not a forecast of squad performance -
 * so they stay unmarked.
 */
const FOOTNOTE_STAT_KEYS: ReadonlySet<ClubStatKey> = new Set([
  "miejsce",
  "punkty",
  "zmiana-budzetu",
]);

const FORECAST_FOOTNOTE_ID = "club-forecast-footnote";

/**
 * The exact six numbers the plan allows on this screen - never more, per the
 * global constraint that this screen is not a HUD. Everything else about a
 * club (attack, defence, Europe, `character`) is rendered as words, never as
 * a `data-dd-club-stat`.
 */
const clubStats = (clubId: string): readonly ClubStat[] => {
  const projection = initialClubProjection(clubId);
  const budget = initialClubBudget(clubId);
  const revenue = scaledRecurringRevenue(clubId);
  const changeWithCups = projectedTransferBudgetChangeWithCups(clubId);
  const changeCupFree = projectedTransferBudgetChange(clubId);
  // Product owner decision, 2026-09-15: the main value now includes the
  // expected European cup income; the cup-free figure - the only one
  // comparable across all eighteen clubs - moves into parentheses, and only
  // for the five clubs a berth actually changes it. See spec section 6.2.
  const hasBerth = initialEuropeanBerth(clubId) !== null;
  const wageShare = projectedWageShare(clubId);
  return [
    { key: "miejsce", label: "Prognozowane miejsce", value: ord(projection.expectedPlace) },
    {
      key: "punkty",
      label: "Oczekiwane punkty",
      value: `${pl(projection.expectedSeasonPoints, 1)} pkt`,
    },
    {
      key: "budzet",
      label: "Budżet pierwszego okna",
      value: `${pl(budget, 2)}\u00a0mln\u00a0€`,
    },
    {
      key: "przychod",
      label: "Stały przychód",
      value: `${pl(revenue, 2)}\u00a0mln\u00a0€`,
    },
    {
      key: "zmiana-budzetu",
      label: "Prognozowana zmiana budżetu po sezonie",
      value: `${znak(changeWithCups)}${pl(changeWithCups, 2)}\u00a0mln\u00a0€`,
      cupFreeValue: hasBerth
        ? `${znak(changeCupFree)}${pl(changeCupFree, 2)}\u00a0mln\u00a0€`
        : undefined,
    },
    {
      key: "udzial-plac",
      label: "Udział płac",
      value: `${pl(wageShare * 100, 1)}%`,
    },
  ];
};

/**
 * Round 4 correction (2026-09-15): CSS-rounded boxes (`border-radius: 50%`
 * on a 7x7 `<div>`) looked uneven between filled and empty dots even after
 * the earlier box-sizing/flex-shrink fixes, because a CSS box with a border
 * and a CSS box without one are not the same SHAPE at that size - a solid
 * disc versus a 1px ring with a 5px hole antialias differently, and 7 being
 * odd puts the centre on a half-pixel besides. Inline SVG sidesteps both:
 * one `<circle cx="4" cy="4">` per dot, shared verbatim between states,
 * differing only in `fill`/`stroke`/`r` - resolution-independent at any DPR
 * or zoom.
 *
 * Round 5 correction (2026-09-15): that fix inverted the size problem
 * instead of solving it. An SVG stroke is centred ON the path, so half of it
 * paints outside the circle's radius - the empty dot (`r="3"`, `stroke`)
 * therefore has a visible outer radius of `r + strokeWidth / 2` = 3.5, while
 * the filled dot (`r="3"`, `fill` only) stops exactly at 3. Giving the
 * filled dot a matching stroke would keep both radii formulas identical, but
 * it would also add an invisible-in-effect stroke to a shape that does not
 * need one just to make a second shape's formula line up with it. Shrinking
 * the empty circle's own radius by half the stroke width (3 - 1/2 = 2.5) is
 * the more direct fix: it cancels the stroke's outward half exactly, so the
 * empty dot's outer edge lands back on 3, matching the filled dot's radius
 * with no change to the filled dot at all. Both are centred at the same
 * point in the same 8x8 viewBox, so this only ever moves the empty ring's
 * outer edge, never its centre. */
const RatingDotsRow = ({ value }: { value: number }) => (
  <span className="dd-club-rating-dots" aria-hidden="true">
    {/* Fixed-length (RATING_DOT_COUNT), never reordered or filtered,
        aria-hidden decoration - position is the only thing distinguishing
        one dot from the next, so the array index is a legitimate key here
        rather than a stand-in for a missing stable id. */}
    {ratingDots(value).map((state, index) => (
      // eslint-disable-next-line react/no-array-index-key
      <svg key={index} className="dd-club-rating-dot" viewBox="0 0 8 8">
        {state === "filled" ? (
          <circle cx="4" cy="4" r="3" fill="currentColor" />
        ) : (
          <circle cx="4" cy="4" r="2.5" fill="none" stroke="currentColor" strokeWidth="1" />
        )}
      </svg>
    ))}
  </span>
);

const RADIO_GROUP_NAME = "club-select";
const CLUB_DETAIL_PANEL_ID = "club-detail-panel";

const ClubBadge = ({ club }: { club: ClubRecord }) => {
  const accent = PROVISIONAL_CLUB_ACCENT[club.clubId];
  const monogram = clubMonogram(club.name);
  if (!accent) {
    return (
      <span className="dd-club-badge" aria-hidden="true">
        {monogram}
      </span>
    );
  }
  const tone = accentOutlineTone(accent);
  return (
    <span
      className={`dd-club-badge has-accent is-${tone}-outline`}
      aria-hidden="true"
      style={{ "--dd-club-accent": accent } as CSSProperties}
    >
      {monogram}
    </span>
  );
};

export const ClubSelectScreen = ({
  onBack,
  onStart,
  initialSelectedClubId = null,
  manager,
  timerWl,
}: ClubSelectScreenProps) => {
  const [selectedClubId, setSelectedClubId] = useState<string | null>(initialSelectedClubId);
  const detailRef = useRef<HTMLDivElement>(null);

  // Setup-draft autosave (setup-draft.ts): records the current selection,
  // the fact that the player has reached this step, and the manager and
  // timer already in game state. The last two matter after a restart or
  // "Zmień klub": the draft was cleared at career start, so without them a
  // reload here would find `step: "club"` over an empty name, which
  // START_GAME rejects, and land on a blank form. Fires on mount too
  // (selectedClubId still null then), which is what marks `step: "club"` as
  // soon as the player arrives here, even before they pick anything.
  const { firstName, lastName } = manager;
  useEffect(() => {
    writeSetupDraftFields({ step: "club", clubId: selectedClubId, firstName, lastName, timerWl });
  }, [selectedClubId, firstName, lastName, timerWl]);

  // Product owner's decision, 2026-09-14: best to worst by `expectedPlace`,
  // not by `expectedSeasonPoints` - points tie (Piast and Śląsk both project
  // 40.5 today) while place is unique across 1..18, so sorting on points
  // would need a tie-breaker this does not. Sorts a COPY of `CLUBS`; the
  // source array's order is load-bearing for the fixture list. Also keeps a
  // points-by-club map for the compact list's `(59,0 xPts)` annotation
  // (correction 9, 2026-09-15) - same `initialLeagueProjection()` call the
  // sort already needed, not a second computation.
  const { orderedClubs, pointsByClubId } = useMemo(() => {
    const projections = initialLeagueProjection();
    const placeOf = new Map(projections.map((p) => [p.clubId, p.expectedPlace] as const));
    const pointsOf = new Map(projections.map((p) => [p.clubId, p.expectedSeasonPoints] as const));
    const ordered = [...CLUBS].sort(
      (a, b) =>
        mapAt(placeOf, a.clubId, "expected place") - mapAt(placeOf, b.clubId, "expected place")
    );
    return { orderedClubs: ordered, pointsByClubId: pointsOf };
  }, []);

  const selectedClub = selectedClubId
    ? (orderedClubs.find((club) => club.clubId === selectedClubId) ?? null)
    : null;

  const detail = useMemo(() => {
    if (!selectedClub) return null;
    const rating = ratingForClubId(selectedClub.clubId);
    const cup = initialEuropeanBerth(selectedClub.clubId)?.cup ?? null;
    return {
      club: selectedClub,
      rating,
      cup,
      stats: clubStats(selectedClub.clubId),
    };
  }, [selectedClub]);

  // Correction 2 (2026-09-15): a selection scrolls the detail panel into
  // view, because the panel renders above the list and a tap far down the
  // eighteen rows would otherwise leave the reader looking at the row, not
  // the panel that changed.
  //
  // Fix (2026-09-17, product owner report): arrowing up left the focused
  // radio under the action bar, and arrowing down made it drift lower with
  // every press. The effect used to issue up to three scrolls per selection -
  // two smooth `scrollIntoView` calls and a `scrollBy` computed from a
  // rectangle read before either animation had moved anything - on top of
  // the browser's own scroll-to-focus. Now it reads layout once, computes one
  // absolute target (`clubSelectScrollTarget`, where the rules live) and
  // issues exactly one `scrollTo`. An absolute target is also what makes a
  // fast arrow run safe: each press replaces the previous animation with a
  // target derived from where things are right now, so nothing accumulates.
  //
  // A layout effect, not a plain effect: it runs before paint, in the same
  // frame the panel starts expanding (`.dd-club-detail-reveal` in
  // styles.css), so the scroll and the expansion start together. The panel's
  // FINAL height is read from the bordered box itself, which is laid out at
  // its natural size even while the clipping row around it is still growing;
  // the difference to the row's current height is how far everything below
  // the panel will still move, and the focused row's rectangle is shifted by
  // exactly that before the target is computed. Under reduced motion there is
  // no expansion, so that difference is simply zero.
  useLayoutEffect(() => {
    if (!selectedClubId) return;
    const reveal = detailRef.current;
    const box = reveal?.querySelector<HTMLElement>(".dd-club-detail");
    if (!reveal || !box) return;

    const root = document.documentElement;
    const viewportHeight = window.innerHeight || root.clientHeight;
    const boxMarginTop = Number.parseFloat(getComputedStyle(box).marginTop) || 0;
    const revealRect = reveal.getBoundingClientRect();
    const growth = boxMarginTop + box.offsetHeight - revealRect.height;
    const panelTop = revealRect.top + boxMarginTop;

    const barRect = document.querySelector(".dd-action-bar")?.getBoundingClientRect();
    const barTop = barRect ? Math.min(barRect.top, viewportHeight) : viewportHeight;

    const focused = document.activeElement;
    const rowRect =
      focused instanceof HTMLInputElement && focused.name === RADIO_GROUP_NAME
        ? focused.closest("label")?.getBoundingClientRect()
        : undefined;

    const currentMaxScrollY = root.scrollHeight - viewportHeight;
    const target = clubSelectScrollTarget({
      scrollY: window.scrollY,
      maxScrollY: currentMaxScrollY + growth,
      barTop,
      panelTop,
      panelBottom: panelTop + box.offsetHeight,
      row: rowRect ? { top: rowRect.top + growth, bottom: rowRect.bottom + growth } : null,
      modality: getInputModality(),
    });
    if (target === null) return;

    // A scroll is clamped to the page height at the moment it is issued. If
    // the target lies below today's bottom edge - only possible while the
    // panel is still growing, e.g. a first selection made at the end of the
    // list - finish the expansion now instead of landing short.
    if (target > currentMaxScrollY) {
      reveal.style.transition = "none";
      void reveal.offsetHeight;
      window.requestAnimationFrame(() => {
        reveal.style.transition = "";
      });
    }

    // `matchMedia` and `scrollTo` are optional-chained for jsdom, which lacks
    // the first and only stubs the second.
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    window.scrollTo?.({ top: target, behavior: reducedMotion ? "auto" : "smooth" });
  }, [selectedClubId]);

  return (
    <>
      <AppHero />
      <main className="dd-wrap dd-screen-content">
        <SectionHeading title="Klub" meta="Krok 2 z 2" />
        <p className="dd-note">
          Wybierz jeden z osiemnastu klubów Ekstraklasy, który chciałbyś poprowadzić. Po zaznaczeniu
          zobaczysz szczegóły.
        </p>

        {/* A11y fix (2026-09-16, HIGH #4): the detail panel itself carried no
            live region, so a screen-reader user selecting a club heard
            nothing - the panel sits BEFORE the fieldset in the DOM, so the
            new content is behind their reading position with no announcement
            it appeared. This region is visually hidden (the sighted
            experience - the panel appearing where it always has - is
            unchanged) and deliberately terse: `polite` + a single short
            sentence, because a native radio group fires this on every arrow
            press during keyboard navigation, and a verbose or assertive
            announcement would be worse than none at that frequency.
            `aria-atomic` makes sure the whole sentence is re-announced on
            every change rather than a diff against the previous club's
            name. */}
        <div className="dd-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {selectedClub ? `Wybrano: ${selectedClub.name}.` : ""}
        </div>

        {/* A11y fix (2026-09-16, follow-up): this wrapper used to be
            entirely conditional on `detail` (`{detail && (<div id={...}>
            ...`), so before any club was ever selected the id every radio's
            `aria-controls` points at (below) did not exist in the document -
            axe's `aria-valid-attr-value` (critical) flagged exactly that on
            all eighteen radios on first paint. The wrapper itself is now
            unconditional - it always carries `CLUB_DETAIL_PANEL_ID`, so
            `aria-controls` resolves to a real element at every moment the
            radios are rendered - and only its content (and the
            `dd-club-detail` panel styling: border, padding, background) stays
            conditional on `detail`. With no class and no children, the empty
            wrapper renders as a zero-size, unstyled `<div>` - no visible
            change before the first selection.

            2026-09-17: the persistent wrapper is now a one-row grid around a
            clipping cell, and the bordered `.dd-club-detail` box lives inside
            it. That split is what lets the scroll effect above read the box's
            final height while the wrapper is still at its old one. */}
        <div
          className={`dd-club-detail-reveal${detail ? " is-open" : ""}`}
          id={CLUB_DETAIL_PANEL_ID}
          ref={detailRef}
        >
          <div className="dd-club-detail-clip">
            {detail && (
              <div className="dd-club-detail">
                {/* Only the panel's first appearance is animated (see
                    styles.css): switching clubs keeps the box in place and
                    swaps the numbers instantly, which is why the content
                    needs neither its own wrapper nor a key here. */}
                <div className="dd-club-detail-heading">
                  <ClubBadge club={detail.club} />
                  <div>
                    <h2>{detail.club.name}</h2>
                    <p className="dd-club-character">{detail.club.character}</p>
                  </div>
                </div>

                <dl className="dd-club-quality">
                  <div>
                    <dt>Atak</dt>
                    <dd>{ratingLabel(detail.rating.attack, "attack")}</dd>
                    <RatingDotsRow value={detail.rating.attack} />
                  </div>
                  <div>
                    <dt>Obrona</dt>
                    <dd>{ratingLabel(detail.rating.defence, "defence")}</dd>
                    <RatingDotsRow value={detail.rating.defence} />
                  </div>
                </dl>

                {/* Correction 2 (2026-09-15): the caption used to sit right under
                the attack/defence indicators, before the rule that separates
                them from the six numbers below - so it read as trailing the
                ratings block instead of introducing the numbers it actually
                qualifies. `dd-club-forecast-note` carries that rule now
                (border-top, moved off `.dd-club-stat-grid`), so the caption
                sits below it, immediately over the block it describes. */}
                <p className="dd-club-caption dd-club-forecast-note">
                  Kluczowe fakty i prognozy na 1. sezon kadencji
                </p>

                <div className="dd-club-stat-grid">
                  {detail.stats.map((stat) => {
                    const hasFootnote = FOOTNOTE_STAT_KEYS.has(stat.key);
                    return (
                      <div
                        key={stat.key}
                        className="dd-club-stat"
                        data-dd-club-stat={stat.key}
                        aria-describedby={hasFootnote ? FORECAST_FOOTNOTE_ID : undefined}
                      >
                        <span className="dd-club-stat-label">
                          {stat.label}
                          {/* Decorative - the accessible link to the footnote is
                          `aria-describedby` on the whole stat above, not this
                          glyph, so it is never announced as bare, meaningless
                          punctuation. */}
                          {hasFootnote && <span aria-hidden="true">*</span>}
                        </span>
                        <span className="dd-club-stat-value">
                          {stat.value}
                          {stat.cupFreeValue !== undefined && (
                            // Product owner correction, 2026-09-16: a plain " "
                            // here renders as a real space (confirmed in
                            // Chromium/WebKit both), but at 11px next to "€" it
                            // reads as glued-together in a screenshot.
                            // "\u00a0" is the same visual width but can
                            // never be an (invisible) line-break point, so
                            // the figure can never start a line detached
                            // from its separator.
                            <span className="dd-club-stat-value-cupfree dd-secondary-figure">
                              {"\u00a0"}({stat.cupFreeValue})
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <p className="dd-club-caption">
                  {detail.cup
                    ? // Genitive after "kwalifikacje": "Liga Mistrzów" -> "Ligi
                      // Mistrzów" (only the first word inflects; "Mistrzów" /
                      // "Europy" / "Konferencji" are already genitive).
                      // This is a qualifying round, not a guaranteed
                      // league phase.
                      `Europejskie puchary w 1. sezonie: kwalifikacje ${EUROPEAN_CUP_NAMES[detail.cup].replace(/^Liga/, "Ligi")}.`
                    : "Europejskie puchary w 1. sezonie: brak."}
                </p>

                {/* Correction (2026-09-15, round 3): one shared footnote for the
                three pre-season estimates above, placed below the European
                cup line per instruction. `FORECAST_FOOTNOTE_ID` is the target
                of `aria-describedby` on each marked stat, not just visual
                proximity, so the association survives for screen-reader
                users too.

                Product owner decision, 2026-09-15: the wording changed to
                cover the parenthesised cup-free figure on `zmiana-budzetu`
                as well - the same `aria-describedby` association means a
                screen reader announces this sentence together with the stat
                it explains, so the parenthetical number is never read as an
                unexplained second value. */}
                <p id={FORECAST_FOOTNOTE_ID} className="dd-club-caption dd-club-footnote">
                  <span aria-hidden="true">* </span>
                  Szacunki bazujące na średniej wygenerowanej kadrze. Zespół powstaje na nowo w
                  każdej karierze, więc rzeczywiste liczby zwykle będą nieco inne. Liczba główna
                  wlicza przewidywany przychód z europejskich pucharów, wartość w nawiasie go
                  pomija.
                </p>
              </div>
            )}
          </div>
        </div>

        <fieldset className="dd-club-fieldset">
          <legend>Dostępne kluby</legend>
          <div className="dd-club-radio-list">
            {orderedClubs.map((club) => {
              const isSelected = club.clubId === selectedClubId;
              return (
                <label
                  key={club.clubId}
                  className={`dd-club-radio${isSelected ? " is-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name={RADIO_GROUP_NAME}
                    value={club.clubId}
                    checked={isSelected}
                    onChange={() => setSelectedClubId(club.clubId)}
                    data-dd-action={`klub:${club.clubId}`}
                    // A11y fix (2026-09-16, HIGH #4): explicit relationship
                    // from each radio to the panel it drives - the panel sits
                    // earlier in the DOM than this fieldset, so nothing
                    // otherwise ties the two together for assistive tech.
                    // Points at the panel unconditionally (rather than only
                    // once selected) so the relationship is stable and never
                    // appears/disappears as selection changes; once a club
                    // has ever been selected the target id exists for the
                    // rest of this screen's lifetime, since selection is
                    // never cleared back to null.
                    aria-controls={CLUB_DETAIL_PANEL_ID}
                  />
                  <ClubBadge club={club} />
                  <span className="dd-club-radio-name">{club.shortName}</span>
                  <span className="dd-club-radio-points dd-secondary-figure">
                    ({pl(mapAt(pointsByClubId, club.clubId, "expected points"), 1)} xPts)
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </main>

      <StickyActionBar label="Wybór klubu">
        <button
          type="button"
          className="dd-action-primary"
          data-dd-action="zacznij-kariere"
          disabled={selectedClubId === null}
          onClick={() => selectedClubId && onStart(selectedClubId)}
        >
          Zacznij karierę
        </button>
        <div className="dd-action-secondary-row">
          <button
            type="button"
            className="dd-action-secondary is-centered"
            data-dd-action="wstecz"
            onClick={onBack}
          >
            Wstecz
          </button>
        </div>
      </StickyActionBar>
    </>
  );
};
