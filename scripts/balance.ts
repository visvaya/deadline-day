import { writeFileSync } from "node:fs";

import type { GameState, Offer } from "../src/data/types";
import { clubById } from "../src/data/clubs";
import { buildCareerBaseline } from "../src/logic/career-baseline";
import type { IncomeMode } from "../src/logic/income-mode";
import { simulateGame } from "../src/logic/simulate";
import {
  DUMP_COLUMNS,
  DUMP_SCHEMA_VERSION,
  SEASON_COLUMNS,
  aggregateCell,
  extractFinanceSeasons,
  extractMetrics,
  extractSales,
  extractSignings,
  pairBySeed,
} from "./balance-metrics";
import type {
  CellAggregate,
  FinanceSeasonObservation,
  GameMetrics,
  SaleObservation,
  SigningObservation,
} from "./balance-metrics";
import { DILEMMA_COLUMNS, extractDilemmaCareer, observeCard } from "./dilemma-observations";
import type { DilemmaCareer, ObservedCard } from "./dilemma-observations";
import { AGE_DILEMMAS, POLICIES, parseBalanceCli } from "./balance-cli";
import { createSettlementRecorder } from "./signing-wage-cost";
import { formatProgress } from "./balance-progress";
import { formatCsvRow } from "./csv";
import {
  renderAgeDilemmaTable,
  renderBreakdownTable,
  renderErrorSummary,
  renderFooter,
  renderRiskTable,
  renderSummaryTable,
  renderTytulTable,
  renderVsPassTable,
  renderWerdyktTable,
  scopeKey,
} from "./balance-report";
import { seedSeries } from "./seed-series";
import type {
  AgeDilemmaRow,
  CellScope,
  PolicyVsPassRow,
  RunError,
  RunInfo,
  TableFormat,
} from "./balance-report";

/**
 * The matrix the simulator runs. A cell is one club - `--clubs` is the only
 * dimension left - crossed with one policy. Everything downstream - the
 * dump, the aggregates, the paired comparisons, the error list - is keyed on
 * the cell, because eighteen clubs would otherwise overwrite one another
 * without a word if they were not.
 */
type Cell = CellScope & { policyName: string };

const SIGNING_COLUMNS = [
  "clubShortName",
  "policyName",
  "seed",
  "decisionIndex",
  "season",
  "offerType",
  "playerId",
  "position",
  "age",
  "ovr",
  "fee",
  "annualWage",
  "baseAnnualWage",
  "payrollDelta",
  "seasonsOnPayroll",
  "wageCostToHandover",
];

const SALES_COLUMNS = [
  "clubId",
  "policyName",
  "seed",
  "decisionIndex",
  "season",
  "offerPrice",
  "realisedFee",
  "buyerOrigin",
  "buyerClubId",
];

const runCell = (
  cell: Cell,
  seeds: readonly number[],
  financeControl: boolean,
  errors: RunError[],
  signings: SigningObservation[] | null,
  seasons: FinanceSeasonObservation[] | null,
  sales: SaleObservation[] | null,
  dilemmas: DilemmaCareer[] | null,
  incomeMode: string
): GameMetrics[] => {
  const policy = POLICIES[cell.policyName];
  const klub = clubById(cell.clubId).shortName;
  const games: GameMetrics[] = [];
  for (const seed of seeds) {
    try {
      const cards = sales ? new Map<number, Offer>() : null;
      const observedCards: ObservedCard[] | null = dilemmas ? [] : null;
      const recorder = signings ? createSettlementRecorder() : null;
      // One onCard hook feeding both the sales map and the dilemma
      // observation list - never two separate hooks watching the same card.
      const onCard =
        cards || observedCards
          ? (card: Offer, index: number, state: GameState): void => {
              if (cards) cards.set(index, card);
              if (observedCards) observedCards.push(observeCard(card, index, state));
            }
          : undefined;
      const result = simulateGame({
        seed,
        clubId: cell.clubId,
        policy,
        financeControl,
        ...(onCard ? { onCard } : {}),
        ...(recorder ? { onStep: recorder.onStep } : {}),
      });
      games.push(extractMetrics(result, cell.policyName));
      if (signings)
        signings.push(...extractSignings(result, cell.policyName, recorder!.settlements()));
      if (seasons) seasons.push(...extractFinanceSeasons(result, cell.policyName, incomeMode));
      if (sales && cards) sales.push(...extractSales(result, cell.policyName, cards));
      if (dilemmas && observedCards)
        dilemmas.push(
          extractDilemmaCareer(result, cell.policyName, observedCards, incomeMode as IncomeMode)
        );
    } catch (err) {
      errors.push({
        seed,
        klub,
        polityka: cell.policyName,
        komunikat: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return games;
};

const main = (): void => {
  const cli = parseBalanceCli(process.argv.slice(2));
  const start = Date.now();
  // One series for every cell, so the whole matrix is paired by seed.
  const seeds = seedSeries(cli.seed, cli.runs);
  const errors: RunError[] = [];
  const signings: SigningObservation[] | null = cli.dumpSignings ? [] : null;
  const incomeMode = cli.financeControl ? "finance-control" : "normal";
  const seasons: FinanceSeasonObservation[] | null = cli.dumpSeasons ? [] : null;
  const sales: SaleObservation[] | null = cli.dumpSales ? [] : null;
  const dilemmas: DilemmaCareer[] | null = cli.dumpDilemmas ? [] : null;

  const scopes: CellScope[] = cli.clubs.map((clubId) => ({ clubId }));

  // scope -> policy -> games, kept around for the paired comparisons below.
  const gamesByScope = new Map<string, Map<string, GameMetrics[]>>();
  const cells: CellAggregate[] = [];

  const totalCells = scopes.length * cli.policies.length;
  let cellsDone = 0;

  for (const scope of scopes) {
    const byPolicy = new Map<string, GameMetrics[]>();
    gamesByScope.set(scopeKey(scope), byPolicy);
    for (const policyName of cli.policies) {
      const cellStart = Date.now();
      const games = runCell(
        { ...scope, policyName },
        seeds,
        cli.financeControl,
        errors,
        signings,
        seasons,
        sales,
        dilemmas,
        incomeMode
      );
      byPolicy.set(policyName, games);
      if (games.length > 0) {
        cells.push(aggregateCell(scope.clubId, policyName, games));
      }
      cellsDone += 1;
      // Progress goes to stderr, never stdout - stdout carries the report
      // and must stay byte-identical to a run with no progress reporting.
      process.stderr.write(
        `${formatProgress(cellsDone, totalCells, scope.clubId, policyName, Date.now() - cellStart, Date.now() - start)}\n`
      );
    }
  }

  const vsPassRows: PolicyVsPassRow[] = [];
  for (const scope of scopes) {
    const byPolicy = gamesByScope.get(scopeKey(scope))!;
    const baseline = byPolicy.get("alwaysPass");
    if (!baseline) continue;
    const klub = clubById(scope.clubId).shortName;
    for (const policyName of cli.policies) {
      if (policyName === "alwaysPass") continue;
      const games = byPolicy.get(policyName);
      if (!games) continue;
      const cmp = pairBySeed(baseline, games, (g) => g.dziedzictwo);
      if (cmp) vsPassRows.push({ klub, policyName, cmp });
    }
  }

  const ageDilemmaRows: AgeDilemmaRow[] = [];
  for (const { pivot, against: againstList } of AGE_DILEMMAS) {
    if (!cli.policies.includes(pivot)) continue;
    for (const scope of scopes) {
      const byPolicy = gamesByScope.get(scopeKey(scope))!;
      const young = byPolicy.get(pivot);
      if (!young) continue;
      const klub = clubById(scope.clubId).shortName;
      for (const against of againstList) {
        if (!cli.policies.includes(against)) continue;
        const other = byPolicy.get(against);
        if (!other) continue;
        const dziedzictwo = pairBySeed(other, young, (g) => g.dziedzictwo);
        const pktA = pairBySeed(other, young, (g) => g.breakdown.pktA);
        const pktB = pairBySeed(other, young, (g) => g.breakdown.pktB);
        if (dziedzictwo && pktA && pktB) {
          ageDilemmaRows.push({ klub, pivot, against, dziedzictwo, pktA, pktB });
        }
      }
    }
  }

  // Per-game rows, needed to place legacy thresholds on measured percentiles:
  // the aggregate tables only carry medians and quartiles, which cannot answer
  // "what value would put 5% of games in the top tier".
  if (cli.dumpRaw) {
    const rows = [formatCsvRow(DUMP_COLUMNS)];
    for (const scope of scopes) {
      const club = clubById(scope.clubId);
      // dziedzictwoZHandicapem is a presentation column: the engine itself
      // shifts the THRESHOLDS by the handicap rather than the score (see
      // epilogue.ts), so this column reconstructs the equivalent shifted
      // score for percentile analysis against a single fixed threshold set.
      const legacyHandicap = buildCareerBaseline(scope.clubId).legacyHandicap;
      for (const policyName of cli.policies) {
        for (const g of gamesByScope.get(scopeKey(scope))?.get(policyName) ?? []) {
          rows.push(
            formatCsvRow([
              club.clubId,
              policyName,
              String(g.seed),
              String(g.dziedzictwo),
              String(g.dziedzictwo + legacyHandicap),
              g.tytul,
              g.werdyktTytul,
              String(g.ocenaKadencji),
              String(g.breakdown.wartoscKadry),
              String(g.breakdown.wartoscKadryMoj),
              String(g.sezonyLM),
              String(g.sezonyLE),
              String(g.sezonyLK),
              String(g.kasaEuro),
              String(g.squadSizeAtHandover),
              String(g.squadSizeEnd),
              String(g.breakdown.kasa),
              String(g.breakdown.pktA),
              String(g.breakdown.pktB),
              String(g.breakdown.trofea),
              String(g.breakdown.spadki),
              String(g.breakdown.wartoscKadryMojAtHandover),
              String(g.breakdown.handoverSeason),
              String(g.breakdown.spadkiKadencja),
              String(g.breakdown.pierwszySpadekSezon),
              String(g.sezonyRozegrane),
              String(g.offerCounts.KUPNO),
              String(g.offerCounts.SPRZEDAZ),
              String(g.offerCounts.PRZEDLUZENIE),
              String(g.offerCounts.WOLNY),
              String(g.offerCounts.PANIC),
              club.shortName,
              incomeMode,
              String(DUMP_SCHEMA_VERSION),
              String(g.signingCount),
              String(g.rngDrawCount),
            ])
          );
        }
      }
    }
    writeFileSync(cli.dumpRaw, rows.join("\n"), "utf8");
  }

  if (cli.dumpSeasons && seasons) {
    const rows = [formatCsvRow(SEASON_COLUMNS)];
    for (const s of seasons) {
      rows.push(
        formatCsvRow([
          String(s.dumpSchemaVersion),
          s.engineVersion,
          s.incomeMode,
          s.clubShortName,
          s.policyName,
          String(s.seed),
          String(s.season),
          String(s.initialBudget),
          String(s.preseasonForecastBalanceWithoutTransfersAndCups),
          String(s.actualBalanceWithoutTransfersAndCups),
          String(s.scaledRecurringRevenue),
          String(s.leaguePositionPrize),
          String(s.totalPayroll),
          String(s.fixedCosts),
          String(s.scalableNetPln),
          s.cashAtHandover === null ? "" : String(s.cashAtHandover),
          String(s.europeanPrizeIncome),
          String(s.polishCupPrizeIncome),
          String(s.superCupPrizeIncome),
          String(s.creditedCupIncome),
          String(s.rngDrawCount),
        ])
      );
    }
    writeFileSync(cli.dumpSeasons, rows.join("\n"), "utf8");
  }

  if (cli.dumpSignings && signings) {
    const rows = [formatCsvRow(SIGNING_COLUMNS)];
    for (const s of signings) {
      rows.push(
        formatCsvRow([
          s.clubShortName,
          s.policyName,
          String(s.seed),
          String(s.decisionIndex),
          String(s.season),
          s.offerType,
          s.playerId,
          s.position,
          String(s.age),
          String(s.ovr),
          String(s.fee),
          String(s.annualWage),
          String(s.baseAnnualWage),
          String(s.payrollDelta),
          String(s.seasonsOnPayroll),
          String(s.wageCostToHandover),
        ])
      );
    }
    writeFileSync(cli.dumpSignings, rows.join("\n"), "utf8");
  }

  if (cli.dumpSales && sales) {
    const rows = [formatCsvRow(SALES_COLUMNS)];
    for (const s of sales) {
      rows.push(
        formatCsvRow([
          s.clubId,
          s.policyName,
          String(s.seed),
          String(s.decisionIndex),
          String(s.season),
          String(s.offerPrice),
          s.realisedFee === null ? "" : String(s.realisedFee),
          s.buyerOrigin,
          s.buyerClubId ?? "",
        ])
      );
    }
    writeFileSync(cli.dumpSales, rows.join("\n"), "utf8");
  }

  if (cli.dumpDilemmas && dilemmas) {
    const rows = [formatCsvRow(DILEMMA_COLUMNS)];
    for (const d of dilemmas) {
      rows.push(
        formatCsvRow([
          String(d.dilemmaSchemaVersion),
          d.engineVersion,
          d.incomeMode,
          d.clubId,
          d.policyName,
          String(d.seed),
          String(d.usefulPurchaseCost),
          String(d.externalCards),
          String(d.paidExternalCards),
          String(d.externalAffordable),
          String(d.externalStrengthening),
          String(d.externalAffordableStrengthening),
          String(d.atPriceCapCards),
          String(d.windows),
          String(d.windowsUnderPressure),
          String(d.salesAccepted),
          String(d.pressureSales),
          String(d.ownStarSaleCards),
          String(d.ownStarSalesAccepted),
          String(d.firstWindowKupno),
          String(d.firstWindowUsefulKupno),
          String(d.firstWindowUsefulAffordableKupno),
          String(d.firstWindowUsefulHaggleAffordableKupno),
        ])
      );
    }
    writeFileSync(cli.dumpDilemmas, rows.join("\n"), "utf8");
  }

  const totalGames = scopes.length * cli.policies.length * cli.runs - errors.length;
  const info: RunInfo = {
    totalGames,
    seedBase: cli.seed,
    runsPerCell: cli.runs,
    errorCount: errors.length,
    durationSeconds: (Date.now() - start) / 1000,
  };

  const render = (format: TableFormat): string =>
    [
      "== Dziedzictwo (rozklad) ==",
      renderSummaryTable(cells, format),
      "",
      "== Rozbicie dziedzictwa (mediana skladnika, % udzialu w medianie) ==",
      renderBreakdownTable(cells, format),
      "",
      "== Rozklad tytulow (pasm dziedzictwa) ==",
      renderTytulTable(cells, format),
      "",
      "== Rozklad werdyktow kadencji ==",
      renderWerdyktTable(cells, format),
      "",
      "== Ryzyko i aktywnosc ==",
      renderRiskTable(cells, format),
      "",
      "== Polityka vs alwaysPass (sparowane po ziarnie) ==",
      vsPassRows.length > 0
        ? renderVsPassTable(vsPassRows, format)
        : "Brak danych (alwaysPass nie w zestawie polityk).",
      "",
      "== Dylemat wiekowy: youngOnly vs primeOnly/veteranOnly ==",
      ageDilemmaRows.length > 0
        ? renderAgeDilemmaTable(ageDilemmaRows, format)
        : "Brak danych (youngOnly/primeOnly/veteranOnly nie w zestawie polityk).",
      "",
      "== Bledy ==",
      renderErrorSummary(errors),
      "",
      renderFooter(info),
    ].join("\n");

  const asciiReport = render("ascii");
  console.log(asciiReport);

  if (cli.md) {
    writeFileSync(cli.md, render("markdown"), "utf8");
    console.log(`\nRaport markdown zapisany do ${cli.md}`);
  }

  // A career that threw is a missing observation, not a rounding error: the
  // baseline is only valid if every cell ran to completion.
  if (errors.length > 0) process.exitCode = 1;
};

main();
