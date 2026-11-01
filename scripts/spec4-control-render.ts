import { OWN_STAR_RANK } from "../src/logic/simulate-policies";
import {
  FIRST_WINDOW_MEDIAN_GATE,
  FIRST_WINDOW_SHARE_GATE,
  type FirstWindowRow,
  type PressureRow,
  type ShareRow,
  type StarRow,
} from "./spec4-control-dilemmas-core";
import type { FreeAgentCostRow, QuartileRow, ReinvestmentRow } from "./spec4-control-finance-core";
import { distinctSorted } from "./spec4-control-inputs";

/**
 * Markdown rendering for the spec 4 control report, split out of
 * spec4-control-report.ts (the CLI) so the seven sections stay under the
 * file-size guideline and the rendering itself is unit-testable without
 * going through argv parsing or file reads.
 */

export type Report = {
  reportSchemaVersion: number;
  measurementMode: "full" | "smoke";
  firstWindow: readonly FirstWindowRow[];
  affordableShare: readonly ShareRow[];
  pressure: readonly PressureRow[];
  stars: readonly StarRow[];
  freeAgents: readonly FreeAgentCostRow[];
  reinvestment: readonly ReinvestmentRow[];
  quartiles: readonly QuartileRow[];
};

const ANCHORS: readonly string[] = [
  "legia-warszawa",
  "zaglebie-lubin",
  "wisla-krakow",
  "wieczysta-krakow",
];

export const pl = (value: number | null, digits = 2): string =>
  value === null ? "brak obserwacji" : value.toFixed(digits).replace(".", ",");
export const pct = (value: number | null, digits = 1): string =>
  value === null ? "brak obserwacji" : `${pl(value * 100, digits)}%`;
const yesNo = (value: boolean): string => (value ? "spełnione" : "niespełnione");

/** Anchors first, in their own fixed order, then the rest alphabetically -
 * the ordering the report's own tables must follow. Rows without an anchor
 * key of their own (a policy-keyed row, say) simply sort into the rest. */
const byAnchor = <T>(rows: readonly T[], key: (_row: T) => string): T[] => {
  const anchorSet = new Set(ANCHORS);
  const anchorRows = ANCHORS.map((id) => rows.find((row) => key(row) === id)).filter(
    (row): row is T => row !== undefined
  );
  const rest = [...rows]
    .filter((row) => !anchorSet.has(key(row)))
    .sort((a, b) => key(a).localeCompare(key(b)));
  return [...anchorRows, ...rest];
};

const table = (headers: readonly string[], rows: readonly (readonly string[])[]): string =>
  [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

const section = (
  title: string,
  note: string | null,
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): string => [`## ${title}`, "", ...(note ? [note, ""] : []), table(headers, rows)].join("\n");

// --------------------------------------------------------------------------
// Section 1: first-window gate
// --------------------------------------------------------------------------

const renderFirstWindowSection = (rows: readonly FirstWindowRow[]): string =>
  section(
    "1. Bramka pierwszego okna (punkt przed spekiem 5)",
    `Progi: udział okien z użyteczną i tanią ofertą KUPNO >= ${pl(FIRST_WINDOW_SHARE_GATE)}; mediana użytecznych i tanich ofert w przedziale [${FIRST_WINDOW_MEDIAN_GATE[0]}, ${FIRST_WINDOW_MEDIAN_GATE[1]}]. Kolumna z targowaniem jest górną granicą osiągalności (targowanie może się nie udać); karty na cenowym limicie kosztują zaokr(kasa x PURCHASE_PRICE_CAP, 2) > kasa i są osiągalne wyłącznie przez targowanie.`,
    [
      "clubId",
      "okna",
      "udział spełnionych",
      "udział z targowaniem",
      "mediana",
      "brak celu",
      "brak ceny",
      "brak ceny, osiągalne targowaniem",
      "bramka udziału",
      "bramka mediany",
    ],
    byAnchor(rows, (row) => row.clubId).map((row) => [
      row.clubId,
      String(row.windows),
      pct(row.shareWithUseful),
      pct(row.shareWithUsefulHaggle),
      pl(row.medianUsefulAffordable),
      String(row.failedOnTargeting),
      String(row.failedOnPrice),
      String(row.failedOnPriceButHaggleReachable),
      yesNo(row.passesShare),
      yesNo(row.passesMedian),
    ])
  );

// --------------------------------------------------------------------------
// Section 2: affordable-strengthening share
// --------------------------------------------------------------------------

const SHARE_HEADERS: readonly string[] = [
  "klucz",
  "karty zewnętrzne",
  "udział użytecznych i tanich",
  "na limicie / zewnętrzne",
  "na limicie / płatne",
];

const shareTableRow = (row: ShareRow): readonly string[] => [
  row.key,
  String(row.externalCards),
  pct(row.share),
  pct(row.atPriceCapShareOfExternal),
  pct(row.atPriceCapShareOfPaidCards),
];

const renderAffordableShareSection = (rows: readonly ShareRow[]): string => {
  const clubRows = byAnchor(
    rows.filter((row) => row.dimension === "club"),
    (row) => row.key
  );
  const policyRows = rows.filter((row) => row.dimension === "policy");
  return [
    "## 2. Udział ofert zewnętrznych w cenowym zasięgu (obserwacja bez progu)",
    "",
    "### Kluby",
    "",
    table(SHARE_HEADERS, clubRows.map(shareTableRow)),
    "",
    "### Polityki",
    "",
    table(SHARE_HEADERS, policyRows.map(shareTableRow)),
  ].join("\n");
};

// --------------------------------------------------------------------------
// Section 3: financial pressure
// --------------------------------------------------------------------------

const renderPressureSection = (rows: readonly PressureRow[]): string =>
  section(
    "3. Presja finansowa: przekroczenie stałego progu zakupu (obserwacja bez progu)",
    "Wskaźnik zastępczy dla dylematu (ii) z par. 12.2: liczy przekroczenia stałego progu zakupu, nie odpowiada, czy sprzedaż była konieczna.",
    [
      "clubId",
      "udział okien pod presją",
      "przekroczenia / 100 sprzedaży",
      "przekroczenia / karierę",
    ],
    byAnchor(rows, (row) => row.clubId).map((row) => [
      row.clubId,
      pct(row.windowsUnderPressureShare),
      row.thresholdCrossingSalesPer100Sales === null
        ? "brak obserwacji"
        : pl(row.thresholdCrossingSalesPer100Sales, 1),
      pl(row.thresholdCrossingSalesPerCareer, 2),
    ])
  );

// --------------------------------------------------------------------------
// Section 4: the star-sale dilemma
// --------------------------------------------------------------------------

const renderStarSection = (rows: readonly StarRow[]): string =>
  section(
    "4. Dylemat sprzedaży gwiazdy (obserwacja bez progu)",
    `Założenie pomiaru: gwiazda = własny transfer (moj) w pierwszej trójce kadry wg bySquadPriority, OWN_STAR_RANK = ${OWN_STAR_RANK}.`,
    [
      "clubId",
      "sparowane ziarna",
      "kariery ze sprzedażą",
      "dziedzictwo delta",
      "dziedzictwo delta (sprzedano)",
      "kasa delta",
    ],
    byAnchor(rows, (row) => row.clubId).map((row) => [
      row.clubId,
      String(row.pairedSeeds),
      String(row.careersWithStarSale),
      `${pl(row.legacy.meanDiff)} +/- ${pl(row.legacy.standardError)}`,
      row.legacyWhenSold.pairedSeeds === 0
        ? "brak obserwacji"
        : `${pl(row.legacyWhenSold.meanDiff)} +/- ${pl(row.legacyWhenSold.standardError)}`,
      `${pl(row.cash.meanDiff)} +/- ${pl(row.cash.standardError)}`,
    ])
  );

// --------------------------------------------------------------------------
// Section 5: free-agent wage cost
// --------------------------------------------------------------------------

const renderFreeAgentSection = (rows: readonly FreeAgentCostRow[]): string =>
  section(
    "5. Koszt płacowy wolnych agentów (obserwacja bez progu)",
    "Nadpłata w stałym horyzoncie dwóch lat i stosunek 0,40-0,60 liczy pnpm audit:finance-activation; poniżej diagnostyka dodatkowa.",
    [
      "polityka",
      "podpisania",
      "mediana rocznej płacy",
      "udział w przychodzie klubu",
      "mediana kosztu do rozliczenia",
      "mediana sezonów na liście płac",
    ],
    rows.map((row) => [
      row.policyName,
      String(row.signings),
      pl(row.medianAnnualWage),
      pct(row.medianAnnualWageShareOfRecurringRevenue),
      pl(row.medianWageCostToHandover),
      pl(row.medianSeasonsOnPayroll),
    ])
  );

// --------------------------------------------------------------------------
// Section 6: reinvestment
// --------------------------------------------------------------------------

const renderReinvestmentSection = (rows: readonly ReinvestmentRow[]): string =>
  section(
    "6. Wynik surowy kontra zmiana budżetu (obserwacja bez progu)",
    null,
    ["clubId", "mediana sumy wyniku surowego", "mediana zmiany budżetu", "mediana reszty stopy"],
    byAnchor(rows, (row) => row.clubId).map((row) => [
      row.clubId,
      pl(row.medianRawResultSum),
      pl(row.medianBudgetChange),
      pl(row.medianRateResidual),
    ])
  );

// --------------------------------------------------------------------------
// Section 7: titles by advantage quartile
// --------------------------------------------------------------------------

const renderQuartileSection = (groups: readonly QuartileRow[]): string => {
  const titleKeys = distinctSorted(groups.flatMap((group) => Object.keys(group.titles)));
  const shareHeaders = titleKeys.map((title) => `${title} %`);
  return section(
    "7. Tytuły wg kwartyla advantageScore (obserwacja bez progu)",
    "Rozkład jest pulą wszystkich 15 polityk naraz, nie osobnym pomiarem na politykę; grupy Q1-Q2 i Q3-Q4 mają różną liczbę klubów, więc porównywać należy udziały, nie surowe liczby.",
    ["grupa", "kluby", "kariery", ...titleKeys, ...shareHeaders],
    groups.map((group) => [
      group.label,
      group.clubIds.join(", "),
      String(group.careers),
      ...titleKeys.map((title) => String(group.titles[title] ?? 0)),
      ...titleKeys.map((title) =>
        group.careers === 0 ? "brak obserwacji" : pct(group.titleShares[title] ?? 0)
      ),
    ])
  );
};

// --------------------------------------------------------------------------
// Whole report
// --------------------------------------------------------------------------

export const renderReport = (report: Report): string => {
  const modeNote = report.measurementMode === "smoke" ? " (tryb dymu: measurementMode: smoke)" : "";

  return [
    `# Pomiar kontrolny speka 4${modeNote}`,
    renderFirstWindowSection(report.firstWindow),
    renderAffordableShareSection(report.affordableShare),
    renderPressureSection(report.pressure),
    renderStarSection(report.stars),
    renderFreeAgentSection(report.freeAgents),
    renderReinvestmentSection(report.reinvestment),
    renderQuartileSection(report.quartiles),
  ].join("\n\n");
};
