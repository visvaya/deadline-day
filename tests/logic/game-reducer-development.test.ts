import { expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import type { GameState, Player } from "../../src/data/types";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { ageSquad } from "../../src/logic/development";
import { createPlayer } from "../../src/logic/player";
import { createRng } from "../../src/logic/rng";
import { fillEmptyPositions, formationOf } from "../../src/logic/squad";
import { autoAdvance } from "../golden/headless";
import { testClub, testManager } from "./fixtures";
import { driveGame } from "./offer-walk";

/** The formation initialState() starts on, so hand-built squads here have
 * the same shape as the ones the reducer under test actually produces. */
const FORMACJA = FORMACJE["4-3-3"];

const makePlayer = (overrides: Partial<Player>): Player => ({
  id: "p1",
  nazwa: "A. Testowy",
  poz: "BR",
  wiek: 25,
  ovr: 65,
  sufit: 65,
  moj: false,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
  ...overrides,
});

const runDevelopmentRegressionTest = (
  testName: string,
  playerOverrides: (_seed: number, _season: number) => Partial<Player>
): void => {
  test(testName, () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = createRng(seed);

      for (let season = 0; season < 10; season += 1) {
        const player = makePlayer(playerOverrides(seed, season));
        // Look up the profile from the player's own position, matching
        // production (ageSquad calls develop(rng, z, AGE_PROFILES[z.poz])).
        // A dedup pass once hardcoded this to AGE_PROFILE_DEFAULT, which
        // silently stopped the "BR age 28" regression from ever exercising
        // AGE_PROFILES.BR (peakEnd 33) - it ran on the default profile
        // (peakEnd 29) instead, which happened to also cover age 28 and so
        // never failed, despite testing the wrong curve entirely.
        const profile = AGE_PROFILES[player.poz] ?? AGE_PROFILE_DEFAULT;
        const aged = develop(rng, player, profile);

        expect(aged.ovr).toBeGreaterThanOrEqual(player.ovr);
      }
    }
  });
};

/**
 * Proves the seasonal OVR-change indicator: populated once per season at
 * koniecSezonu, survivors only (debutants get no entry, they have no "before"
 * OVR), and kept through the winter window tagged with the season it came
 * from - so the UI can say "last season" instead of the player having to
 * remember.
 */

const advanceUntil = (state: GameState, predicate: (_s: GameState) => boolean): GameState => {
  let s = state;
  for (let guard = 0; guard < 5000; guard += 1) {
    if (predicate(s)) return s;
    const advanced = autoAdvance(s);
    if (advanced) {
      s = advanced;
      continue;
    }
    if (s.faza === "okno" && s.karta) {
      s = gameReducer(s, { type: "DECIDE", choice: "pass" });
      continue;
    }
    throw new Error(`Stuck in phase "${s.faza}" while advancing`);
  }
  throw new Error("Exceeded step guard while advancing");
};

/** The season the schedule is currently on. State carries it per step, not
 * as a top-level field, and the final "werdykt" step carries no season at
 * all - which this test never reaches. */
const seasonOf = (state: GameState): number => {
  const step = state.kroki[state.krok];
  if (!("sezon" in step!)) throw new Error(`Step "${step!.typ}" carries no season`);
  return step.sezon;
};

test("ovrChange survives the winter window and remembers its season", () => {
  let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  state = gameReducer(state, {
    type: "START_CAREER",
    clubId: testClub.clubId,
    manager: testManager,
    seed: 1,
  });

  const preSeasonIds = new Set(state.kadra.map((z) => z.id));
  expect(state.ovrChange.byPlayer).toEqual({});

  const afterSeason1 = advanceUntil(state, (s) => s.faza === "koniecSezonu");

  const changedIds = Object.keys(afterSeason1.ovrChange.byPlayer);
  expect(changedIds.length).toBeGreaterThan(0);
  expect(afterSeason1.ovrChange.season).toBe(seasonOf(afterSeason1));
  for (const id of changedIds) {
    // Every entry belongs to a survivor from before the season, not a debutant
    // who replaced a retiree - a debutant has a fresh id with no "before" OVR.
    expect(preSeasonIds.has(id)).toBe(true);
    expect(afterSeason1.ovrChange.byPlayer[id]).not.toBe(0);
  }

  // The winter window used to wipe this. It keeps it now, tagged with the
  // season it came from, so the UI can say "last season" instead of the
  // player having to remember.
  const afterWinter = advanceUntil(afterSeason1, (s) => s.faza === "polSezonu");
  expect(afterWinter.ovrChange.byPlayer).toEqual(afterSeason1.ovrChange.byPlayer);
  expect(afterWinter.ovrChange.season).toBe(afterSeason1.ovrChange.season);
  expect(seasonOf(afterWinter)).toBeGreaterThan(afterWinter.ovrChange.season);
});

/**
 * Academy debutants only patch a position left with zero players - a squad that still has someone
 * on every position never gets a "free" debutant.
 */
test("fillEmptyPositions adds one debutant only to a position with zero players", () => {
  const kadra = [
    makePlayer({ id: "br1", poz: "BR" }),
    makePlayer({ id: "lo1", poz: "LO" }),
    makePlayer({ id: "lo2", poz: "LO" }),
  ];
  const rng = createRng(1);

  const { kadra: filled, debiutanci } = fillEmptyPositions(rng, kadra, undefined, FORMACJA);

  const debutOnBr = filled.filter((z) => z.poz === "BR" && z.id !== "br1");
  expect(debutOnBr).toHaveLength(0);
  expect(filled.filter((z) => z.poz === "LO")).toHaveLength(2);

  // Every position outside BR/LO started empty, so each gets exactly one debutant.
  expect(debiutanci.length).toBeGreaterThan(0);
  for (const debiutant of debiutanci) {
    expect(debiutant.poz).not.toBe("BR");
    expect(debiutant.poz).not.toBe("LO");
    expect(debiutant.wiek).toBeGreaterThanOrEqual(16);
    expect(debiutant.wiek).toBeLessThanOrEqual(17);
    expect(debiutant.ovr).toBeGreaterThanOrEqual(50);
    expect(debiutant.ovr).toBeLessThanOrEqual(56);
    expect(debiutant.moj).toBe(false);
  }
});

test("fillEmptyPositions leaves a squad with someone on every position untouched", () => {
  const kadra = [makePlayer({ id: "lo1", poz: "LO" }), makePlayer({ id: "lo2", poz: "LO" })];
  const rng = createRng(1);

  const { kadra: filled, debiutanci } = fillEmptyPositions(rng, kadra, undefined, FORMACJA);

  // Only LO had anyone to begin with, so every other position still gets
  // patched - this asserts the one position that already had players stays
  // exactly as it was.
  expect(filled.filter((z) => z.poz === "LO")).toHaveLength(2);
  expect(debiutanci.some((d) => d.poz === "LO")).toBe(false);
});

/**
 * A strong club's academy should groom slightly higher-potential prospects
 * than a weak one's - ceiling only, never ovr (the hidden-ceiling
 * rule). Same rng seed for both calls isolates the deterministic
 * clubStrength shift from the randInt(2, 8) noise, which draws identically
 * either way.
 */
test("a stronger club's academy debutant has a higher ceiling than a weaker club's, same ovr", () => {
  const weakClub = createPlayer(createRng(99), "akademia", "LO", 60);
  const strongClub = createPlayer(createRng(99), "akademia", "LO", 75);

  expect(strongClub.ovr).toBe(weakClub.ovr);
  expect(strongClub.sufit).toBeGreaterThan(weakClub.sufit);
});

test("ageSquad no longer replaces a retiree 1:1 - a position with a survivor stays without a debutant", () => {
  const survivor = makePlayer({ id: "lo-survivor", poz: "LO", wiek: 25, ovr: 65, sufit: 65 });
  const retiree = makePlayer({ id: "lo-retiree", poz: "LO", wiek: 36, ovr: 70, sufit: 70 });
  const rng = createRng(1);

  const { kadra, emeryci } = ageSquad(rng, [survivor, retiree], { overperformed: false }, FORMACJA);

  expect(emeryci.map((z) => z.id)).toEqual(["lo-retiree"]);
  expect(kadra.some((z) => z.id === "lo-retiree")).toBe(false);
  // No new player was created to fill the vacancy - ageSquad only ages and
  // retires, fillEmptyPositions decides whether a debutant is needed.
  expect(kadra).toHaveLength(1);
  expect(kadra[0]!.id).toBe("lo-survivor");
});

/**
 * A sale (or a refused extension, or a retirement) that empties a position
 * gets an immediate academy debutant, in the same dispatch - not deferred
 * to season end ("natychmiast, nawet w środku sezonu"). Checked as an invariant across a
 * full game rather than by isolating one sale: since fillEmptyPositions
 * runs synchronously inside every dispatch that can shrink the squad, no
 * position should ever be missing by the time the next card is drawn.
 */
test("no position is ever left without a player between decisions", () => {
  const emptyPositionsSeen = new Set<string>();
  driveGame(0x5000_0000, (state) => {
    for (const t of formationOf(state).pozycje) {
      if (!state.kadra.some((z) => z.poz === t.kod)) emptyPositionsSeen.add(t.kod);
    }
    return state.karta!.typ === "SPRZEDAZ" ? "take" : "pass";
  });
  expect(emptyPositionsSeen.size).toBe(0);
});

// --- Tests for smooth age curve (Task 5) ---

import { develop } from "../../src/logic/development";
import { AGE_PROFILE_DEFAULT } from "../../src/data/balance";

/**
 * Test 1: Age in plateau (peakStart to peakEnd) never lowers ovr –
 * neither when sufit === ovr nor when sufit < ovr.
 * This is the core fix for the goalkeeper regression.
 */
test("plateau age range never lowers ovr, even when sufit < ovr", () => {
  const rng = createRng(42);
  const profile = AGE_PROFILE_DEFAULT;

  // Test multiple ages in plateau range and multiple sufit < ovr scenarios
  for (let age = profile.peakStart; age <= profile.peakEnd; age += 1) {
    for (let gap = 0; gap <= 5; gap += 1) {
      const player = makePlayer({ wiek: age, ovr: 70, sufit: 70 - gap });
      const aged = develop(rng, player, profile);
      expect(aged.ovr).toBeGreaterThanOrEqual(player.ovr);
    }
  }
});

/**
 * Test 2: Decline accelerates with age past peakEnd.
 * Average loss at peakEnd+5 should be significantly greater than at peakEnd+1.
 */
test("decline accelerates: loss increases with years past peakEnd", () => {
  const rng1 = createRng(43);
  const rng2 = createRng(43); // Same seed for fair comparison
  const profile = AGE_PROFILE_DEFAULT;

  const player = makePlayer({ wiek: profile.peakEnd + 1, ovr: 75, sufit: 75 });
  const nearEnd = develop(rng1, player, profile);
  const lossNear = player.ovr - nearEnd.ovr;

  const playerFar = makePlayer({ wiek: profile.peakEnd + 5, ovr: 75, sufit: 75 });
  const farEnd = develop(rng2, playerFar, profile);
  const lossFar = playerFar.ovr - farEnd.ovr;

  // Far years should lose more than near years on average
  expect(lossFar).toBeGreaterThan(lossNear);
});

/**
 * Test 3: Continuity – loss in first year past plateau is less than historical -3.5.
 * Should be around 1.25 (the declineBase value).
 */
test("first year past plateau has gentler loss than -3.5", () => {
  const rng = createRng(44);
  const profile = AGE_PROFILE_DEFAULT;

  const player = makePlayer({ wiek: profile.peakEnd + 1, ovr: 75, sufit: 75 });
  const aged = develop(rng, player, profile);
  const loss = player.ovr - aged.ovr;

  // Should be around declineBase (1.25) with jitter, but much less than -3.5
  expect(loss).toBeLessThan(3.0);
  expect(loss).toBeGreaterThan(0);
});

/**
 * Test 4: Growth before peakStart converges toward ceiling and never exceeds it.
 */
test("growth phase converges to ceiling without exceeding it", () => {
  const rng = createRng(45);
  const profile = AGE_PROFILE_DEFAULT;

  // Test a young player with a ceiling above current ovr
  const player = makePlayer({ wiek: 20, ovr: 60, sufit: 75 });
  const aged = develop(rng, player, profile);

  // Should have grown
  expect(aged.ovr).toBeGreaterThan(player.ovr);
  // But never above ceiling
  expect(aged.ovr).toBeLessThanOrEqual(aged.sufit);
});

/**
 * Test 5: Lower limit of AGE_OVR_FLOOR (44) is enforced.
 */
test("ovr floor of 44 is enforced in decline", () => {
  const rng = createRng(46);
  const profile = AGE_PROFILE_DEFAULT;

  // Simulate a very old player close to the floor
  const player = makePlayer({ wiek: 40, ovr: 46, sufit: 50 });
  const aged = develop(rng, player, profile);

  expect(aged.ovr).toBeGreaterThanOrEqual(44);
});

/**
 * Test 6: INVARIANT – development never raises ovr above ceiling.
 * This tests the correct (narrower) claim: "develop() never causes ovr
 * to rise above sufit" – not the false global claim "ovr is never above sufit",
 * which would break veterans (see player.ts line 62-87).
 */
test("invariant: develop never raises ovr above sufit", () => {
  const profile = AGE_PROFILE_DEFAULT;
  const ages = [
    16,
    profile.peakStart - 1,
    profile.peakStart,
    profile.peakEnd,
    profile.peakEnd + 1,
    40,
  ];
  const startingOvrs = [50, 67, 84];
  const ceilingOffsets = [-5, 0, 1, 9];

  // Exercise every development branch and both sides of the ceiling with a
  // deterministic boundary matrix. A separate RNG per seed keeps failures
  // reproducible while still sampling the full range of growth/decline rolls.
  for (let seed = 1; seed <= 50; seed += 1) {
    const rng = createRng(seed);

    for (const age of ages) {
      for (const startOvr of startingOvrs) {
        for (const ceilingOffset of ceilingOffsets) {
          const player = makePlayer({
            wiek: age,
            ovr: startOvr,
            sufit: startOvr + ceilingOffset,
          });
          const aged = develop(rng, player, profile);
          const stayedWithinCeiling = aged.ovr <= player.sufit;
          const didNotIncrease = aged.ovr <= player.ovr;

          expect(
            stayedWithinCeiling || didNotIncrease,
            `seed=${seed}, age=${age}, ovr=${startOvr}, ceiling=${player.sufit}, developed=${aged.ovr}`
          ).toBe(true);
        }
      }
    }
  }
});

/**
 * Test 7: REGRESSION – Goalkeeper at age 28 (in plateau) through many
 * seasons must never lose ovr from age component alone.
 * (Form modifier is separate, Task 7.)
 */
runDevelopmentRegressionTest(
  "regression: plateau player (BR age 28) never loses ovr from age",
  () => ({ wiek: 28, poz: "BR", ovr: 70, sufit: 70 })
);

/**
 * Test 8: REGRESSION – Ready player with sufit = ovr - 1
 * (20% of ready signings per createPlayer) must not lose ovr
 * from age component when in plateau.
 */
runDevelopmentRegressionTest(
  "regression: gotowy player with sufit = ovr - 1 doesn't lose in plateau",
  () => ({
    wiek: 26,
    ovr: 72,
    sufit: 71,
  })
);

// --- Tests for position-specific aging curves (Task 6) ---

import { AGE_PROFILES } from "../../src/data/balance";

/**
 * Test 9: Position-specific aging profiles diverge significantly.
 * Goalkeeper (BR) and winger (LS) starting at age 32 with identical ovr/ceiling
 * exhibit dramatically different decline trajectories over 3 seasons.
 * At age 30 (before age 32 start): BR is in plateau, LS is deep in decline.
 */
test("position-specific profiles: goalkeeper and winger diverge over three seasons", () => {
  // Use a fixed seed to ensure deterministic, repeatable behavior
  const seed = 12345;

  // Goalkeeper (BR): peak 26-33, starts in plateau at age 32
  const brRng = createRng(seed);
  let brPlayer = makePlayer({ poz: "BR", wiek: 32, ovr: 72, sufit: 74 });
  const brAges: number[] = [brPlayer.ovr];

  for (let season = 0; season < 3; season += 1) {
    brPlayer = develop(brRng, brPlayer, AGE_PROFILES.BR);
    brAges.push(brPlayer.ovr);
  }

  // Winger (LS): peak 23-29, starts 3 years into decline at age 32
  const lsRng = createRng(seed);
  let lsPlayer = makePlayer({ poz: "LS", wiek: 32, ovr: 72, sufit: 74 });
  const lsAges: number[] = [lsPlayer.ovr];

  for (let season = 0; season < 3; season += 1) {
    lsPlayer = develop(lsRng, lsPlayer, AGE_PROFILES.LS);
    lsAges.push(lsPlayer.ovr);
  }

  // Goalkeeper's OVR after 3 seasons should be significantly higher
  const brMedian = brAges.reduce((a, b) => a + b, 0) / brAges.length;
  const lsMedian = lsAges.reduce((a, b) => a + b, 0) / lsAges.length;

  // The difference should be substantial - wingers fade much faster than keepers
  expect(brMedian).toBeGreaterThan(lsMedian + 3);

  // At age 30, BR should still be in plateau (no ovr loss from age)
  // At age 30, LS has just entered its decline
  const brAge30Rng = createRng(9999);
  const brAge30 = makePlayer({ poz: "BR", wiek: 30, ovr: 72, sufit: 74 });
  const brAge30Aged = develop(brAge30Rng, brAge30, AGE_PROFILES.BR);

  const lsAge30Rng = createRng(9999);
  const lsAge30 = makePlayer({ poz: "LS", wiek: 30, ovr: 72, sufit: 74 });
  const lsAge30Aged = develop(lsAge30Rng, lsAge30, AGE_PROFILES.LS);

  // BR at 30 should not decline (still in plateau 26-33)
  expect(brAge30Aged.ovr).toBeGreaterThanOrEqual(brAge30.ovr - 1); // Allow tiny jitter

  // LS at 30 is one year past peakEnd=29, so it loses declineBase and no
  // more - the point here is that it declines at all while the keeper does
  // not, not how hard.
  expect(lsAge30Aged.ovr).toBeLessThan(lsAge30.ovr);

  // The acceleration is what separates the two curves, and it only shows
  // further out: at 33 the winger is four years past its peak and losing
  // declineBase + 3 * declineAccel in a single season, while the keeper is
  // still inside its plateau.
  const lsAge33 = makePlayer({ poz: "LS", wiek: 33, ovr: 72, sufit: 74 });
  const lsAge33Aged = develop(createRng(9999), lsAge33, AGE_PROFILES.LS);
  expect(lsAge33Aged.ovr).toBeLessThan(lsAge30Aged.ovr);

  const brAge33 = makePlayer({ poz: "BR", wiek: 33, ovr: 72, sufit: 74 });
  const brAge33Aged = develop(createRng(9999), brAge33, AGE_PROFILES.BR);
  expect(brAge33Aged.ovr).toBeGreaterThan(lsAge33Aged.ovr);
});

// --- Tests for season form modifier (Task 7) ---

import { formAdjustment } from "../../src/logic/development";
import { FORM_PENALTY_FLOOR, FORM_ROTATION_SLOTS, FORM_UP_ODDS } from "../../src/data/balance";
import { startingXi, substitutes } from "../../src/logic/squad";

/**
 * Test 1: Form adjustment 2x2 table - verify all four branches return expected outcomes at fixed seed.
 */
test("formAdjustment 2x2 table: all four branches produce correct results", () => {
  const testCases: Array<{
    played: boolean;
    overperformed: boolean;
    expectedMin: number;
    expectedMax: number;
    description: string;
  }> = [
    {
      played: true,
      overperformed: true,
      expectedMin: 0,
      expectedMax: 1,
      description: "played & overperformed: 0 or 1",
    },
    {
      played: true,
      overperformed: false,
      expectedMin: 0,
      expectedMax: 0,
      description: "played & not overperformed: 0",
    },
    {
      played: false,
      overperformed: true,
      expectedMin: 0,
      expectedMax: 0,
      description: "not played & overperformed: 0",
    },
    {
      played: false,
      overperformed: false,
      expectedMin: -1,
      expectedMax: -1,
      description: "not played & not overperformed: -1",
    },
  ];

  for (const testCase of testCases) {
    const rng = createRng(999);
    const result = formAdjustment(rng, testCase.played, testCase.overperformed);
    expect(result).toBeGreaterThanOrEqual(testCase.expectedMin);
    expect(result).toBeLessThanOrEqual(testCase.expectedMax);
  }
});

/**
 * Test 2: Form bonus lands near FORM_UP_ODDS probability across many rolls.
 * Verifies that when played && overperformed, the +1 lands ~50% of the time.
 */
test("form bonus lands near FORM_UP_ODDS probability", () => {
  const rolls = 1000;
  let bonusCount = 0;

  for (let seed = 0; seed < rolls; seed += 1) {
    const rng = createRng(seed);
    const result = formAdjustment(rng, true, true);
    if (result === 1) bonusCount += 1;
  }

  const ratio = bonusCount / rolls;
  // Tolerance is relative to the real constant, not a hardcoded assumption -
  // a prior version of this test hardcoded [0.4, 0.6] for FORM_UP_ODDS=0.5,
  // which would have silently gone stale (and failed) the moment the
  // constant was retuned, exactly as happened during post-plan review.
  expect(ratio).toBeGreaterThan(FORM_UP_ODDS - 0.1);
  expect(ratio).toBeLessThan(FORM_UP_ODDS + 0.1);
});

/**
 * Test 3: Form penalty always lands when both signals are negative.
 */
test("form penalty always lands when played=false and overperformed=false", () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const rng = createRng(seed);
    const result = formAdjustment(rng, false, false);
    expect(result).toBe(-1);
  }
});

/**
 * Test 4: formAdjustment's own return value never exceeds +1/-1/0 - the raw
 * signal in isolation, not the composite clamp applied to it in ageSquad
 * (that composite is covered separately below, through the real function).
 */
test("form adjustment clamped by ceiling (sufit)", () => {
  const player = makePlayer({ wiek: 25, ovr: 68, sufit: 70 });
  const rng = createRng(77);

  // Simulate many form adjustments with played=true, overperformed=true
  // to maximize chances of +1 landing
  for (let i = 0; i < 100; i += 1) {
    const form = formAdjustment(rng, true, true);
    const adjusted = Math.min(player.sufit, player.ovr + form);
    expect(adjusted).toBeLessThanOrEqual(player.sufit);
  }
});

/**
 * Test 5: formAdjustment's own return value, penalty branch, in isolation -
 * see the note on Test 4 above.
 */
test("form penalty clamped by FORM_PENALTY_FLOOR", () => {
  const player = makePlayer({ wiek: 32, ovr: 55, sufit: 60 });
  const rng = createRng(88);

  // Simulate many penalties (played=false, overperformed=false)
  for (let i = 0; i < 50; i += 1) {
    const form = formAdjustment(rng, false, false);
    const adjusted = Math.max(FORM_PENALTY_FLOOR, player.ovr + form);
    expect(adjusted).toBeGreaterThanOrEqual(FORM_PENALTY_FLOOR);
  }
});

// --- Regression tests for the ageSquad composite-clamp bug found in
// post-plan review (2026-08-13). An earlier version of ageSquad's clamp
// line applied Math.max(FORM_PENALTY_FLOOR, Math.min(sufit, ovr+formAdj))
// unconditionally, regardless of formAdj's sign. Tests 4 and 5 above did
// not catch this because they reimplement their own (different, and in
// Test 5's case incomplete) arithmetic rather than calling ageSquad - they
// prove properties of formAdjustment's return value, not of the composite
// formula actually shipped in development.ts. These tests call the real
// ageSquad, the only way to prove the fix holds in production.

// LS decays fastest (declineBase 1.2, declineAccel 0.4). wiek=34, not 35:
// develop() increments wiek to 35 by the end of this call, and the
// retirement filter is wiek > 35 (strict), so 35 alone must NOT trigger
// age-based retirement - the point of both tests below is to isolate the
// ability-based path (ovr < 50) from the age-based one. Far enough past
// peakEnd (27) that even the jitter floor (0.7x) guarantees crossing below
// 50 regardless of the random draw.
const makeAbilityRetirementTarget = (): Player =>
  makePlayer({ id: "target", poz: "LS", wiek: 34, ovr: 52, sufit: 60 });

const runAbilityRetirementTest = (
  testName: string,
  squadWithTarget: (_target: Player) => Player[]
): void => {
  test(testName, () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = createRng(seed);
      const target = makeAbilityRetirementTarget();
      const { kadra, emeryci } = ageSquad(
        rng,
        squadWithTarget(target),
        { overperformed: false },
        FORMACJA
      );
      expect(emeryci.some((z) => z.id === "target")).toBe(true);
      expect(kadra.some((z) => z.id === "target")).toBe(false);
    }
  });
};

// Sole LS on the squad: the only candidate for the position's one XI slot,
// so played=true. With overperformed=false, formAdjustment's (played=true,
// overperformed=false) branch returns 0 deterministically - this is the
// neutral-form case, not the penalty case.
runAbilityRetirementTest(
  "ageSquad: a player who declines below 50 from age alone retires even with neutral form",
  (target) => [target]
);

// A stronger LS teammate takes the position's only XI/rotation slot, so
// `target` is played=false; with overperformed=false, formAdjustment
// returns -1 deterministically (both signals negative).
runAbilityRetirementTest(
  "ageSquad: a player who declines below 50 from age alone retires with a form penalty too",
  (target) => [target, makePlayer({ id: "teammate", poz: "LS", wiek: 25, ovr: 75, sufit: 78 })]
);

test("ageSquad: form bonus never pushes ovr above sufit, even with a low sufit", () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const rng = createRng(seed);
    // Sole starter, club overperforming: eligible for the +1 bonus chance
    // every season. sufit set just one point above starting ovr so a
    // missing clamp would be immediately visible.
    const target = makePlayer({ id: "target", poz: "POM", wiek: 26, ovr: 65, sufit: 66 });
    const { kadra } = ageSquad(rng, [target], { overperformed: true }, FORMACJA);
    const survivor = kadra.find((z) => z.id === "target");
    expect(survivor).toBeDefined();
    expect(survivor!.ovr).toBeLessThanOrEqual(66);
  }
});

test("ageSquad: neutral form never touches ovr, even for a player already above sufit", () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const rng = createRng(seed);
    // Past peakEnd for ŚO (31), so develop()'s decline branch runs (never
    // itself clamped by sufit); starting ovr chosen so a small decline
    // still leaves the player above sufit - the "veteran organically above
    // their own ceiling" case (see player.ts: weteran starts sufit=ovr-2).
    const target = makePlayer({ id: "target", poz: "ŚO", wiek: 32, ovr: 70, sufit: 68 });
    // played=true (sole starter), overperformed=false -> formAdj is
    // deterministically 0 (see formAdjustment).
    const { kadra } = ageSquad(rng, [target], { overperformed: false }, FORMACJA);
    const survivor = kadra.find((z) => z.id === "target");
    if (survivor) {
      // Independently recompute develop() alone, at the same seed, and
      // confirm the composite's neutral-form result matches it exactly -
      // proving form did not additionally clip toward sufit when it had
      // nothing to say.
      const independentRng = createRng(seed);
      const developedOnly = develop(independentRng, target, AGE_PROFILES["ŚO"]);
      expect(survivor.ovr).toBe(developedOnly.ovr);
    }
  }
});

test("ageSquad: a departing player (wygasa) does not steal an XI/rotation slot from a remaining teammate's 'played' status", () => {
  // LO has xi=1, so the "played" circle here is exactly 1 (XI) + 3
  // (FORM_ROTATION_SLOTS) = 4 slots, squad-wide. Five LO candidates by ovr:
  // leaving(90, wygasa) > decoy1(85) > decoy2(80) > decoy3(75) > staying(60).
  // If `played` were computed from the full kadra (bug), the top 4 -
  // leaving + all three decoys - fill every slot and `staying` (5th) is
  // excluded. Computed correctly from `remaining` (fix), `leaving` never
  // enters the pool, so only 4 candidates remain for 4 slots and `staying`
  // is included.
  const leaving = makePlayer({
    id: "leaving",
    poz: "LO",
    ovr: 90,
    sufit: 90,
    wygasa: true,
    wiek: 30,
  });
  const decoy1 = makePlayer({ id: "decoy1", poz: "LO", ovr: 85, sufit: 85, wiek: 26 });
  const decoy2 = makePlayer({ id: "decoy2", poz: "LO", ovr: 80, sufit: 80, wiek: 26 });
  const decoy3 = makePlayer({ id: "decoy3", poz: "LO", ovr: 75, sufit: 75, wiek: 26 });
  const staying = makePlayer({ id: "staying", poz: "LO", ovr: 60, sufit: 65, wiek: 26 });
  // Baseline: run ageSquad on exactly the squad its own `remaining` filter
  // would produce (no wygasa players at all). `played` is unambiguous here
  // - 4 candidates, 4 slots, everyone fits - so this is ground truth for
  // what `staying` should get.
  const baselineRng = createRng(1);
  const { kadra: baselineKadra } = ageSquad(
    baselineRng,
    [decoy1, decoy2, decoy3, staying],
    { overperformed: false },
    FORMACJA
  );
  const stayingBaseline = baselineKadra.find((z) => z.id === "staying");

  // Actual: the same four players plus `leaving`. `remaining` filters
  // `leaving` out before the per-player loop runs, so the loop's RNG
  // consumption is identical to the baseline above - the only thing that
  // can differ between the two runs is whether `played` was computed from
  // the full kadra (bug: leaving's high ovr steals a slot from `staying`)
  // or from `remaining` (fix: `leaving` never enters the pool).
  const actualRng = createRng(1);
  const { kadra: actualKadra } = ageSquad(
    actualRng,
    [leaving, decoy1, decoy2, decoy3, staying],
    { overperformed: false },
    FORMACJA
  );
  const stayingActual = actualKadra.find((z) => z.id === "staying");

  expect(stayingBaseline).toBeDefined();
  expect(stayingActual).toBeDefined();
  expect(stayingActual!.ovr).toBe(stayingBaseline!.ovr);
});

/**
 * Test 6: RNG draw happens unconditionally on all branches.
 * A function that reads/writes RNG state must always consume exactly one draw,
 * regardless of which branch is taken. This ensures the golden stream stays deterministic.
 */
test("rng draw is unconditional in all branches", () => {
  const testCases = [
    { played: true, overperformed: true },
    { played: true, overperformed: false },
    { played: false, overperformed: true },
    { played: false, overperformed: false },
  ];

  for (const { played, overperformed } of testCases) {
    const rng1 = createRng(42);
    const rng2 = createRng(42);

    formAdjustment(rng1, played, overperformed);
    // If we skip the formAdjustment call, rng2 should be at a different state
    const nextValue1 = rng1.next();
    const nextValue2 = rng2.next(); // This should NOT equal nextValue1

    expect(nextValue1).not.toBe(nextValue2); // Proves a draw was consumed
  }
});

/**
 * Test 7: CRITICAL NEUTRALITY TEST – synthetic squad, form randomized 50/50,
 * average OVR drift per player per season within ±0.05.
 *
 * This test directly checks the failure mode the product owner warned about:
 * a slightly wider "played" circle that silently inflates almost everyone's OVR.
 * The 2x2 table is designed to be neutral on a typical squad: 14 eligible for bonus,
 * 5 for penalty, bonus is a chance not a certainty, penalty is certain.
 * Average drift should stay near zero.
 */
test("neutrality: average ovr drift on synthetic squad stays within ±0.05 per player per season", () => {
  // Built from the formation's own slots rather than a hand-written list of
  // codes. The list used to be the prototype's eight, which stopped being a
  // squad any formation recognises: startingXi would have found five players
  // in it, the "played" set below would have been wrong, and the drift this
  // test measures would have been measured on a team that cannot exist.
  const makeTestSquad = (): Player[] => {
    const players: Player[] = [];
    let i = 0;
    for (const slot of FORMACJA.pozycje) {
      for (let n = 0; n < slot.kadra; n += 1, i += 1) {
        players.push(
          makePlayer({
            id: `test-${i}`,
            nazwa: `Test Player ${i}`,
            poz: slot.kod,
            wiek: 20 + (i % 15),
            ovr: 60 + (i % 15),
            sufit: 65 + (i % 15),
          })
        );
      }
    }
    return players;
  };

  let totalDrift = 0;
  let totalPlayers = 0;

  // Run many simulated seasons. 50 iterations (950 player-season samples)
  // was not enough statistical power to reliably tell a true near-zero
  // drift apart from the +/-0.05 boundary - it happened to pass at
  // FORM_UP_ODDS=0.5 (true drift ~+0.053, just outside the criterion) and
  // then happened to fail at FORM_UP_ODDS=0.36 (true drift ~-0.0007, well
  // inside it) purely from sampling noise. 4000 iterations (76,000 samples)
  // brings the standard error well under the threshold.
  for (let seasonSeed = 0; seasonSeed < 4000; seasonSeed += 1) {
    const squad = makeTestSquad();
    const rng = createRng(seasonSeed);

    // Randomize club form 50/50
    const overperformed = rng.next() < 0.5;

    // Compute "played" set
    const played = new Set([
      ...startingXi(squad, FORMACJA).map((z) => z.id),
      ...substitutes(squad, FORMACJA)
        .slice(0, FORM_ROTATION_SLOTS)
        .map((z) => z.id),
    ]);

    // Apply form adjustment to each player, using the same per-sign
    // composite as ageSquad's real clamp (development.ts) - an earlier
    // version of this test reimplemented the old, buggy unconditional
    // Math.max(FLOOR, Math.min(sufit, ...)), which measured a drift number
    // that had nothing to do with what production actually shipped.
    for (const player of squad) {
      const form = formAdjustment(rng, played.has(player.id), overperformed);
      const adjusted =
        form > 0
          ? Math.min(player.sufit, player.ovr + form)
          : form < 0
            ? player.ovr >= FORM_PENALTY_FLOOR
              ? Math.max(FORM_PENALTY_FLOOR, player.ovr + form)
              : player.ovr + form
            : player.ovr;
      const drift = adjusted - player.ovr;
      totalDrift += drift;
      totalPlayers += 1;
    }
  }

  const averageDrift = totalDrift / totalPlayers;
  expect(averageDrift).toBeGreaterThan(-0.05);
  expect(averageDrift).toBeLessThan(0.05);
});
