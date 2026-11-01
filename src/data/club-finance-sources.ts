/**
 * What the two Grant Thornton reports for 2024/25 actually print, club by
 * club. Nothing here is corrected, netted or modelled - the corrections live
 * in club-finance-profiles.ts, one file further out.
 *
 * The split exists because the two layers have different failure modes. A
 * wrong number here is a transcription error and is caught by summing the
 * column against the total the report itself publishes; a wrong number there
 * is a judgement about what the game re-earns, and no arithmetic catches it.
 * Keeping them apart is what lets the data test be a real check rather than a
 * restatement of its own input.
 *
 * This table also carries four clubs the game never uses - GKS Tychy, Górnik
 * Łęczna, Znicz Pruszków and Stal Stalowa Wola. They are here on purpose: the
 * first-division total only reproduces on the reported sixteen, so dropping
 * them would quietly turn the strongest available check into a weaker one.
 *
 * Amounts are in whole PLN. The reports print millions to two decimals, so
 * the last four digits of every figure are zeros - that is the source's own
 * granularity, not a claim of złoty-level precision.
 *
 * Evidence, page numbers and the reasoning behind every derived figure:
 * docs/decisions/finance-manifest-sources.md.
 */

export type FinanceReportId = "gt-ekstraklasa-2024-25" | "gt-pierwsza-liga-2024-25";

export type FinanceReport = {
  readonly reportId: FinanceReportId;
  readonly title: string;
  readonly url: string;
  /** Financial year the report covers, not the year it was published. */
  readonly period: string;
  readonly season: string;
  /** Clubs the report covers - not the size of the league it describes. */
  readonly reportedClubs: number;
};

/**
 * Both URLs were confirmed to serve the exact bytes of the local copies in
 * docs/finance/ (gitignored, 14 MB together). The Ekstraklasa report sits
 * under an uploads/2025/09/ path even though the first-division one sits
 * under 2025/10 - it was published a month earlier, and guessing the month
 * from its sibling returns 404.
 */
export const FINANCE_REPORTS: readonly FinanceReport[] = [
  {
    reportId: "gt-ekstraklasa-2024-25",
    title: "Finansowa Ekstraklasa - sezon 2024/2025",
    url: "https://grantthornton.pl/wp-content/uploads/2025/09/Finansowa-Ekstraklasa-sezon-2024-2025-Grant-Thornton.pdf",
    period: "2024-07-01/2025-06-30",
    season: "2024/25",
    reportedClubs: 18,
  },
  {
    reportId: "gt-pierwsza-liga-2024-25",
    title: "Finansowa pierwsza liga - sezon 2024/2025",
    url: "https://grantthornton.pl/wp-content/uploads/2025/10/Fiannsowa-pierwsza-liga-2024-2025-Grant-Thornton.pdf",
    period: "2024-07-01/2025-06-30",
    season: "2024/25",
    // Bruk-Bet Termalica Nieciecza and Kotwica Kołobrzeg withheld their data
    // (report p. 4), so sixteen of the division's eighteen are covered.
    reportedClubs: 16,
  },
];

/**
 * The aggregates each report publishes about itself, used by the data test to
 * prove the per-club column below was transcribed rather than invented.
 *
 * The Ekstraklasa report rounds its own headline to whole millions ("po raz
 * pierwszy przekroczyły miliard, osiągając 1 050 mln zł", p. 12), so the check
 * against it has to allow half a million either way; the first-division report
 * prints two decimals (p. 11) and reproduces exactly.
 */
export const PUBLISHED_REPORT_TOTALS = {
  "gt-ekstraklasa-2024-25": {
    /** Sum of revenue excluding transfers, p. 12. Rounded to whole millions. */
    baseRevenuePln: 1_050_000_000,
    baseRevenueTolerancePln: 500_000,
  },
  "gt-pierwsza-liga-2024-25": {
    /** Sum of revenue including transfers, p. 10 and p. 11. */
    totalRevenuePln: 288_020_000,
    totalRevenueTolerancePln: 20_000,
    /** Transfer revenue, p. 11. */
    transferRevenuePln: 23_010_000,
    transferRevenueTolerancePln: 20_000,
  },
} as const;

export type ReportedClubFinance = {
  readonly clubId: string;
  readonly report: FinanceReportId;
  /** Printed page of the club's own card in that report. */
  readonly page: number;
  readonly totalRevenuePln: number;
  readonly transferRevenuePln: number;
  /**
   * Revenue from the core business, i.e. total minus transfers. Stored rather
   * than derived so a transcription error in either of the other two shows up
   * as a broken identity instead of propagating silently.
   */
  readonly baseRevenuePln: number;
  /** Wage cost over total revenue, as the club card prints it. Can exceed 1. */
  readonly wageToRevenueRatio: number;
  /** Final position in the division the club played that season. */
  readonly leaguePlace: number;
};

/**
 * Ekstraklasa 2024/25. Places are the final table computed from the pinned
 * RSSSF results (scripts/data/ekstraklasa-results.csv), not from the report -
 * the report's own numbering is a revenue ranking and says nothing about
 * where a club finished.
 */
const EKSTRAKLASA_2024_25: readonly ReportedClubFinance[] = [
  {
    clubId: "legia-warszawa",
    report: "gt-ekstraklasa-2024-25",
    page: 44,
    totalRevenuePln: 230_870_000,
    transferRevenuePln: 10_100_000,
    baseRevenuePln: 220_770_000,
    wageToRevenueRatio: 0.48,
    leaguePlace: 5,
  },
  {
    clubId: "lech-poznan",
    report: "gt-ekstraklasa-2024-25",
    page: 46,
    totalRevenuePln: 145_320_000,
    transferRevenuePln: 37_020_000,
    baseRevenuePln: 108_300_000,
    wageToRevenueRatio: 0.52,
    leaguePlace: 1,
  },
  {
    clubId: "rakow-czestochowa",
    report: "gt-ekstraklasa-2024-25",
    page: 48,
    totalRevenuePln: 142_920_000,
    transferRevenuePln: 76_470_000,
    baseRevenuePln: 66_450_000,
    wageToRevenueRatio: 0.5,
    leaguePlace: 2,
  },
  {
    clubId: "jagiellonia-bialystok",
    report: "gt-ekstraklasa-2024-25",
    page: 50,
    totalRevenuePln: 129_170_000,
    transferRevenuePln: 20_160_000,
    baseRevenuePln: 109_010_000,
    wageToRevenueRatio: 0.37,
    leaguePlace: 3,
  },
  {
    clubId: "pogon-szczecin",
    report: "gt-ekstraklasa-2024-25",
    page: 52,
    totalRevenuePln: 78_410_000,
    transferRevenuePln: 4_090_000,
    baseRevenuePln: 74_320_000,
    wageToRevenueRatio: 0.55,
    leaguePlace: 4,
  },
  {
    clubId: "cracovia",
    report: "gt-ekstraklasa-2024-25",
    page: 54,
    totalRevenuePln: 64_300_000,
    transferRevenuePln: 14_930_000,
    baseRevenuePln: 49_370_000,
    wageToRevenueRatio: 0.59,
    leaguePlace: 6,
  },
  {
    clubId: "widzew-lodz",
    report: "gt-ekstraklasa-2024-25",
    page: 56,
    totalRevenuePln: 64_100_000,
    transferRevenuePln: 7_110_000,
    baseRevenuePln: 57_000_000,
    wageToRevenueRatio: 0.47,
    leaguePlace: 13,
  },
  {
    clubId: "slask-wroclaw",
    report: "gt-ekstraklasa-2024-25",
    page: 58,
    totalRevenuePln: 60_420_000,
    transferRevenuePln: 14_060_000,
    baseRevenuePln: 46_360_000,
    wageToRevenueRatio: 0.75,
    leaguePlace: 17,
  },
  {
    clubId: "gornik-zabrze",
    report: "gt-ekstraklasa-2024-25",
    page: 60,
    totalRevenuePln: 57_510_000,
    transferRevenuePln: 12_670_000,
    baseRevenuePln: 44_840_000,
    wageToRevenueRatio: 0.47,
    leaguePlace: 9,
  },
  {
    clubId: "zaglebie-lubin",
    report: "gt-ekstraklasa-2024-25",
    page: 62,
    totalRevenuePln: 48_070_000,
    transferRevenuePln: 2_080_000,
    baseRevenuePln: 45_980_000,
    wageToRevenueRatio: 0.99,
    leaguePlace: 15,
  },
  {
    clubId: "piast-gliwice",
    report: "gt-ekstraklasa-2024-25",
    page: 64,
    totalRevenuePln: 41_890_000,
    transferRevenuePln: 7_270_000,
    baseRevenuePln: 34_610_000,
    wageToRevenueRatio: 0.73,
    leaguePlace: 10,
  },
  {
    clubId: "motor-lublin",
    report: "gt-ekstraklasa-2024-25",
    page: 66,
    totalRevenuePln: 41_350_000,
    transferRevenuePln: 0,
    baseRevenuePln: 41_350_000,
    wageToRevenueRatio: 0.53,
    leaguePlace: 8,
  },
  {
    clubId: "korona-kielce",
    report: "gt-ekstraklasa-2024-25",
    page: 68,
    totalRevenuePln: 33_920_000,
    transferRevenuePln: 6_500_000,
    baseRevenuePln: 27_410_000,
    wageToRevenueRatio: 0.65,
    leaguePlace: 11,
  },
  {
    clubId: "lechia-gdansk",
    report: "gt-ekstraklasa-2024-25",
    page: 70,
    totalRevenuePln: 33_250_000,
    transferRevenuePln: 440_000,
    baseRevenuePln: 32_810_000,
    wageToRevenueRatio: 0.75,
    leaguePlace: 14,
  },
  {
    clubId: "gks-katowice",
    report: "gt-ekstraklasa-2024-25",
    page: 72,
    totalRevenuePln: 30_990_000,
    transferRevenuePln: 250_000,
    baseRevenuePln: 30_740_000,
    wageToRevenueRatio: 0.76,
    leaguePlace: 7,
  },
  {
    clubId: "radomiak-radom",
    report: "gt-ekstraklasa-2024-25",
    page: 74,
    totalRevenuePln: 26_600_000,
    transferRevenuePln: 2_390_000,
    baseRevenuePln: 24_220_000,
    wageToRevenueRatio: 0.93,
    leaguePlace: 12,
  },
  {
    clubId: "stal-mielec",
    report: "gt-ekstraklasa-2024-25",
    page: 76,
    totalRevenuePln: 26_080_000,
    transferRevenuePln: 4_400_000,
    baseRevenuePln: 21_680_000,
    wageToRevenueRatio: 0.51,
    leaguePlace: 16,
  },
  {
    clubId: "puszcza-niepolomice",
    report: "gt-ekstraklasa-2024-25",
    page: 78,
    totalRevenuePln: 15_230_000,
    transferRevenuePln: 0,
    baseRevenuePln: 15_230_000,
    wageToRevenueRatio: 1.25,
    leaguePlace: 18,
  },
];

/**
 * Betclic 1 Liga 2024/25, sixteen of eighteen. Places come from RSSSF via
 * docs/decisions/finance-manifest-sources.md; the report prints them in its
 * own ranking table (p. 9) and the two agree.
 */
const FIRST_DIVISION_2024_25: readonly ReportedClubFinance[] = [
  {
    clubId: "wisla-krakow",
    report: "gt-pierwsza-liga-2024-25",
    page: 36,
    totalRevenuePln: 50_800_000,
    transferRevenuePln: 850_000,
    baseRevenuePln: 49_950_000,
    wageToRevenueRatio: 0.58,
    leaguePlace: 4,
  },
  {
    clubId: "miedz-legnica",
    report: "gt-pierwsza-liga-2024-25",
    page: 38,
    totalRevenuePln: 32_650_000,
    transferRevenuePln: 8_590_000,
    baseRevenuePln: 24_060_000,
    wageToRevenueRatio: 0.62,
    leaguePlace: 5,
  },
  {
    clubId: "stal-rzeszow",
    report: "gt-pierwsza-liga-2024-25",
    page: 40,
    totalRevenuePln: 26_520_000,
    transferRevenuePln: 680_000,
    baseRevenuePln: 25_840_000,
    wageToRevenueRatio: 0.37,
    leaguePlace: 12,
  },
  {
    clubId: "lks-lodz",
    report: "gt-pierwsza-liga-2024-25",
    page: 42,
    totalRevenuePln: 25_550_000,
    transferRevenuePln: 3_160_000,
    baseRevenuePln: 22_390_000,
    wageToRevenueRatio: 0.68,
    leaguePlace: 11,
  },
  {
    clubId: "ruch-chorzow",
    report: "gt-pierwsza-liga-2024-25",
    page: 44,
    totalRevenuePln: 25_110_000,
    transferRevenuePln: 1_550_000,
    baseRevenuePln: 23_560_000,
    wageToRevenueRatio: 0.65,
    leaguePlace: 10,
  },
  {
    clubId: "arka-gdynia",
    report: "gt-pierwsza-liga-2024-25",
    page: 46,
    totalRevenuePln: 19_390_000,
    transferRevenuePln: 5_140_000,
    baseRevenuePln: 14_260_000,
    wageToRevenueRatio: 0.83,
    leaguePlace: 1,
  },
  {
    clubId: "wisla-plock",
    report: "gt-pierwsza-liga-2024-25",
    page: 48,
    totalRevenuePln: 15_340_000,
    transferRevenuePln: 590_000,
    baseRevenuePln: 14_750_000,
    wageToRevenueRatio: 0.97,
    leaguePlace: 3,
  },
  {
    clubId: "gks-tychy",
    report: "gt-pierwsza-liga-2024-25",
    page: 50,
    totalRevenuePln: 13_910_000,
    transferRevenuePln: 180_000,
    baseRevenuePln: 13_730_000,
    wageToRevenueRatio: 0.95,
    leaguePlace: 7,
  },
  {
    clubId: "odra-opole",
    report: "gt-pierwsza-liga-2024-25",
    page: 52,
    totalRevenuePln: 13_900_000,
    transferRevenuePln: 90_000,
    baseRevenuePln: 13_810_000,
    wageToRevenueRatio: 0.63,
    leaguePlace: 14,
  },
  {
    clubId: "warta-poznan",
    report: "gt-pierwsza-liga-2024-25",
    page: 54,
    totalRevenuePln: 13_580_000,
    transferRevenuePln: 310_000,
    baseRevenuePln: 13_270_000,
    wageToRevenueRatio: 0.66,
    leaguePlace: 17,
  },
  {
    clubId: "gornik-leczna",
    report: "gt-pierwsza-liga-2024-25",
    page: 56,
    totalRevenuePln: 10_760_000,
    transferRevenuePln: 290_000,
    baseRevenuePln: 10_480_000,
    wageToRevenueRatio: 0.83,
    leaguePlace: 9,
  },
  {
    clubId: "polonia-warszawa",
    report: "gt-pierwsza-liga-2024-25",
    page: 58,
    totalRevenuePln: 10_510_000,
    transferRevenuePln: 790_000,
    baseRevenuePln: 9_720_000,
    wageToRevenueRatio: 1.29,
    leaguePlace: 6,
  },
  {
    clubId: "chrobry-glogow",
    report: "gt-pierwsza-liga-2024-25",
    page: 60,
    totalRevenuePln: 10_270_000,
    transferRevenuePln: 410_000,
    baseRevenuePln: 9_860_000,
    wageToRevenueRatio: 0.84,
    leaguePlace: 13,
  },
  {
    clubId: "pogon-siedlce",
    report: "gt-pierwsza-liga-2024-25",
    page: 62,
    totalRevenuePln: 10_090_000,
    transferRevenuePln: 70_000,
    baseRevenuePln: 10_020_000,
    wageToRevenueRatio: 0.71,
    leaguePlace: 15,
  },
  {
    clubId: "znicz-pruszkow",
    report: "gt-pierwsza-liga-2024-25",
    page: 64,
    totalRevenuePln: 4_970_000,
    transferRevenuePln: 120_000,
    baseRevenuePln: 4_860_000,
    wageToRevenueRatio: 0.9,
    leaguePlace: 8,
  },
  {
    clubId: "stal-stalowa-wola",
    report: "gt-pierwsza-liga-2024-25",
    page: 66,
    totalRevenuePln: 4_660_000,
    transferRevenuePln: 190_000,
    baseRevenuePln: 4_470_000,
    wageToRevenueRatio: 1.23,
    leaguePlace: 18,
  },
];

export const REPORTED_CLUB_FINANCES: readonly ReportedClubFinance[] = [
  ...EKSTRAKLASA_2024_25,
  ...FIRST_DIVISION_2024_25,
];

export const reportedFinanceFor = (clubId: string): ReportedClubFinance | null =>
  REPORTED_CLUB_FINANCES.find((row) => row.clubId === clubId) ?? null;
