import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// A namespace import on purpose: exhaustiveness has to enumerate the runtime
// exports of balance.ts, and no named import can do that.
import * as balance from "../../src/data/balance";
import {
  EUROPEAN_PRIZE_MONEY,
  PUCHAR_POLSKI_PREMIA,
  SUPERPUCHAR_PREMIA,
} from "../../src/data/balance";
import {
  MONEY_CONSTANTS,
  NOT_MONETARY,
  moneyDependentsOf,
} from "../../src/data/money-constants-manifest";

const exported = Object.keys(balance).sort();
const monetary = Object.keys(MONEY_CONSTANTS).sort();
const notMonetary = Object.keys(NOT_MONETARY).sort();

describe("money constants manifest", () => {
  it("classifies every runtime export of balance.ts exactly once", () => {
    expect([...monetary, ...notMonetary].sort()).toEqual(exported);
  });

  it("never lists one name on both sides", () => {
    expect(monetary.filter((name) => notMonetary.includes(name))).toEqual([]);
  });

  it("points every evidence path at a file that exists", () => {
    const missing = Object.entries(MONEY_CONSTANTS).flatMap(([name, entry]) =>
      (entry?.evidence ?? [])
        .filter((path) => !existsSync(join(process.cwd(), path)))
        .map((path) => `${name}: ${path}`)
    );
    expect(missing).toEqual([]);
  });

  it("gives evidence or an external source to every measured, fitted or converted constant", () => {
    const sourced = new Set(["measured", "fitted", "anchor", "unitConversion"]);
    const withoutEvidence = Object.entries(MONEY_CONSTANTS)
      .filter(([, entry]) => entry !== undefined && sourced.has(entry.origin))
      .filter(
        ([, entry]) => entry?.evidence.length === 0 && (entry.externalSources ?? []).length === 0
      )
      .map(([name]) => name);
    expect(withoutEvidence).toEqual([]);
  });

  it("gives every decision, assumption or pre-activation constant a stated basis", () => {
    const decided = new Set(["productDecision", "designAssumption", "preActivation"]);
    const withoutBasis = Object.entries(MONEY_CONSTANTS)
      .filter(([, entry]) => entry !== undefined && decided.has(entry.origin))
      .filter(([, entry]) => entry?.basis.trim() === "")
      .map(([name]) => name);
    expect(withoutBasis).toEqual([]);
  });

  it("names only classified exports as dependencies", () => {
    const unknown = Object.entries(MONEY_CONSTANTS).flatMap(([name, entry]) =>
      (entry?.dependsOn ?? [])
        .filter((dependency) => !exported.includes(dependency))
        .map((dependency) => `${name} -> ${dependency}`)
    );
    expect(unknown).toEqual([]);
  });

  it("gives code-derived constants at least one dependency", () => {
    const orphans = Object.entries(MONEY_CONSTANTS)
      .filter(([, entry]) => entry?.origin === "derivedInCode" && entry.dependsOn.length === 0)
      .map(([name]) => name);
    expect(orphans).toEqual([]);
  });
});

const entries = Object.entries(MONEY_CONSTANTS);

const namesWhere = (
  predicate: (
    _entry: NonNullable<(typeof MONEY_CONSTANTS)[keyof typeof MONEY_CONSTANTS]>
  ) => boolean
) =>
  entries
    .filter(([, entry]) => entry !== undefined && predicate(entry))
    .map(([name]) => name)
    .sort();

describe("money families", () => {
  it("has no cycle in dependsOn", () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const cycles: string[] = [];
    const visit = (name: string, path: readonly string[]): void => {
      if (done.has(name)) return;
      if (visiting.has(name)) {
        cycles.push([...path, name].join(" -> "));
        return;
      }
      visiting.add(name);
      const entry = MONEY_CONSTANTS[name as keyof typeof MONEY_CONSTANTS];
      (entry?.dependsOn ?? []).forEach((dependency) => visit(dependency, [...path, name]));
      visiting.delete(name);
      done.add(name);
    };
    entries.forEach(([name]) => visit(name, []));
    expect(cycles).toEqual([]);
  });

  // The payoff of the manifest: moving the money scale must name every
  // constant derived from it. The three that were once found by hand - the
  // budget floor, WOLNY_WAGE_PREMIUM and VERDICT_KASA - are all on this list.
  // It is not the full review list for a scale move - see the test below for
  // the scale's own inputs and the preActivation amounts it omits on purpose.
  it("names every constant derived from the money scale", () => {
    expect(moneyDependentsOf("MONEY_SCALE_PLN_PER_GAME_MILLION")).toEqual([
      "ACTIVE_BACKER_PERCENTILE",
      "INITIAL_BUDGET_SHARE",
      "LEAGUE_PRIZE_RATE",
      "LEGACY_KASA",
      "MIN_INITIAL_BUDGET",
      "STRONG_BACKER_PERCENTILE",
      "USEFUL_UPGRADE_OVR_DELTA",
      "VERDICT_KASA",
      "WAGE_AT_PIVOT",
      "WOLNY_WAGE_PREMIUM",
      "leaguePositionPrize",
    ]);
  });

  // The review list for a scale move is not moneyDependentsOf alone: it is
  // the derived closure above, plus the scale's own direct inputs
  // (KOSZTY_STALE), plus the preActivation amounts that are deliberately
  // outside the closure today. Every game-money amount must fall into one of
  // those three groups, or it would go unreviewed when the scale moves.
  it("covers every game-money amount by the derived closure, the scale's inputs, or preActivation", () => {
    const scaleName = "MONEY_SCALE_PLN_PER_GAME_MILLION" as const;
    const derived: readonly string[] = moneyDependentsOf(scaleName);
    const scaleInputs: readonly string[] = MONEY_CONSTANTS[scaleName]?.dependsOn ?? [];
    const moneyAmountUnits = new Set(["gameMillionEur", "gameMillionEurPerPlace"]);
    const violators = entries
      .filter(
        ([, entry]) =>
          entry !== undefined &&
          entry.family === "game" &&
          moneyAmountUnits.has(entry.unit as string)
      )
      .map(([name]) => name)
      .filter(
        (name) =>
          !derived.includes(name) &&
          !scaleInputs.includes(name) &&
          MONEY_CONSTANTS[name as keyof typeof MONEY_CONSTANTS]?.origin !== "preActivation"
      )
      .sort();
    expect(violators).toEqual([]);
  });

  it("does not mistake the independent buyer share for a derivative of the NBP rate", () => {
    expect(moneyDependentsOf("EUR_PLN_SOURCE_SEASON")).toEqual([]);
  });

  it("has no declared path from the NBP rate to a game-money constant", () => {
    const leaks = moneyDependentsOf("EUR_PLN_SOURCE_SEASON").filter(
      (name) => MONEY_CONSTANTS[name]?.family === "game"
    );
    expect(leaks).toEqual([]);
  });

  it("has no declared path from the money scale to a real-euro constant", () => {
    const leaks = moneyDependentsOf("MONEY_SCALE_PLN_PER_GAME_MILLION").filter(
      (name) => MONEY_CONSTANTS[name]?.family === "realEuro"
    );
    expect(leaks).toEqual([]);
  });

  it("keeps the buyer side of a sale in real euro", () => {
    expect(
      (["MAX_INTRA_LEAGUE_FEE", "FOREIGN_TIER_TERMS", "EUR_PLN_SOURCE_SEASON"] as const).map(
        (name) => MONEY_CONSTANTS[name]?.family
      )
    ).toEqual(["realEuro", "realEuro", "realEuro"]);
  });

  it("describes the foreign tier's composite unit honestly", () => {
    expect(MONEY_CONSTANTS.FOREIGN_TIER_TERMS?.unit).toEqual({
      buyerFactor: "ratio",
      maxSpend: "realMillionEur",
    });
  });

  // Known debt, pinned on purpose: these are still in the money of before the
  // 2026-09-10 activation. Repricing one of them must also rewrite its entry,
  // so the values are pinned alongside the list.
  it("pins the constants still in pre-activation money, and their values", () => {
    expect(namesWhere((entry) => entry.origin === "preActivation")).toEqual([
      "EUROPEAN_PRIZE_MONEY",
      "PUCHAR_POLSKI_PREMIA",
      "SUPERPUCHAR_PREMIA",
    ]);
    expect({ EUROPEAN_PRIZE_MONEY, PUCHAR_POLSKI_PREMIA, SUPERPUCHAR_PREMIA }).toEqual({
      EUROPEAN_PRIZE_MONEY: {
        LM: { qualifying: 1.2, league: 4.0, knockout: 5.6 },
        LE: { qualifying: 0.5, league: 1.0, knockout: 1.5 },
        LK: { qualifying: 0.3, league: 0.7, knockout: 1.1 },
      },
      PUCHAR_POLSKI_PREMIA: 1.4,
      SUPERPUCHAR_PREMIA: 0.3,
    });
  });

  it("returns nothing for a constant nobody depends on", () => {
    expect(moneyDependentsOf("VERDICT_KASA")).toEqual([]);
  });
});
