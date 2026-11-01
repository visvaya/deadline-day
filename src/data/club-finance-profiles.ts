import { CLUBS } from "./clubs";
import {
  FINANCE_REPORTS,
  REPORTED_CLUB_FINANCES,
  type FinanceReportId,
  type ReportedClubFinance,
} from "./club-finance-sources";
import { FIRST_DIVISION } from "./first-division";

/**
 * The finance manifest of the spec's chapter 2: one record per club the game
 * can name, carrying both the reported figures and the corrections that turn
 * them into a base the game may re-earn every season.
 *
 * The whole point of the file is that `recurringRevenuePln` is NOT the club's
 * revenue. Reported revenue already contains the transfer fees, the European
 * campaign and the league's placement money, and the game pays all three of
 * those out again by its own rules. Leaving them in would pay every club
 * twice, hardest the ones that had the best season.
 *
 * Nothing here is fitted to make the game balance. Fitting happens one layer
 * out, against this manifest; a number changed here to move a simulation
 * result would be a measurement corrupted to match its own prediction.
 *
 * Sources, page numbers, cross-checks and the uncertainty on every estimated
 * figure: docs/decisions/finance-manifest-sources.md.
 */

export type FinanceProvenance = "reported" | "official-statement" | "estimated";

/**
 * The tier the club played in during the SOURCE season, which for eight clubs
 * is not the tier it plays in the game.
 *
 * This field exists because `sourceLeaguePlace` alone is ambiguous and would
 * silently lie: place 1 means "champion of the second division" for Polonia
 * Bytom and "champion of the first division" for Arka Gdynia. Any consumer
 * comparing places across records has to compare tiers first. The spec's
 * interface lists the minimum a record must carry, so adding a field is
 * within it - but nothing may read `sourceLeaguePlace` without this one.
 *
 * "outside-reported-league" covers a club whose source is a filing rather
 * than a league finish; those records carry place 0 and never subtract
 * placement money.
 */
export type ClubSourceTier =
  | "ekstraklasa"
  | "first-division"
  | "second-division"
  | "third-division"
  | "outside-reported-league";

export type ClubFinanceProfile = {
  readonly clubId: string;
  readonly totalRevenuePln: number;
  readonly transferRevenuePln: number;
  readonly europeanRevenuePln: number;
  readonly oneOffRevenuePln: number;
  readonly leaguePrizeRevenuePln: number;
  readonly recurringRevenuePln: number;
  readonly wageToRevenueRatio: number;
  /**
   * Documented backing, expressed as a percentile of the league's own share
   * budgets. The backer is whoever actually funds the club beyond its
   * revenue - an owner at one club, a title sponsor at the next - which is
   * why the field is not named after the owner.
   *
   * It is a ONE-OFF FLOOR under the opening window, never an annual top-up
   * and never a component of revenue. The club is lifted to it on day one if
   * its other budget components fall short, and that is the whole of its
   * effect: no later season reads this field.
   */
  readonly backerBudgetPercentile?: number;
  readonly provenance: FinanceProvenance;
  readonly sourceSeason: string;
  readonly sourceTier: ClubSourceTier;
  readonly sourceLeaguePlace: number;
  readonly sourceUrl: string;
  readonly note?: string;
};

/**
 * The part of the Ekstraklasa central payout that the game re-earns with its
 * own placement ladder, and therefore the only part that gets subtracted.
 *
 * 18.5% of the rounded 298 mln PLN paid out for 2024/25. The league splits its
 * "sporting result" three ways - 18.5% for the table position, 14% for the
 * four clubs that reached Europe, 1% solidarity for the relegated - and the
 * game reproduces only the first. Subtracting all 33.5% would take money off
 * clubs that nothing ever gives back.
 *
 * The ladder's shape is confirmed independently of its size: the weights
 * below produce a 303k PLN step between adjacent places on the preliminary
 * 280 mln pool, and a club publication from June 2025 prints exactly that
 * step. Two quantities, two sources, agreeing.
 */
export const LEAGUE_MERIT_POOL_PLN = 55_130_000;

/** 18 + 17 + ... + 1. Normalising is required, not cosmetic: the raw weights
 * do not preserve the pool and would hand more money to the bottom of the
 * table. Same linear shape as `leaguePositionPrize`, so the history removed
 * and the mechanic added match. */
export const MERIT_WEIGHT_SUM = 171;

/** Placement money the club actually received in the source season. Zero
 * outside the Ekstraklasa: the first division's 27 mln PLN central package was
 * split equally regardless of position, and the tiers below it have no
 * placement component at all. */
export const leaguePrizeRevenuePln = (tier: ClubSourceTier, place: number): number =>
  tier === "ekstraklasa"
    ? Math.round((LEAGUE_MERIT_POOL_PLN * (19 - place)) / MERIT_WEIGHT_SUM)
    : 0;

type ProfileDraft = Omit<ClubFinanceProfile, "leaguePrizeRevenuePln" | "recurringRevenuePln">;

const withDerived = (draft: ProfileDraft): ClubFinanceProfile => {
  const leaguePrize = leaguePrizeRevenuePln(draft.sourceTier, draft.sourceLeaguePlace);
  return {
    ...draft,
    leaguePrizeRevenuePln: leaguePrize,
    recurringRevenuePln:
      draft.totalRevenuePln -
      draft.transferRevenuePln -
      draft.europeanRevenuePln -
      draft.oneOffRevenuePln -
      leaguePrize,
  };
};

const urlFor = (reportId: FinanceReportId): string => {
  const report = FINANCE_REPORTS.find((r) => r.reportId === reportId);
  if (!report) throw new Error(`Unknown finance report: ${reportId}`);
  return report.url;
};

const tierFor = (reportId: FinanceReportId): ClubSourceTier =>
  reportId === "gt-ekstraklasa-2024-25" ? "ekstraklasa" : "first-division";

/**
 * What has to come off a reported club's revenue beyond its transfer line.
 *
 * Only four clubs have one, and all four are European. The report leaves
 * everything else in categories the game re-earns nothing from.
 */
type FinanceCorrection = {
  readonly europeanRevenuePln?: number;
  readonly oneOffRevenuePln?: number;
  readonly provenance?: FinanceProvenance;
  readonly note?: string;
};

const CORRECTIONS: Readonly<Record<string, FinanceCorrection>> = {
  "legia-warszawa": {
    europeanRevenuePln: 69_000_000,
    note:
      "European income ~50 mln from UEFA inside centralised rights plus ~19 mln " +
      "of tickets for European ties, both stated on report p. 11. Cross-check: " +
      "the UEFA financial report's 10.837 mln EUR covers the league phase only, " +
      "and the gap to 50 mln is the size of the qualifying fees it excludes.",
  },
  "jagiellonia-bialystok": {
    europeanRevenuePln: 51_000_000,
    note:
      "Report p. 11 states the European total directly ('blisko 51 mln zł'), of " +
      "which ~44 mln from UEFA sits in centralised rights; the ~7 mln remainder " +
      "is European matchday. Cross-check from attendance: 144,882 non-league " +
      "spectators at 43-51 PLN a head is 6.2-7.4 mln.",
  },
  "slask-wroclaw": {
    europeanRevenuePln: 7_700_000,
    provenance: "estimated",
    note:
      "5.7 mln of UECL qualifying money (p. 58) plus ~2.0 mln of European " +
      "matchday, the latter a residual from the 28 mln aggregate on p. 12 once " +
      "Legia's 19 and Jagiellonia's 7 are removed. That residual absorbs all the " +
      "rounding of three approximate figures; an independent per-spectator check " +
      "puts it at 1.1-2.0 mln. The 5.7 mln is the booked amount and supersedes " +
      "the 3.87 mln the UEFA circular's rates would imply.",
  },
  "wisla-krakow": {
    europeanRevenuePln: 5_300_000,
    provenance: "estimated",
    note:
      "5.3 mln of UEFA money, which the first-division report classifies INSIDE " +
      "matchday (p. 9) rather than in centralised rights - so 'matchday minus " +
      "Europe' must not be applied to this club, it would remove the same money " +
      "twice. European ticket income is not disclosed and is bounded by the " +
      "1.3 mln of non-UEFA matchday growth, so the true figure is 5.3-6.6 mln.",
  },
};

/**
 * The three clubs whose backing is documented well enough to put a floor
 * under their first window, decided 2026-09-12.
 *
 * LITERALS, not imports. `balance.ts` already imports this module for the
 * merit pool, so importing its percentiles back here would close a cycle -
 * and a cycle in ESM is an `undefined` at module-initialisation time rather
 * than an error. `tests/data/club-finance-profiles.test.ts` compares these
 * numbers against `STRONG_BACKER_PERCENTILE` and `ACTIVE_BACKER_PERCENTILE`
 * instead, which catches a drift without creating the cycle.
 *
 * Motor Lublin is deliberately absent. Its owner publicly rejected permanent
 * funding in 2026, so the absence of a floor is part of the hypothesis rather
 * than a gap in it - and "no evidence" is not the same fact as "restrained",
 * which is why neither gets a number.
 *
 * Widzew's floor exists and does NOT bind: the cost of upgrading its already
 * strong squad is higher. That is intended - the money there has already been
 * spent on players, and the floor is not a second grant on top of it.
 */
const BACKER_PERCENTILES: Readonly<Record<string, number>> = {
  // Robert Dobrzycki's money, already turned into an expensive squad.
  "widzew-lodz": 0.95,
  // Formally the main SPONSOR rather than the owner: the sole shareholder is
  // the sports club. Money without the structures around it.
  "wieczysta-krakow": 0.95,
  // Korona 4ever's documented recapitalisation: moderate and already
  // delivered, so the active level rather than the strong one.
  "korona-kielce": 0.8,
};

const fromReport = (row: ReportedClubFinance): ClubFinanceProfile => {
  const correction = CORRECTIONS[row.clubId] ?? {};
  return withDerived({
    clubId: row.clubId,
    backerBudgetPercentile: BACKER_PERCENTILES[row.clubId],
    totalRevenuePln: row.totalRevenuePln,
    transferRevenuePln: row.transferRevenuePln,
    europeanRevenuePln: correction.europeanRevenuePln ?? 0,
    oneOffRevenuePln: correction.oneOffRevenuePln ?? 0,
    wageToRevenueRatio: row.wageToRevenueRatio,
    provenance: correction.provenance ?? "reported",
    sourceSeason: "2024/25",
    sourceTier: tierFor(row.report),
    sourceLeaguePlace: row.leaguePlace,
    sourceUrl: urlFor(row.report),
    note: correction.note,
  });
};

/**
 * The six clubs no league report covers, in descending order of how much the
 * record rests on a document rather than on a judgement.
 *
 * Every one of them is `estimated` or `official-statement`, and none may be
 * used to fit the wage curve: the wage ratios below are design assumptions or
 * league medians, and feeding them into a fit would let the model learn from
 * its own guesses.
 */
const CONSTRUCTED: readonly ProfileDraft[] = [
  {
    clubId: "podbeskidzie-bielsko-biala",
    totalRevenuePln: 10_852_746,
    transferRevenuePln: 0,
    europeanRevenuePln: 0,
    oneOffRevenuePln: 651_309,
    wageToRevenueRatio: 0.67,
    provenance: "official-statement",
    sourceSeason: "2024/25",
    sourceTier: "second-division",
    sourceLeaguePlace: 7,
    sourceUrl: "https://tspodbeskidzie.pl/static/upload/store/Sprawozdania2025/SF_TSP_06_2025.pdf",
    note:
      "Own filing for 1.07.2024-30.06.2025, verified visually. Total is sales " +
      "4,064,239 plus other operating income 6,775,070 (of which 5,998,145 is " +
      "public subsidy) plus financial income 13,437. The one-off line is the " +
      "495,630 revaluation of non-financial assets plus the 155,679 gain on " +
      "their disposal - neither repeats, and the disposal gain is not proven to " +
      "be transfer income, so it is removed here rather than mislabelled there. " +
      "Transfer income is not broken out: any gross fees hidden inside sales " +
      "would inflate the recurring base. Wage ratio is salaries plus social " +
      "contributions over total revenue, for the company rather than the squad.",
  },
  {
    clubId: "wieczysta-krakow",
    totalRevenuePln: 37_960_000,
    transferRevenuePln: 0,
    europeanRevenuePln: 0,
    oneOffRevenuePln: 19_960_000,
    wageToRevenueRatio: 0.95,
    backerBudgetPercentile: BACKER_PERCENTILES["wieczysta-krakow"],
    provenance: "estimated",
    sourceSeason: "2025",
    sourceTier: "outside-reported-league",
    sourceLeaguePlace: 0,
    sourceUrl: "https://www.kswieczysta.com/storage/uploaded/sprawozdanie_2025.pdf",
    note:
      "The filing shows 37.96 mln of statutory-activity income for a CALENDAR " +
      "year, categorised unlike a league report and without separating squad " +
      "wages from owner funding. The spec fixes the recurring base at 18.00 mln, " +
      "the reported first division's average. The 19.96 mln difference is a " +
      "MODEL CORRECTION, not a booked one-off: the filing shows no such " +
      "transaction, and calling it an owner payment would invent one. Owner " +
      "support reaches the game as a starting budget at the 80th percentile, " +
      "never as a hidden yearly injection. The 95% wage ratio is a design " +
      "assumption too - the filing does not support it either way.",
  },
  {
    clubId: "lks-nieciecza",
    totalRevenuePln: 14_270_000,
    transferRevenuePln: 500_000,
    europeanRevenuePln: 0,
    oneOffRevenuePln: 0,
    wageToRevenueRatio: 0.77,
    provenance: "estimated",
    sourceSeason: "2024/25",
    sourceTier: "first-division",
    sourceLeaguePlace: 2,
    sourceUrl: urlFor("gt-pierwsza-liga-2024-25"),
    note:
      "Played the reported division but withheld its data. The place-based " +
      "fallback curve the spec describes was fitted and REJECTED: across the " +
      "sixteen reported clubs, position explains 12.6% of the variance in base " +
      "revenue (Spearman -0.40), and the 95% prediction interval for place 2 " +
      "runs from -0.6 to 45.5 mln - it contains impossible values and is wider " +
      "than the league. With no usable conditional predictor the honest estimate " +
      "is the unconditional one: the division's median base revenue of 13.77 mln " +
      "plus its median transfer line of 0.50 mln. Band: the interquartile range, " +
      "10.27-25.11 mln total. The champion Arka earned 14.26 mln of base revenue " +
      "and twelfth-placed Stal Rzeszów 25.84, which is why the curve fails.",
  },
  {
    clubId: "polonia-bytom",
    totalRevenuePln: 9_000_000,
    transferRevenuePln: 0,
    europeanRevenuePln: 0,
    oneOffRevenuePln: 0,
    wageToRevenueRatio: 0.65,
    provenance: "estimated",
    sourceSeason: "2024/25",
    sourceTier: "second-division",
    sourceLeaguePlace: 1,
    sourceUrl: urlFor("gt-pierwsza-liga-2024-25"),
    note:
      "No verified filing. Placed ORDINALLY between two measured anchors, not " +
      "fitted to a curve: Podbeskidzie's 10.85 mln in the same tier and season " +
      "(upper end of that band - 6.00 mln of it is subsidy) above, and the " +
      "reported first division's floor of 4.66 mln below. Just under " +
      "Podbeskidzie on a 155k city, high attendance and a strong brand, without " +
      "a subsidy of that size. Band 6-11 mln, which stays below the first " +
      "division's median across its whole width. The zeros are parts of a " +
      "constructed record, not missing figures replaced by zero.",
  },
  {
    clubId: "pogon-grodzisk-mazowiecki",
    totalRevenuePln: 5_000_000,
    transferRevenuePln: 0,
    europeanRevenuePln: 0,
    oneOffRevenuePln: 0,
    wageToRevenueRatio: 0.65,
    provenance: "estimated",
    sourceSeason: "2024/25",
    sourceTier: "second-division",
    sourceLeaguePlace: 2,
    sourceUrl: urlFor("gt-pierwsza-liga-2024-25"),
    note:
      "No verified filing; the club president's May 2025 remarks are a budget " +
      "forecast, not reported revenue, and are deliberately unused. Placed at " +
      "the reported first division's floor: a 32k town with no municipal base " +
      "comparable to Podbeskidzie's. Band 3.5-7 mln, inside the bottom quartile " +
      "across its whole width. Zeros are constructed, not missing.",
  },
  {
    clubId: "unia-skierniewice",
    totalRevenuePln: 2_500_000,
    transferRevenuePln: 0,
    europeanRevenuePln: 0,
    oneOffRevenuePln: 0,
    wageToRevenueRatio: 0.65,
    provenance: "estimated",
    sourceSeason: "2024/25",
    sourceTier: "third-division",
    sourceLeaguePlace: 1,
    sourceUrl: urlFor("gt-pierwsza-liga-2024-25"),
    note:
      "No verified filing. One tier below the other two estimates, at roughly " +
      "half of Pogoń Grodzisk. Band 1.5-4 mln, below the reported first " +
      "division's floor across its whole width. Zeros are constructed, not " +
      "missing.",
  },
];

/**
 * Every club the game can name, in the order the pools list them: the eighteen
 * a career starts at, then the eighteen that can be promoted into it.
 *
 * A club with neither a report row nor a constructed record throws at module
 * load rather than resolving to nothing. That is the point: a buyer on a
 * SPRZEDAZ card can be any of the thirty-six, so a manifest with a hole in it
 * is a crash waiting for the right seed, and it should be a crash now.
 */
const GAME_CLUB_IDS: readonly string[] = [
  ...CLUBS.map((club) => club.clubId),
  ...FIRST_DIVISION.map((club) => club.clubId),
];

const buildProfile = (clubId: string): ClubFinanceProfile => {
  const constructed = CONSTRUCTED.find((draft) => draft.clubId === clubId);
  if (constructed) return withDerived(constructed);
  const reported = REPORTED_CLUB_FINANCES.find((row) => row.clubId === clubId);
  if (reported) return fromReport(reported);
  throw new Error(`No finance profile for club ${clubId}`);
};

export const CLUB_FINANCE_PROFILES: readonly ClubFinanceProfile[] = GAME_CLUB_IDS.map(buildProfile);

export const financeProfileFor = (clubId: string): ClubFinanceProfile => {
  const profile = CLUB_FINANCE_PROFILES.find((p) => p.clubId === clubId);
  if (!profile) throw new Error(`No finance profile for club ${clubId}`);
  return profile;
};
