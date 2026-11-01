import {
  AGE_STRENGTH_SLOPE,
  POSITION_WEIGHTS,
  RATING_OVR_REFERENCE,
  RATING_OVR_SCALE,
} from "../data/balance";
import { TEAM_RATINGS } from "../data/team-ratings";
import type { Formation, PositionCode } from "../data/types";
import type { MatchRating } from "./match";

/**
 * The ovr each position of this formation must average for the squad to
 * measure back as this club.
 *
 * NOT a plain inversion of squadRatings. That function takes a weighted MEAN
 * of ovr on each side before exponentiating, and positions carrying both
 * weights (ŚP at 0.5/0.5, CLS at 0.4/0.6) therefore feed part of the defence
 * into the attack figure and vice versa. Building a squad from
 * R + S*ln(attack^a * defence^d) leaves a lopsided club measuring back at
 * roughly half its real spread - 0.98/0.895 instead of 1.03/0.87 for Wisła
 * Kraków, depending on the formation.
 *
 * Solving for it instead: with the per-side weight sums over the starting
 * eleven, the two measured logs are a linear function of the two target
 * logs, so inverting one 2x2 system gives targets that reproduce the club
 * exactly. The determinant never vanishes because every formation fields
 * both a pure defender (BR, attack weight 0) and a pure attacker (N, weight
 * 1), so the two weight vectors are never proportional.
 */
export const formationTargetOvr = (
  formation: Formation,
  rating: MatchRating
): Map<PositionCode, number> => {
  let sumA = 0;
  let sumD = 0;
  let sumAA = 0;
  let sumDD = 0;
  let sumAD = 0;
  for (const kod of formation.kolejnoscXi) {
    const { attack, defence } = POSITION_WEIGHTS[kod];
    sumA += attack;
    sumD += defence;
    sumAA += attack * attack;
    sumDD += defence * defence;
    sumAD += attack * defence;
  }

  const m11 = sumAA / sumA;
  const m12 = sumAD / sumA;
  const m21 = sumAD / sumD;
  const m22 = sumDD / sumD;
  const det = m11 * m22 - m12 * m21;
  if (Math.abs(det) < 1e-9) {
    throw new Error(`formationTargetOvr: ${formation.id} has degenerate position weights`);
  }

  const lnAttack = Math.log(rating.attack);
  const lnDefence = Math.log(rating.defence);
  const x = (lnAttack * m22 - m12 * lnDefence) / det;
  const y = (m11 * lnDefence - lnAttack * m21) / det;

  const targets = new Map<PositionCode, number>();
  for (const slot of formation.pozycje) {
    const { attack, defence } = POSITION_WEIGHTS[slot.kod];
    targets.set(slot.kod, RATING_OVR_REFERENCE + RATING_OVR_SCALE * (attack * x + defence * y));
  }
  return targets;
};

/** Geometric mean of the league's ratings, computed once from the snapshot
 * so the reference moves with the data rather than being pinned to 1.00. */
const LEAGUE_MEAN_RATING =
  TEAM_RATINGS.clubs.reduce((total, club) => total + Math.sqrt(club.attack * club.defence), 0) /
  TEAM_RATINGS.clubs.length;

/**
 * Years to add to a starting squad's age draw, from the club's strength.
 * Weaker clubs field older squads: they cannot afford young talent and
 * patch the side with free agents.
 *
 * Clamped to one year either way. See AGE_STRENGTH_SLOPE for why the
 * measured spread is far smaller than the raw age table suggests.
 */
export const ageShiftFor = (rating: MatchRating): number => {
  const own = Math.sqrt(rating.attack * rating.defence);
  const shift = Math.round(AGE_STRENGTH_SLOPE * (LEAGUE_MEAN_RATING - own));
  return Math.max(-1, Math.min(1, shift));
};
