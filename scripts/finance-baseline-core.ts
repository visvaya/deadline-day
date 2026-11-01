import { LEGACY_KASA, LEGACY_WARTOSC_KADRY } from "../src/data/balance";
import { parseCsvLine } from "./csv";
import { dumpIdentityOf } from "./dump-identity";
import type { DumpIdentity } from "./dump-identity";
import { median } from "./stats";
import { at } from "../src/logic/invariant";

/**
 * Reads the artefacts of a finance baseline run and says whether they are a
 * baseline at all, then summarises them.
 *
 * Re-runs nothing. The whole point of a baseline is that the dumps are the
 * measurement; a summary tool that could re-simulate would make it possible
 * to publish numbers no saved file backs.
 *
 * The completeness rules are not pedantry. A baseline with one career
 * missing is not a slightly smaller baseline: the next stage pairs against
 * it seed by seed, and a gap silently drops that pair from every comparison
 * it appears in.
 */

export type BaselineRow = {
  poziom: string;
  klub: string;
  polityka: string;
  seed: number;
  incomeMode: string;
  signingCount: number;
  /** Cash at the end of the epilogue, mln EUR. One of the two quantities the
   * legacy formula weights, and the one the finance change moves most. */
  kasa: number;
  /** Market value of the manager's own signings at the end, mln EUR. */
  wartoscKadryMoj: number;
  dziedzictwo: number;
  sezonyRozegrane: number;
};

export type SigningRow = {
  clubShortName: string;
  policyName: string;
  seed: number;
  decisionIndex: number;
  season: number;
  offerType: string;
  position: string;
  age: number;
  ovr: number;
  fee: number;
  annualWage: number;
  baseAnnualWage: number;
};

const REQUIRED_DUMP_COLUMNS = [
  "poziom",
  "polityka",
  "seed",
  "kasa",
  "wartoscKadryMoj",
  "dziedzictwo",
  "sezonyRozegrane",
  "clubShortName",
  "incomeMode",
  "signingCount",
] as const;

const REQUIRED_SIGNING_COLUMNS = [
  "clubShortName",
  "policyName",
  "seed",
  "decisionIndex",
  "season",
  "offerType",
  "position",
  "age",
  "ovr",
  "fee",
  "annualWage",
  "baseAnnualWage",
] as const;

const numberField = (raw: string, column: string, line: number): number => {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Column "${column}" on line ${line} is not a number: "${raw}"`);
  }
  return value;
};

const readerFor = (
  text: string,
  required: readonly string[]
): { lines: string[]; header: string[]; field: (_fields: string[], _column: string) => string } => {
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  const indexOf = new Map(header.map((name, index) => [name, index]));
  for (const column of required) {
    if (!indexOf.has(column)) throw new Error(`File is missing the "${column}" column`);
  }
  return {
    lines,
    header,
    field: (fields, column) => fields[indexOf.get(column)!] ?? "",
  };
};

export const parseBaselineDump = (
  text: string
): { rows: BaselineRow[]; identity: DumpIdentity } => {
  const { lines, header, field } = readerFor(text, REQUIRED_DUMP_COLUMNS);
  const rows = lines.slice(1).map((line, offset) => {
    const fields = parseCsvLine(line);
    const n = offset + 2;
    return {
      poziom: field(fields, "poziom"),
      klub: field(fields, "clubShortName"),
      // This baseline is pinned to the schema-2/3 dumps it was measured from
      // (before the clubId migration of the career dump) and never reads a schema-5 file, so clubId is
      // always empty - present only to satisfy DumpKeyFields' shape.
      clubId: "",
      polityka: field(fields, "polityka"),
      seed: numberField(field(fields, "seed"), "seed", n),
      incomeMode: field(fields, "incomeMode") || "normal",
      signingCount: numberField(field(fields, "signingCount"), "signingCount", n),
      kasa: numberField(field(fields, "kasa"), "kasa", n),
      wartoscKadryMoj: numberField(field(fields, "wartoscKadryMoj"), "wartoscKadryMoj", n),
      dziedzictwo: numberField(field(fields, "dziedzictwo"), "dziedzictwo", n),
      sezonyRozegrane: numberField(field(fields, "sezonyRozegrane"), "sezonyRozegrane", n),
    };
  });
  return { rows, identity: dumpIdentityOf(header, rows[0] ?? null) };
};

export const parseSignings = (text: string): SigningRow[] => {
  const { lines, field } = readerFor(text, REQUIRED_SIGNING_COLUMNS);
  return lines.slice(1).map((line, offset) => {
    const fields = parseCsvLine(line);
    const n = offset + 2;
    return {
      clubShortName: field(fields, "clubShortName"),
      policyName: field(fields, "policyName"),
      seed: numberField(field(fields, "seed"), "seed", n),
      decisionIndex: numberField(field(fields, "decisionIndex"), "decisionIndex", n),
      season: numberField(field(fields, "season"), "season", n),
      offerType: field(fields, "offerType"),
      position: field(fields, "position"),
      age: numberField(field(fields, "age"), "age", n),
      ovr: numberField(field(fields, "ovr"), "ovr", n),
      fee: numberField(field(fields, "fee"), "fee", n),
      annualWage: numberField(field(fields, "annualWage"), "annualWage", n),
      baseAnnualWage: numberField(field(fields, "baseAnnualWage"), "baseAnnualWage", n),
    };
  });
};

export type DumpExpectation = {
  clubs: readonly string[];
  policies: readonly string[];
  incomeMode: string;
};

const careerKey = (row: { klub: string; polityka: string; seed: number }): string =>
  `${row.klub}\0${row.polityka}\0${row.seed}`;

/**
 * Everything that would make the dump unusable as a baseline, as a list of
 * sentences. Returns them all rather than throwing on the first: a run that
 * takes hours should report every problem it has in one pass.
 */
export const checkDump = (rows: readonly BaselineRow[], expected: DumpExpectation): string[] => {
  const problems: string[] = [];
  if (rows.length === 0) return ["The dump has no rows at all."];

  const clubs = [...new Set(rows.map((r) => r.klub))].sort();
  const missingClubs = expected.clubs.filter((c) => !clubs.includes(c));
  const extraClubs = clubs.filter((c) => !expected.clubs.includes(c));
  if (missingClubs.length) problems.push(`Missing clubs: ${missingClubs.join(", ")}.`);
  if (extraClubs.length) problems.push(`Unexpected clubs: ${extraClubs.join(", ")}.`);

  const policies = [...new Set(rows.map((r) => r.polityka))].sort();
  const missingPolicies = expected.policies.filter((p) => !policies.includes(p));
  const extraPolicies = policies.filter((p) => !expected.policies.includes(p));
  if (missingPolicies.length) problems.push(`Missing policies: ${missingPolicies.join(", ")}.`);
  if (extraPolicies.length) problems.push(`Unexpected policies: ${extraPolicies.join(", ")}.`);

  const wrongMode = [...new Set(rows.map((r) => r.incomeMode))].filter(
    (m) => m !== expected.incomeMode
  );
  if (wrongMode.length) {
    problems.push(`Expected incomeMode "${expected.incomeMode}", found: ${wrongMode.join(", ")}.`);
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const key = careerKey(row);
    if (seen.has(key)) problems.push(`Duplicate career: ${row.klub}/${row.polityka}/${row.seed}.`);
    seen.add(key);
    if (!Number.isSafeInteger(row.signingCount) || row.signingCount < 0) {
      problems.push(
        `signingCount for ${row.klub}/${row.polityka}/${row.seed} is not a count: ${row.signingCount}.`
      );
    }
  }

  // The whole matrix must have run the SAME seeds, or the cells are not
  // paired and no later comparison against this baseline is paired either.
  const bySeedSet = new Map<string, string[]>();
  for (const club of clubs) {
    for (const policy of policies) {
      const seeds = rows
        .filter((r) => r.klub === club && r.polityka === policy)
        .map((r) => r.seed)
        .sort((a, b) => a - b);
      const key = seeds.join(",");
      const cells = bySeedSet.get(key) ?? [];
      cells.push(`${club}/${policy}`);
      bySeedSet.set(key, cells);
    }
  }
  if (bySeedSet.size > 1) {
    const sizes = [...bySeedSet.entries()]
      .map(([seeds, cells]) => `${cells.length} cell(s) with ${seeds.split(",").length} seeds`)
      .join("; ");
    problems.push(`Cells do not share one seed series: ${sizes}.`);
  }

  return problems;
};

/**
 * Ties the signing export to the dump. Both are derived from the same traces
 * but by separate paths, so disagreement means one of them is wrong - which
 * is the only reason to keep the count in the dump at all.
 */
export const checkSignings = (
  rows: readonly BaselineRow[],
  signings: readonly SigningRow[]
): string[] => {
  const problems: string[] = [];
  const expected = new Map(rows.map((r) => [careerKey(r), r.signingCount]));
  const actual = new Map<string, number>();
  const seen = new Set<string>();

  for (const s of signings) {
    const key = careerKey({ klub: s.clubShortName, polityka: s.policyName, seed: s.seed });
    if (!expected.has(key)) {
      problems.push(
        `Signing for a career the dump does not have: ${s.clubShortName}/${s.policyName}/${s.seed}.`
      );
      continue;
    }
    const rowKey = `${key}\0${s.decisionIndex}`;
    if (seen.has(rowKey)) {
      problems.push(
        `Duplicate signing at decision ${s.decisionIndex} of ${s.clubShortName}/${s.policyName}/${s.seed}.`
      );
    }
    seen.add(rowKey);
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }

  for (const [key, count] of expected) {
    const got = actual.get(key) ?? 0;
    if (got !== count) {
      const [klub, polityka, seed] = key.split("\0");
      problems.push(
        `${klub}/${polityka}/${seed} reports ${count} signings but ${got} were exported.`
      );
    }
  }
  return problems;
};

/** A median that says so when there is nothing to take one of, rather than
 * inventing a zero the reader would take for a measurement. */
const medianOrNull = (values: readonly number[]): number | null =>
  values.length === 0 ? null : median(values);

const num = (value: number | null, digits = 2): string =>
  value === null ? "–" : value.toFixed(digits);

export type BaselineSummary = {
  controlRows: number;
  activeRows: number;
  signingRows: number;
  /** Medians over every row of the relevant complete dump. Equal seed and
   * policy counts per club make this an equally-weighted average of clubs
   * without having to weight anything by hand. */
  controlKasaMedian: number | null;
  controlWartoscKadryMojMedian: number | null;
  activeKasaMedian: number | null;
  activeWartoscKadryMojMedian: number | null;
  perClub: {
    klub: string;
    poziom: string;
    controlKasa: number | null;
    activeKasa: number | null;
    controlWartoscKadryMoj: number | null;
    activeWartoscKadryMoj: number | null;
  }[];
  byOfferType: {
    offerType: string;
    count: number;
    feeMedian: number | null;
    wageMedian: number | null;
    baseWageMedian: number | null;
    ageMedian: number | null;
    ovrMedian: number | null;
  }[];
};

export const summarise = (
  control: readonly BaselineRow[],
  active: readonly BaselineRow[],
  signings: readonly SigningRow[]
): BaselineSummary => {
  const clubs = [...new Set([...control, ...active].map((r) => r.klub))];
  const offerTypes = [...new Set(signings.map((s) => s.offerType))].sort();
  const pick = (rows: readonly BaselineRow[], klub: string) => rows.filter((r) => r.klub === klub);

  return {
    controlRows: control.length,
    activeRows: active.length,
    signingRows: signings.length,
    controlKasaMedian: medianOrNull(control.map((r) => r.kasa)),
    controlWartoscKadryMojMedian: medianOrNull(control.map((r) => r.wartoscKadryMoj)),
    activeKasaMedian: medianOrNull(active.map((r) => r.kasa)),
    activeWartoscKadryMojMedian: medianOrNull(active.map((r) => r.wartoscKadryMoj)),
    perClub: clubs.map((klub) => ({
      klub,
      poziom: [...control, ...active].find((r) => r.klub === klub)!.poziom,
      controlKasa: medianOrNull(pick(control, klub).map((r) => r.kasa)),
      activeKasa: medianOrNull(pick(active, klub).map((r) => r.kasa)),
      controlWartoscKadryMoj: medianOrNull(pick(control, klub).map((r) => r.wartoscKadryMoj)),
      activeWartoscKadryMoj: medianOrNull(pick(active, klub).map((r) => r.wartoscKadryMoj)),
    })),
    byOfferType: offerTypes.map((offerType) => {
      const of = signings.filter((s) => s.offerType === offerType);
      return {
        offerType,
        count: of.length,
        feeMedian: medianOrNull(of.map((s) => s.fee)),
        wageMedian: medianOrNull(of.map((s) => s.annualWage)),
        baseWageMedian: medianOrNull(of.map((s) => s.baseAnnualWage)),
        ageMedian: medianOrNull(of.map((s) => s.age)),
        ovrMedian: medianOrNull(of.map((s) => s.ovr)),
      };
    }),
  };
};

export type ArtefactFact = { path: string; bytes: number; sha256: string };

export const renderSummary = (
  summary: BaselineSummary,
  meta: {
    commit: string;
    engineRevision: string;
    dumpSchemaVersion: string;
    seedBase: string;
    runs: string;
    clubs: readonly string[];
    controlPolicies: readonly string[];
    activePolicies: readonly string[];
    artefacts: readonly ArtefactFact[];
  }
): string => {
  const lines: string[] = [
    "# Baseline finansowy przed zmianą ekonomii",
    "",
    "Pomiar starej ekonomii, zachowany po to, żeby po zmianie było z czym porównać.",
    "Nic tu nie jest przeliczane ponownie — liczby pochodzą wyłącznie z zapisanych dumpów.",
    "",
    "## Co zostało uruchomione",
    "",
    `- commit kodu: \`${meta.commit}\``,
    `- \`ENGINE_REVISION\`: \`${meta.engineRevision}\``,
    `- wersja schematu dumpu: \`${meta.dumpSchemaVersion}\``,
    `- ziarno bazowe: \`${meta.seedBase}\`, \`--runs ${meta.runs}\``,
    `- kluby (${meta.clubs.length}): ${meta.clubs.join(", ")}`,
    `- przebieg kontrolny (\`--finance-control\`): ${meta.controlPolicies.join(", ")}`,
    `- przebieg aktywny (${meta.activePolicies.length} polityk): ${meta.activePolicies.join(", ")}`,
    "",
    "## Zachowane artefakty",
    "",
    "| plik | bajtów | sha256 |",
    "| --- | ---: | --- |",
    ...meta.artefacts.map((a) => `| \`${a.path}\` | ${a.bytes} | \`${a.sha256}\` |`),
    "",
    `Karier: kontrolnych ${summary.controlRows}, aktywnych ${summary.activeRows}.`,
    `Obserwacji podpisań: ${summary.signingRows}.`,
    "",
    "## Dwa niezmienniki punktacji",
    "",
    "Jednostka obu to **mln EUR**. Iloczyn to wkład składnika do dziedzictwa przy",
    `dzisiejszych stałych \`LEGACY_KASA = ${LEGACY_KASA}\` i \`LEGACY_WARTOSC_KADRY = ${LEGACY_WARTOSC_KADRY}\`.`,
    "",
    "| wielkość | przebieg | mediana | × stała |",
    "| --- | --- | ---: | ---: |",
    `| \`kasa\` | kontrolny | ${num(summary.controlKasaMedian)} | ${num(
      summary.controlKasaMedian === null ? null : summary.controlKasaMedian * LEGACY_KASA
    )} |`,
    `| \`kasa\` | aktywny | ${num(summary.activeKasaMedian)} | ${num(
      summary.activeKasaMedian === null ? null : summary.activeKasaMedian * LEGACY_KASA
    )} |`,
    `| \`wartoscKadryMoj\` | kontrolny | ${num(summary.controlWartoscKadryMojMedian)} | ${num(
      summary.controlWartoscKadryMojMedian === null
        ? null
        : summary.controlWartoscKadryMojMedian * LEGACY_WARTOSC_KADRY
    )} |`,
    `| \`wartoscKadryMoj\` | aktywny | ${num(summary.activeWartoscKadryMojMedian)} | ${num(
      summary.activeWartoscKadryMojMedian === null
        ? null
        : summary.activeWartoscKadryMojMedian * LEGACY_WARTOSC_KADRY
    )} |`,
    "",
    "## Mediany per klub",
    "",
    "| klub | poziom | `kasa` kontr. | `kasa` akt. | `wartoscKadryMoj` kontr. | `wartoscKadryMoj` akt. |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...summary.perClub.map(
      (c) =>
        `| ${c.klub} | ${c.poziom} | ${num(c.controlKasa)} | ${num(c.activeKasa)} | ${num(
          c.controlWartoscKadryMoj
        )} | ${num(c.activeWartoscKadryMoj)} |`
    ),
    "",
    "## Ceny i płace podpisanych, per typ oferty",
    "",
    "Z surowych obserwacji, nie z ilorazu sum. Mediana `KUPNO` obejmuje cały przekrój",
    "wieku, pozycji i OVR — **nie jest** odpowiednikiem konkretnego wolnego weterana i nie",
    "wolno jej użyć jako referencji do dopasowania nadpłaty. Taką referencję o ustalonym",
    "OVR, wieku i pozycji wyznacza dopiero następny etap.",
    "",
    "| typ | n | cena | płaca | płaca bazowa | wiek | OVR |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...summary.byOfferType.map(
      (t) =>
        `| ${t.offerType} | ${t.count} | ${num(t.feeMedian)} | ${num(t.wageMedian, 3)} | ${num(
          t.baseWageMedian,
          3
        )} | ${num(t.ageMedian, 1)} | ${num(t.ovrMedian, 1)} |`
    ),
    "",
  ];
  return lines.join("\n");
};
