import { writeFileSync } from "node:fs";

import { AGE_PROFILES, HAGGLE_SALE_BONUS } from "../src/data/balance";
import { parseFlags } from "./cli-args";
import {
  bestFit,
  AGE_RATIO_BANDS,
  canonicalExamples,
  CONSTRAINT_THRESHOLDS,
  DEFAULT_PROFILE,
  feasibleJointSets,
  FIT_TOOL_VERSION,
  FOREIGN_TIERS,
  MARKET_EMPTY_MULTIPLIER,
  MAX_DOMESTIC_FEE,
  MAX_FOREIGN_FEE,
  MAX_UNHAGGLED_FOREIGN_FEE,
  PRICE_ANCHORS,
  PRICE_DEVIATION_BAND,
  SEARCH_RANGE,
  upperAnchorSpreads,
} from "./value-curve-core";

const KNOWN_FLAGS = ["--md", "--help"];
const VALUELESS_FLAGS = ["--help"];

const HELP = `pnpm fit:value-curve [--md <plik>]

Sweeps the declared parameter range for feasible value curves, picks the one
closest to the four price anchors, fits the soft-cap knee against qualified
offers, and prints every amount the spec quotes. Reads nothing and changes
no game constant.`;

const round = (value: number): string => value.toFixed(3);

export const buildReport = (): string => {
  const candidates = feasibleJointSets(SEARCH_RANGE);
  const { params, knee } = bestFit(candidates);
  const knees = candidates.find((candidate) => candidate.params === params)!.knees;
  const examples = canonicalExamples(params, knee);
  const anchorTable = upperAnchorSpreads(params, knee);

  return [
    "# Dopasowanie krzywej wartości",
    "",
    "Parametry nie są aktywne. Aktywacja czeka na manifest, płace i skalę pieniądza.",
    "Raport jest źródłem wyliczonych przykładów, nie zmienia docelowych kotwic speka.",
    "Kwoty: mln EUR; stosunki i błędy: ułamki, nie procenty. Optimum na zadeklarowanej siatce.",
    "",
    "Metoda: przegląd całej zadeklarowanej siatki, odrzucenie zestawów łamiących",
    "którekolwiek twarde ograniczenie, przecięcie z pasmem dopuszczalnych kolan, a dopiero",
    "na tym przecięciu minimalizacja sumy kwadratów względnych błędów czterech kotwic.",
    "Pusta siatka oznaczałaby brak rozwiązania na tej siatce, nigdy sprzeczność modelu.",
    "",
    `Wersja narzędzia: **${FIT_TOOL_VERSION}**.`,
    `Zestawów wykonalnych w zadeklarowanej siatce: **${candidates.length}**.`,
    "",
    "| parametr | wartość |",
    "| --- | ---: |",
    ...Object.entries(params).map(([k, v]) => `| \`${k}\` | ${v} |`),
    `| \`FOREIGN_FEE_SOFT_KNEE\` | ${knee} |`,
    "",
    `Pasmo wykonalnych kolan: **${Math.min(...knees)} – ${Math.max(...knees)}**.`,
    "",
    "## Przykłady kwotowe",
    "",
    "| przykład | wartość |",
    "| --- | ---: |",
    ...Object.entries(examples).map(([k, v]) => `| ${k} | ${round(v)} |`),
    "",
    "## Górne kotwice po kwalifikacji kupców",
    "",
    "| kotwica | baza | tiery | oferta od | oferta do | rozpiętość widoczna | względna | próg | wynik |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |",
    ...anchorTable.map((row) => {
      const threshold =
        row.spread.tiers.length >= 2
          ? `≥ ${CONSTRAINT_THRESHOLDS.minRelativeSpread} względnie`
          : `≥ ${CONSTRAINT_THRESHOLDS.minVisibleSpread} mln`;
      return [
        `| ${row.label}`,
        round(row.base),
        row.spread.tiers.map((tier) => tier.name).join(", "),
        round(row.spread.low),
        round(row.spread.high),
        row.spread.visibleSpread.toFixed(2),
        round(row.spread.relative),
        threshold,
        `${row.passes ? "PASS" : "FAIL"} |`,
      ].join(" | ");
    }),
    "",
    "## Wejścia dopasowania",
    "",
    "```json",
    JSON.stringify(
      {
        toolVersion: FIT_TOOL_VERSION,
        searchRange: SEARCH_RANGE,
        priceAnchors: PRICE_ANCHORS,
        ageModel: {
          defaultProfile: DEFAULT_PROFILE,
          positionProfiles: AGE_PROFILES,
          ratioReferenceOvr: 70,
          ratioReferenceAge: DEFAULT_PROFILE.peakStart,
          ratioBands: AGE_RATIO_BANDS.map((band) => ({
            label: band.label,
            ageForDefaultProfile: band.at(DEFAULT_PROFILE),
            min: band.min,
            max: band.max,
          })),
        },
        constraintThresholds: CONSTRAINT_THRESHOLDS,
        transfer: {
          haggleSaleBonus: HAGGLE_SALE_BONUS,
          marketEmptyMultiplier: MARKET_EMPTY_MULTIPLIER,
          priceDeviation: PRICE_DEVIATION_BAND,
          maxDomesticFee: MAX_DOMESTIC_FEE,
          maxForeignFee: MAX_FOREIGN_FEE,
          maxUnhaggledForeignFee: MAX_UNHAGGLED_FOREIGN_FEE,
          foreignTiers: FOREIGN_TIERS,
        },
      },
      null,
      2
    ),
    "```",
    "",
    "## Wynik z pełną precyzją",
    "",
    "```json",
    JSON.stringify(
      { params, knee, feasibleKnees: knees, examples, upperAnchorSpreads: anchorTable },
      null,
      2
    ),
    "```",
  ].join("\n");
};

const main = (): void => {
  const flags = parseFlags(process.argv.slice(2), KNOWN_FLAGS, VALUELESS_FLAGS);
  const md = flags.get("--md");
  if (md !== undefined && (md.trim() === "" || md.startsWith("--"))) {
    throw new Error("--md requires a non-empty output path, not another flag");
  }
  if (flags.has("--help")) {
    console.log(HELP);
    return;
  }

  const report = buildReport();
  console.log(report);
  if (md) writeFileSync(md, `${report}\n`, "utf8");
};

main();
