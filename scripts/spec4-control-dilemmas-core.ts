import type { PairedDiff } from "./balance-compare-core";
import { pairedDiff } from "./balance-compare-core";
import type { DilemmaCareer } from "./dilemma-observations";
import { distribution, median } from "./stats";

/**
 * Pure arithmetic for the spec 4 control report's dilemma sections (1-4),
 * with no file reading in it. Split from spec4-control-report.ts, the CLI,
 * so the four measurements below can be checked on rows built by hand - the
 * same split every other *-core.ts module in this directory uses.
 *
 * `DilemmaRow` is exactly `DilemmaCareer` (one row of a `--dump-dilemmas`
 * career dump): no local reshaping, so a column the dump adds is available
 * here without a second type to keep in sync.
 */
export type DilemmaRow = DilemmaCareer;

/** The subset of a `--dump-raw` career row `starDilemma` needs, by the raw
 * dump's own column names (`polityka`, not `policyName`). Structural, so
 * the report's fuller parsed row satisfies it without a cast. */
export type RawSeedRow = {
  clubId: string;
  polityka: string;
  seed: number;
  dziedzictwo: number;
  kasa: number;
  tytul: string;
};

const groupBy = <T, K>(rows: readonly T[], key: (_row: T) => K): Map<K, T[]> => {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = groups.get(k);
    if (bucket) bucket.push(row);
    else groups.set(k, [row]);
  }
  return groups;
};

const sumBy = <T>(rows: readonly T[], pick: (_row: T) => number): number =>
  rows.reduce((total, row) => total + pick(row), 0);

// --------------------------------------------------------------------------
// Section 1: first-window gate
// --------------------------------------------------------------------------

/** The policy `firstWindowGate` looks at - the pass-everything baseline,
 * since only it answers "what does the FIRST window offer with no player
 * choice at all in the way". */
const GATE_POLICY = "alwaysPass";

/** The gate's own thresholds, named so the report and the test share one
 * source instead of repeating the numbers. */
export const FIRST_WINDOW_SHARE_GATE = 0.75;
export const FIRST_WINDOW_MEDIAN_GATE: readonly [number, number] = [1, 2];

export type FirstWindowRow = {
  clubId: string;
  windows: number;
  shareWithUseful: number;
  /** Share of first windows a haggle could have reached, an upper bound on
   * shareWithUseful: a haggle can still fail, so this never proves the
   * career actually signed the card. */
  shareWithUsefulHaggle: number;
  medianUsefulAffordable: number;
  failedOnPrice: number;
  /** The subset of failedOnPrice whose haggle price would have been within
   * reach - again an upper bound on how many of those failures a haggle
   * could actually have rescued. */
  failedOnPriceButHaggleReachable: number;
  failedOnTargeting: number;
  passesShare: boolean;
  passesMedian: boolean;
};

/**
 * Per club, over the `alwaysPass` careers only: whether the first transfer
 * window actually offered a useful, affordable purchase. A window that never
 * showed a useful KUPNO card at all (`failedOnTargeting`) is a different
 * failure from one that showed one at a price the club could not meet
 * (`failedOnPrice`), and the two are never summed into one count.
 */
export const firstWindowGate = (rows: readonly DilemmaRow[]): FirstWindowRow[] => {
  const byClub = groupBy(
    rows.filter((row) => row.policyName === GATE_POLICY),
    (row) => row.clubId
  );
  return [...byClub.entries()]
    .map(([clubId, careers]) => {
      const windows = careers.length;
      const successes = careers.filter(
        (row) => row.firstWindowUsefulKupno > 0 && row.firstWindowUsefulAffordableKupno > 0
      ).length;
      const failedOnPrice = careers.filter(
        (row) => row.firstWindowUsefulKupno > 0 && row.firstWindowUsefulAffordableKupno === 0
      );
      const failedOnTargeting = careers.filter((row) => row.firstWindowUsefulKupno === 0).length;
      const shareWithUseful = successes / windows;
      const successesWithHaggle = careers.filter(
        (row) => row.firstWindowUsefulKupno > 0 && row.firstWindowUsefulHaggleAffordableKupno > 0
      ).length;
      const shareWithUsefulHaggle = successesWithHaggle / windows;
      const failedOnPriceButHaggleReachable = failedOnPrice.filter(
        (row) => row.firstWindowUsefulHaggleAffordableKupno > 0
      ).length;
      const medianUsefulAffordable = median(
        careers.map((row) => row.firstWindowUsefulAffordableKupno)
      );
      return {
        clubId,
        windows,
        shareWithUseful,
        shareWithUsefulHaggle,
        medianUsefulAffordable,
        failedOnPrice: failedOnPrice.length,
        failedOnPriceButHaggleReachable,
        failedOnTargeting,
        passesShare: shareWithUseful >= FIRST_WINDOW_SHARE_GATE,
        passesMedian:
          medianUsefulAffordable >= FIRST_WINDOW_MEDIAN_GATE[0] &&
          medianUsefulAffordable <= FIRST_WINDOW_MEDIAN_GATE[1],
      };
    })
    .sort((a, b) => a.clubId.localeCompare(b.clubId));
};

// --------------------------------------------------------------------------
// Section 2: affordable-strengthening share
// --------------------------------------------------------------------------

export type ShareRow = {
  key: string;
  /** Which of the two tables this row belongs to - the report renders club
   * rows and policy rows as two separate tables, never mixed in one. */
  dimension: "club" | "policy";
  externalCards: number;
  /** Null when the cell saw no external cards at all - a share of zero
   * observations, never reported as zero. */
  share: number | null;
  atPriceCapShareOfExternal: number | null;
  atPriceCapShareOfPaidCards: number | null;
};

const buildShareRow = (
  key: string,
  rows: readonly DilemmaRow[],
  dimension: ShareRow["dimension"]
): ShareRow => {
  const externalCards = sumBy(rows, (row) => row.externalCards);
  const paidExternalCards = sumBy(rows, (row) => row.paidExternalCards);
  const affordableStrengthening = sumBy(rows, (row) => row.externalAffordableStrengthening);
  const atPriceCap = sumBy(rows, (row) => row.atPriceCapCards);
  return {
    key,
    dimension,
    externalCards,
    share: externalCards > 0 ? affordableStrengthening / externalCards : null,
    atPriceCapShareOfExternal: externalCards > 0 ? atPriceCap / externalCards : null,
    atPriceCapShareOfPaidCards: paidExternalCards > 0 ? atPriceCap / paidExternalCards : null,
  };
};

/**
 * How much of the external market (KUPNO, PANIC, WOLNY) was both useful and
 * affordable, pooled over CARDS - not averaged over careers, so a club that
 * saw many more cards is not weighted the same as one that saw few. Reported
 * twice: once per club (summed over every policy) and once per policy
 * (summed over every club). Both sets share this one array, distinguished by
 * `dimension`, so the report renders them as two separate tables instead of
 * mixing a club id and a policy name in one column.
 */
export const affordableStrengtheningShare = (rows: readonly DilemmaRow[]): ShareRow[] => {
  const byClub = groupBy(rows, (row) => row.clubId);
  const byPolicy = groupBy(rows, (row) => row.policyName);
  const clubRows = [...byClub.entries()]
    .map(([key, group]) => buildShareRow(key, group, "club"))
    .sort((a, b) => a.key.localeCompare(b.key));
  const policyRows = [...byPolicy.entries()]
    .map(([key, group]) => buildShareRow(key, group, "policy"))
    .sort((a, b) => a.key.localeCompare(b.key));
  return [...clubRows, ...policyRows];
};

// --------------------------------------------------------------------------
// Section 3: financial pressure
// --------------------------------------------------------------------------

export type PressureRow = {
  clubId: string;
  /** Null when the club has zero observed windows - a share of zero
   * observations, never reported as zero. */
  windowsUnderPressureShare: number | null;
  /** Null when the club closed no sales at all. */
  thresholdCrossingSalesPer100Sales: number | null;
  thresholdCrossingSalesPerCareer: number;
};

/**
 * A stand-in for dilemma (ii) of the spec's chapter 12.2 - "a fixed purchase
 * threshold got crossed", never "a sale was necessary". `pressureSales`
 * counts a sale whose proceeds took cash from below `usefulPurchaseCost` to
 * at or above it; it says nothing about whether that particular sale, or a
 * cheaper one, was the only way there.
 */
export const financialPressure = (rows: readonly DilemmaRow[]): PressureRow[] => {
  const byClub = groupBy(rows, (row) => row.clubId);
  return [...byClub.entries()]
    .map(([clubId, careers]) => {
      const windows = sumBy(careers, (row) => row.windows);
      const windowsUnderPressure = sumBy(careers, (row) => row.windowsUnderPressure);
      const salesAccepted = sumBy(careers, (row) => row.salesAccepted);
      const pressureSales = sumBy(careers, (row) => row.pressureSales);
      return {
        clubId,
        windowsUnderPressureShare: windows > 0 ? windowsUnderPressure / windows : null,
        thresholdCrossingSalesPer100Sales:
          salesAccepted > 0 ? (pressureSales / salesAccepted) * 100 : null,
        thresholdCrossingSalesPerCareer: pressureSales / careers.length,
      };
    })
    .sort((a, b) => a.clubId.localeCompare(b.clubId));
};

// --------------------------------------------------------------------------
// Section 4: the star-sale dilemma
// --------------------------------------------------------------------------

const KEEP_POLICY = "youngOnlyBuy";
const SELL_POLICY = "youngBuySellStars";

export type StarRow = {
  clubId: string;
  pairedSeeds: number;
  /** Careers, among the paired seeds, where `youngBuySellStars` actually
   * sold one of the manager's own top players. */
  careersWithStarSale: number;
  legacy: PairedDiff;
  cash: PairedDiff;
  /** The same legacy difference, restricted to the careers that actually
   * sold a star - the effect on the careers where the dilemma bit, not
   * diluted by the ones where it never came up. `pairedSeeds` is 0 when no
   * paired career sold a star; the report layer renders that as "no
   * observation", never as the zero `meanDiff` `pairedDiff` returns for an
   * empty sample. */
  legacyWhenSold: PairedDiff;
  titlesKeep: Record<string, number>;
  titlesSell: Record<string, number>;
};

const starSaleKey = (clubId: string, seed: number): string => `${clubId}\0${seed}`;

/**
 * Pairs `youngOnlyBuy` (keep every prospect) against `youngBuySellStars`
 * (sell one when the market offers) by `(clubId, seed)`, over the raw
 * career dump, and reads which of the paired seeds actually closed a star
 * sale from the dilemma dump's `ownStarSalesAccepted`.
 */
export const starDilemma = (
  raw: readonly RawSeedRow[],
  dilemmas: readonly DilemmaRow[]
): StarRow[] => {
  const beforeByClub = groupBy(
    raw.filter((row) => row.polityka === KEEP_POLICY),
    (row) => row.clubId
  );
  const afterByClub = groupBy(
    raw.filter((row) => row.polityka === SELL_POLICY),
    (row) => row.clubId
  );
  const soldKeys = new Set(
    dilemmas
      .filter((row) => row.policyName === SELL_POLICY && row.ownStarSalesAccepted > 0)
      .map((row) => starSaleKey(row.clubId, row.seed))
  );

  const clubIds = [...new Set([...beforeByClub.keys(), ...afterByClub.keys()])].sort();
  return clubIds.map((clubId) => {
    const beforeBySeed = new Map((beforeByClub.get(clubId) ?? []).map((row) => [row.seed, row]));
    const afterBySeed = new Map((afterByClub.get(clubId) ?? []).map((row) => [row.seed, row]));
    const pairedSeeds = [...beforeBySeed.keys()]
      .filter((seed) => afterBySeed.has(seed))
      .sort((a, b) => a - b);
    const soldSeeds = pairedSeeds.filter((seed) => soldKeys.has(starSaleKey(clubId, seed)));

    const beforeOf = (field: "dziedzictwo" | "kasa", seeds: readonly number[]): number[] =>
      seeds.map((seed) => beforeBySeed.get(seed)![field]);
    const afterOf = (field: "dziedzictwo" | "kasa", seeds: readonly number[]): number[] =>
      seeds.map((seed) => afterBySeed.get(seed)![field]);

    return {
      clubId,
      pairedSeeds: pairedSeeds.length,
      careersWithStarSale: soldSeeds.length,
      legacy: pairedDiff(beforeOf("dziedzictwo", pairedSeeds), afterOf("dziedzictwo", pairedSeeds)),
      cash: pairedDiff(beforeOf("kasa", pairedSeeds), afterOf("kasa", pairedSeeds)),
      legacyWhenSold: pairedDiff(
        beforeOf("dziedzictwo", soldSeeds),
        afterOf("dziedzictwo", soldSeeds)
      ),
      titlesKeep: distribution(pairedSeeds.map((seed) => beforeBySeed.get(seed)!.tytul)),
      titlesSell: distribution(pairedSeeds.map((seed) => afterBySeed.get(seed)!.tytul)),
    };
  });
};
