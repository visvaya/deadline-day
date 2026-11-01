import { expect, test } from "vitest";

import { RATING_OVR_REFERENCE, RATING_OVR_SCALE } from "../../src/data/balance";
import { CLUBS } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import { TEAM_RATINGS } from "../../src/data/team-ratings";
import type { Formation, ImpactSide, Player } from "../../src/data/types";
import { clubRating } from "../../src/logic/league-ratings";
import type { MatchRating } from "../../src/logic/match";
import { createRng } from "../../src/logic/rng";
import {
  baseSquadStrength,
  createSquadFromFormation,
  squadRatings,
  squadStrength,
  startingXi,
  substitutes,
} from "../../src/logic/squad";
import { sideAdjustment } from "../../src/logic/player-impact";
import { selectAnalystProfile } from "../../src/logic/analyst-profile";
import { benchWeight } from "../../src/logic/european-cups";

const FORMACJA = FORMACJE["4-3-3"];

/** A club with no attacking or defensive bias, sitting at the given ovr. The
 * inverse of clubOvr, used so these tests can still talk in ovr terms while
 * the production path takes a rating pair. */
const evenClub = (ovr: number): MatchRating => {
  const r = Math.exp((ovr - RATING_OVR_REFERENCE) / RATING_OVR_SCALE);
  return { attack: r, defence: r };
};

const squadFor = (ovr: number): Player[] =>
  createSquadFromFormation(createRng(0x1234_5678), FORMACJA, evenClub(ovr));

const rate = (kadra: readonly Player[], cup: "LM" | null = null) =>
  squadRatings(kadra, cup, FORMACJA);

test("a mid-table squad lands near the model's league average of 1.00", () => {
  const { attack, defence } = rate(squadFor(65));
  expect(attack).toBeGreaterThan(0.85);
  expect(attack).toBeLessThan(1.15);
  expect(defence).toBeGreaterThan(0.85);
  expect(defence).toBeLessThan(1.15);
});

test("a stronger club rates higher on both sides than a weaker one", () => {
  const strong = rate(squadFor(71));
  const weak = rate(squadFor(60));
  expect(strong.attack).toBeGreaterThan(weak.attack);
  expect(strong.defence).toBeGreaterThan(weak.defence);
});

/** Boosts only players already in the XI. Boosting reserves too would
 * reshuffle the top-six bench and therefore move BOTH ratings, which would
 * make these two tests prove nothing. */
const boostXi = (kadra: readonly Player[], positions: readonly string[]): Player[] => {
  const inXi = new Set(startingXi(kadra, FORMACJA).map((player) => player.id));
  return kadra.map((player) =>
    inXi.has(player.id) && positions.includes(player.poz)
      ? { ...player, ovr: player.ovr + 10 }
      : player
  );
};

test("upgrading only the forwards moves attack far more than defence", () => {
  // LS/PS carry a small 0.15 defence weight under POSITION_WEIGHTS (unlike
  // the old ATK group's flat zero), so defence is no longer untouched - it
  // just moves an order of magnitude less than attack.
  const base = squadFor(65);
  const before = rate(base);
  const after = rate(boostXi(base, ["LS", "N", "PS"]));
  const attackGain = after.attack - before.attack;
  const defenceGain = after.defence - before.defence;
  expect(attackGain).toBeGreaterThan(0);
  expect(defenceGain).toBeGreaterThan(0);
  expect(defenceGain).toBeLessThan(attackGain / 5);
});

test("upgrading only the defence moves defence far more than attack", () => {
  // Likewise LO/PO carry a small 0.15 attack weight, so attack moves a
  // little too - just far less than defence.
  const base = squadFor(65);
  const before = rate(base);
  const after = rate(boostXi(base, ["BR", "LO", "ŚO", "PO"]));
  const attackGain = after.attack - before.attack;
  const defenceGain = after.defence - before.defence;
  expect(defenceGain).toBeGreaterThan(0);
  expect(attackGain).toBeGreaterThan(0);
  expect(attackGain).toBeLessThan(defenceGain / 5);
});

/** Hidden-ceiling rule: ratings drive the visible goals column,
 * so any dependence on sufit would turn that column into a potential
 * indicator and break acceptance criterion 6. */
test("the hidden ceiling has no effect whatsoever on the ratings", () => {
  const base = squadFor(65);
  const tampered = base.map((player) => ({ ...player, sufit: 94 }));
  expect(rate(tampered)).toEqual(rate(base));
});

test("playing in the Champions League weights the bench more heavily", () => {
  const squad = squadFor(68);
  expect(rate(squad, "LM")).not.toEqual(rate(squad));
});

/**
 * The anchor the spec asks for (section 6): a club's starting squad must rate
 * as the club it was built for. Averaged over many seeds so the assertion is
 * about the mapping, not about one lucky squad.
 *
 * The tolerance was 0.15 while squads came from a single scalar `sila`, which
 * could not reproduce a club's attack/defence asymmetry at all - the worst
 * club sat 0.128 off. formationTargetOvr solves for the pair instead, and the
 * measured error over all eighteen clubs and seven formations is 1.2%,
 * entirely from the bench being drawn below the target. Hence 0.03: still a
 * 2.5x margin over the measurement, but five times tighter than before, so a
 * mapping that drifts is caught rather than tolerated.
 */
const RATING_TOLERANCE = 0.03;
const SEEDS = 60;

const anchorFor = (rating: MatchRating, formation: Formation): number => {
  let attack = 0;
  let defence = 0;
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const measured = squadRatings(
      createSquadFromFormation(createRng(seed * 7919 + 1), formation, rating),
      null,
      formation
    );
    attack += measured.attack;
    defence += measured.defence;
  }
  return Math.sqrt((attack / SEEDS) * (defence / SEEDS));
};

test("each preset club's starting squad rates as that club", () => {
  for (const klub of CLUBS) {
    const rating = clubRating(klub);
    const ours = anchorFor(rating, FORMACJA);
    const theirs = Math.sqrt(rating.attack * rating.defence);
    expect(
      Math.abs(ours - theirs),
      `${klub.shortName}: ${ours.toFixed(3)} vs ${theirs.toFixed(3)}`
    ).toBeLessThan(RATING_TOLERANCE);
  }
});

test("the anchor holds whichever formation a career draws", () => {
  // A career picks its formation at random, so the mapping has to hold for
  // all seven - not just the one the tests above happen to use.
  const rating = clubRating(CLUBS[0]!);
  const theirs = Math.sqrt(rating.attack * rating.defence);
  for (const formation of Object.values(FORMACJE)) {
    expect(Math.abs(anchorFor(rating, formation) - theirs), formation.id).toBeLessThan(
      RATING_TOLERANCE
    );
  }
});

test("the league spans the same range of ratings the model does", () => {
  // Measured 2026-08-14: both span a ratio of 1.36 between the best and worst
  // club. This is the assertion that would have caught a mapping scaled
  // wrongly - the per-club test above tolerates a uniform stretch, this one
  // does not.
  const modelRatings = TEAM_RATINGS.clubs.map((club) => Math.sqrt(club.attack * club.defence));
  const modelRatio = Math.max(...modelRatings) / Math.min(...modelRatings);

  const gameRatings = CLUBS.map((klub) => {
    const rating = squadRatings(
      createSquadFromFormation(createRng(1), FORMACJA, clubRating(klub)),
      null,
      FORMACJA
    );
    return Math.sqrt(rating.attack * rating.defence);
  });
  const gameRatio = Math.max(...gameRatings) / Math.min(...gameRatings);

  expect(gameRatio).toBeGreaterThan(modelRatio * 0.85);
  expect(gameRatio).toBeLessThan(modelRatio * 1.15);
});

// Integration tests for per-player market-edge impact on squad ratings.
//
// These used to compare "unsigned squad" against "one player flipped to
// moj: true". That comparison no longer exists: every player carries his
// edge, so there is no edge-free squad to compare against. The mechanism is
// probed instead by swapping one player for a clone with the same position,
// ovr and age but a different identity - and therefore a different edge.

/** A clone of `player` under a new identity whose profile lands on `side`,
 * with a market edge satisfying `wants`. Position, ovr and age are untouched,
 * so weightedOvr cannot move and any rating shift must come from the edge. */
const cloneWithEdge = (
  player: Player,
  side: ImpactSide,
  wants: (_edge: number) => boolean
): Player | null => {
  for (let i = 0; i < 4000; i += 1) {
    const candidate = { ...player, id: `${player.id}-clone-${i}` };
    const profile = selectAnalystProfile(candidate);
    if (profile.impactSide === side && wants(profile.marketEdge)) return candidate;
  }
  return null;
};

test("baseSquadStrength never sees the market edge", () => {
  // The analyst context is computed from baseSquadStrength precisely so the
  // hidden edge cannot feed back into the report that reveals it. Two squads
  // with identical positions, ovrs and ages but different identities must
  // therefore agree here and disagree in squadStrength.
  const base = squadFor(65);
  const renamed = base.map((player, index) => ({ ...player, id: `renamed-${index}` }));

  expect(baseSquadStrength(renamed, null, FORMACJA)).toBe(baseSquadStrength(base, null, FORMACJA));
  expect(squadStrength(renamed, null, FORMACJA)).not.toBe(squadStrength(base, null, FORMACJA));
});

test("swapping in a stronger edge moves only the side that edge belongs to", () => {
  const base = squadFor(65);
  const xi = startingXi(base, FORMACJA);

  let original: Player | null = null;
  let replacement: Player | null = null;
  let side: ImpactSide = "attack";

  for (const player of xi) {
    const profile = selectAnalystProfile(player);
    const candidate = cloneWithEdge(player, profile.impactSide, (e) => e > profile.marketEdge);
    if (candidate) {
      original = player;
      replacement = candidate;
      side = profile.impactSide;
      break;
    }
  }

  expect(original).not.toBeNull();
  expect(replacement).not.toBeNull();
  if (!original || !replacement) return;

  const swapped = base.map((p) => (p.id === original.id ? replacement : p));
  const before = squadRatings(base, null, FORMACJA);
  const after = squadRatings(swapped, null, FORMACJA);

  const other: ImpactSide = side === "attack" ? "defence" : "attack";
  expect(after[side]).toBeGreaterThan(before[side]);
  expect(after[other]).toBe(before[other]);
});

test("swapping in a weaker edge lowers only the side that edge belongs to", () => {
  const base = squadFor(68);
  const xi = startingXi(base, FORMACJA);

  let original: Player | null = null;
  let replacement: Player | null = null;
  let side: ImpactSide = "attack";

  for (const player of xi) {
    const profile = selectAnalystProfile(player);
    const candidate = cloneWithEdge(player, profile.impactSide, (e) => e < profile.marketEdge);
    if (candidate) {
      original = player;
      replacement = candidate;
      side = profile.impactSide;
      break;
    }
  }

  expect(original).not.toBeNull();
  expect(replacement).not.toBeNull();
  if (!original || !replacement) return;

  const swapped = base.map((p) => (p.id === original.id ? replacement : p));
  const before = squadRatings(base, null, FORMACJA);
  const after = squadRatings(swapped, null, FORMACJA);

  const other: ImpactSide = side === "attack" ? "defence" : "attack";
  expect(after[side]).toBeLessThan(before[side]);
  expect(after[other]).toBe(before[other]);
});

test("squadStrength applies exactly half the sum of side adjustments, not a quarter", () => {
  const squad = squadFor(65);
  const xi = startingXi(squad, FORMACJA);
  const bench = substitutes(squad, FORMACJA).slice(0, 6);
  const weight = benchWeight(null);

  const halfSum = (players: readonly Player[]): number =>
    (sideAdjustment([...players], "attack") + sideAdjustment([...players], "defence")) / 2;

  const expectedTotalAdj = halfSum(xi) * weight.xi + halfSum(bench) * weight.bench;
  const actualChange =
    squadStrength(squad, null, FORMACJA) - baseSquadStrength(squad, null, FORMACJA);

  // Not a tautology: the adjustment is non-zero, so a quarter-weighting or a
  // dropped bench term would land somewhere else.
  expect(expectedTotalAdj).not.toBe(0);
  expect(actualChange).toBeCloseTo(expectedTotalAdj, 6);
});
