import {
  CAREER_HANDICAP_ANCHORS,
  type CareerHandicapAnchor,
} from "../data/career-handicap-anchors";
import { initialEuropeanBerth } from "../data/european-berths-2026";
import type { CareerBaseline } from "../data/types";
import { advantageScoreFor } from "./club-projection";
import { initialClubProjection } from "./league-projection";
import { at } from "./invariant";

// CareerBaseline itself lives in data/types.ts (a dependency leaf) - see
// that file for its documentation. This module owns the function that
// builds and freezes one, not the shape itself.

/** Anchors sorted from the greatest advantage to the least - the order the
 * generated file already carries them in, re-asserted here rather than
 * re-sorted, so a change to the generator's own order is caught rather than
 * silently tolerated. */
const ANCHORS_DESCENDING: readonly CareerHandicapAnchor[] = CAREER_HANDICAP_ANCHORS;

if (ANCHORS_DESCENDING.length === 0) {
  throw new Error("career-baseline: CAREER_HANDICAP_ANCHORS is empty");
}

ANCHORS_DESCENDING.reduce((prev, curr) => {
  if (prev.advantageScore <= curr.advantageScore) {
    throw new Error(
      "career-baseline: CAREER_HANDICAP_ANCHORS is not sorted from the greatest advantage to the least"
    );
  }
  return curr;
});

/**
 * Piecewise-linear interpolation across the three frozen anchors, constant
 * beyond the extreme ones: a club more advantaged than the old `latwy` pool
 * ever was gets exactly `latwy`'s handicap, not an extrapolated negative
 * one, and symmetrically below `trudny`.
 */
const interpolateHandicap = (
  advantageScore: number,
  valueOf: (_anchor: CareerHandicapAnchor) => number
): number => {
  if (!Number.isFinite(advantageScore)) {
    throw new Error(`interpolateHandicap: advantageScore must be finite, got ${advantageScore}`);
  }
  const anchors = ANCHORS_DESCENDING;
  const highest = at(anchors, 0, "career handicap anchors: highest");
  const lowest = at(anchors, anchors.length - 1, "career handicap anchors: lowest");
  if (advantageScore >= highest.advantageScore) return valueOf(highest);
  if (advantageScore <= lowest.advantageScore) return valueOf(lowest);

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const upper = at(anchors, i, "career handicap anchors: upper segment"); // greater advantage, on this segment
    const lower = at(anchors, i + 1, "career handicap anchors: lower segment"); // lesser advantage
    if (advantageScore <= upper.advantageScore && advantageScore >= lower.advantageScore) {
      const span = upper.advantageScore - lower.advantageScore;
      // span is strictly positive here: the sort check above rules out a
      // tie, and the two boundary cases above already handled the ends.
      const t = (upper.advantageScore - advantageScore) / span;
      return valueOf(upper) + t * (valueOf(lower) - valueOf(upper));
    }
  }
  // Unreachable: the two boundary checks and the loop's bracket together
  // cover every real number.
  throw new Error(
    `interpolateHandicap: advantageScore ${advantageScore} fell through every segment`
  );
};

/** The tenure handicap a club's `advantageScore` implies, interpolated
 * between the three frozen anchors and constant beyond them. */
export const tenureHandicapFor = (advantageScore: number): number =>
  interpolateHandicap(advantageScore, (anchor) => anchor.tenureHandicap);

/** The legacy handicap a club's `advantageScore` implies, same
 * interpolation as `tenureHandicapFor` over the same three anchors. */
export const legacyHandicapFor = (advantageScore: number): number =>
  interpolateHandicap(advantageScore, (anchor) => anchor.legacyHandicap);

/**
 * Builds and freezes the career baseline for a chosen club: its sporting
 * projection, its internal advantage score, the two handicaps that score
 * implies, and the European cup (if any) it starts the first season in.
 *
 * Deliberately carries `baselineExpectedSeasonPoints` and not an
 * `expectedPlace` - a place is relative to who else is in the league that
 * season, which a frozen baseline has no business re-deriving later, while
 * a points total is a property of the club alone at the moment of freezing.
 */
export const buildCareerBaseline = (clubId: string): CareerBaseline => {
  const advantageScore = advantageScoreFor(clubId);
  return {
    clubId,
    baselineExpectedSeasonPoints: initialClubProjection(clubId).expectedSeasonPoints,
    advantageScore,
    tenureHandicap: tenureHandicapFor(advantageScore),
    legacyHandicap: legacyHandicapFor(advantageScore),
    initialEuropeanCup: initialEuropeanBerth(clubId)?.cup ?? null,
  };
};
