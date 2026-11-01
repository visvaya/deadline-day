import {
  AGE_PROFILE_DEFAULT,
  AGE_PROFILES,
  HAGGLE_SALE_BONUS,
  MAX_DOMESTIC_FEE,
  MAX_FOREIGN_FEE,
  MAX_UNHAGGLED_FOREIGN_FEE,
  MIN_MARKET_VALUE,
} from "../src/data/balance";
import { RYNEK_OPIS } from "../src/data/market-states";
import { softCapForeignOfferWithParams } from "../src/logic/transfer-fees";
import type { AgeProfile } from "../src/data/balance";
import { at } from "../src/logic/invariant";

/**
 * The value curve as the spec's chapters 5.1 and 5.1a define it, fitted
 * outside the game and never read by it.
 *
 * Two normalisations matter and both are here rather than in the search:
 * ageOvrShift(peakStart) = 0 removes the shift/midpoint degeneracy - adding
 * a constant to every shift and to the midpoint describes the same curve -
 * and the anchors are expressed in years relative to the position's own peak,
 * so a keeper and a winger of the same age sit in different places on it.
 */
export type ValueCurveParams = {
  vmax: 13;
  slope: number;
  midpoint: number;
  /** Shift at peakStart - 5, the youngest anchor. */
  youngShift: number;
  /** Shift at peakEnd. Negative: value falls through the prime band. */
  peakEndShift: number;
  latePlusThreeShift: number;
  latePlusSixShift: number;
};

type Anchor = { age: number; shift: number };

const anchorsFor = (profile: AgeProfile, params: ValueCurveParams): Anchor[] => [
  { age: profile.peakStart - 5, shift: params.youngShift },
  { age: profile.peakStart, shift: 0 },
  { age: profile.peakEnd, shift: params.peakEndShift },
  { age: profile.peakEnd + 3, shift: params.latePlusThreeShift },
  { age: profile.peakEnd + 6, shift: params.latePlusSixShift },
];

/** Piecewise linear between the anchors, flat beyond the outermost ones. */
export const ageOvrShift = (age: number, profile: AgeProfile, params: ValueCurveParams): number => {
  const anchors = anchorsFor(profile, params);
  const first = at(anchors, 0, "first value-curve anchor");
  const last = at(anchors, anchors.length - 1, "last value-curve anchor");
  if (age <= first.age) return first.shift;
  if (age >= last.age) return last.shift;
  for (let i = 1; i < anchors.length; i += 1) {
    const lo = at(anchors, i - 1, "value-curve anchor");
    const hi = at(anchors, i, "value-curve anchor");
    if (age > hi.age) continue;
    const t = (age - lo.age) / (hi.age - lo.age);
    return lo.shift + t * (hi.shift - lo.shift);
  }
  return last.shift;
};

export const marketValueAt = (
  ovr: number,
  age: number,
  profile: AgeProfile,
  params: ValueCurveParams
): number => {
  const x = (ovr + ageOvrShift(age, profile, params) - params.midpoint) / params.slope;
  return Math.max(MIN_MARKET_VALUE, params.vmax / (1 + Math.exp(-x)));
};

export const DEFAULT_PROFILE = AGE_PROFILE_DEFAULT;

/** Every profile the game can hand the curve, not just the default one: the
 * yearly-drop bound is a property of the anchor spacing, and that spacing is
 * what a position's own peak band changes. */
export const VALIDATION_PROFILES: AgeProfile[] = [DEFAULT_PROFILE, ...Object.values(AGE_PROFILES)];

export const PRICE_ANCHORS = [
  { ovr: 70, age: 25, target: 0.73 },
  { ovr: 78, age: 26, target: 2.51 },
  { ovr: 85, age: 24, target: 5.45 },
  { ovr: 90, age: 22, target: 7.75 },
] as const;

/** Ratios at ovr 70, relative to peakStart. Spec chapter 5.1a. */
export const AGE_RATIO_BANDS = [
  { at: (p: AgeProfile) => p.peakStart - 5, label: "19/peakStart", min: 1.9, max: 2.3 },
  { at: (p: AgeProfile) => p.peakEnd, label: "peakEnd/peakStart", min: 0.55, max: 0.7 },
  { at: (p: AgeProfile) => p.peakEnd + 3, label: "peakEnd+3", min: 0.28, max: 0.4 },
  { at: (p: AgeProfile) => p.peakEnd + 6, label: "peakEnd+6", min: 0.12, max: 0.2 },
] as const;

const MAX_YEARLY_DROP = 0.2;
const MEDIAN_ANCHOR_ERROR = 0.15;
const WORST_ANCHOR_ERROR = 0.25;
const TOP_ANCHOR_CEILING = 9.0;

export const violations = (params: ValueCurveParams): string[] => {
  const out: string[] = [];
  const profile = DEFAULT_PROFILE;
  if (!Object.values(params).every(Number.isFinite) || params.vmax !== 13 || params.slope <= 0) {
    return ["invalid finite parameters, fixed vmax or positive slope"];
  }

  const errors = PRICE_ANCHORS.map(
    (a) => Math.abs(marketValueAt(a.ovr, a.age, profile, params) - a.target) / a.target
  );
  const sorted = [...errors].sort((a, b) => a - b);
  const median = (at(sorted, 1, "anchor error") + at(sorted, 2, "anchor error")) / 2;
  if (median > MEDIAN_ANCHOR_ERROR) out.push(`median anchor error ${(median * 100).toFixed(1)}%`);
  const worst = Math.max(...errors);
  if (worst > WORST_ANCHOR_ERROR) out.push(`worst anchor error ${(worst * 100).toFixed(1)}%`);
  const top = marketValueAt(90, 22, profile, params);
  if (top > TOP_ANCHOR_CEILING) out.push(`90/22 value ${top.toFixed(2)} over the 9.0 ceiling`);

  const reference = marketValueAt(70, profile.peakStart, profile, params);
  for (const band of AGE_RATIO_BANDS) {
    const ratio = marketValueAt(70, band.at(profile), profile, params) / reference;
    if (ratio < band.min || ratio > band.max) {
      out.push(`${band.label} ratio ${ratio.toFixed(2)} outside ${band.min}-${band.max}`);
    }
  }

  // Check the shift, not the floored price: a veteran may cost exactly 0.05.
  // For a yearly shift loss d >= 0, the sigmoid's value ratio is at least
  // exp(-d / slope), for every OVR. Applying the floor only reduces loss.
  // Segment slopes also cover years straddling an anchor by convexity.
  for (const p of VALIDATION_PROFILES) {
    const anchors = anchorsFor(p, params);
    for (let i = 1; i < anchors.length; i += 1) {
      const lo = at(anchors, i - 1, "value-curve anchor");
      const hi = at(anchors, i, "value-curve anchor");
      const yearlyShiftLoss = (lo.shift - hi.shift) / (hi.age - lo.age);
      if (i >= 2 && yearlyShiftLoss <= 0) {
        out.push(`shift not strictly decreasing at peak ${p.peakStart}/${p.peakEnd}`);
      }
      if (yearlyShiftLoss / params.slope > -Math.log(1 - MAX_YEARLY_DROP)) {
        out.push(`yearly drop bound exceeded at peak ${p.peakStart}/${p.peakEnd}, segment ${i}`);
      }
    }
  }

  return out;
};

export type SearchRange = {
  vmax: readonly 13[];
  slope: readonly number[];
  midpoint: readonly number[];
  youngShift: readonly number[];
  peakEndShift: readonly number[];
  latePlusThreeShift: readonly number[];
  latePlusSixShift: readonly number[];
};

/** Wide on purpose: the point of the sweep is to prove the region is not
 * empty, so a range narrowed to the answer we expect would prove nothing. */
export const SEARCH_RANGE: SearchRange = {
  vmax: [13],
  slope: [5.8, 6.2, 6.6, 7.0, 7.4],
  midpoint: [86.4, 87.0, 87.6, 88.2, 88.8],
  youngShift: [4.4, 4.8, 5.2, 5.6, 6.0],
  peakEndShift: [-2.4, -2.7, -3.0, -3.3, -3.6],
  latePlusThreeShift: [-6.6, -6.9, -7.2, -7.5, -7.8],
  latePlusSixShift: [-10.8, -11.1, -11.4, -11.7, -12.0],
};

export const feasibleSets = (range: SearchRange): ValueCurveParams[] => {
  const found: ValueCurveParams[] = [];
  for (const vmax of range.vmax) {
    for (const slope of range.slope) {
      for (const midpoint of range.midpoint) {
        for (const youngShift of range.youngShift) {
          for (const peakEndShift of range.peakEndShift) {
            for (const latePlusThreeShift of range.latePlusThreeShift) {
              for (const latePlusSixShift of range.latePlusSixShift) {
                const candidate: ValueCurveParams = {
                  vmax,
                  slope,
                  midpoint,
                  youngShift,
                  peakEndShift,
                  latePlusThreeShift,
                  latePlusSixShift,
                };
                if (violations(candidate).length === 0) found.push(candidate);
              }
            }
          }
        }
      }
    }
  }
  return found;
};

// All three come from balance.ts now that the fee ceilings are activated:
// the fitting tool must scan against the same numbers the game plays with.
export { MAX_DOMESTIC_FEE, MAX_FOREIGN_FEE, MAX_UNHAGGLED_FOREIGN_FEE };

/** Tiers as chapter 9.2 defines them: a spending ceiling and the offer
 * ceiling that leaves room for a full successful haggle. */
export const FOREIGN_TIERS = [
  { name: "high", buyerFactor: 1.15, maxSpend: 7 },
  { name: "very-high", buyerFactor: 1.2, maxSpend: 9 },
  { name: "legendary", buyerFactor: 1.25, maxSpend: MAX_FOREIGN_FEE },
] as const;

/** The scanning face of the game's own kernel: the knee is what this tool
 * fits, so it stays a parameter here while the production wrapper pins it. No
 * second copy of the arithmetic - that is how the two would come to disagree
 * about the curve the fit chose. */
export const softCapForeignOffer = (rawFee: number, knee: number): number =>
  softCapForeignOfferWithParams(rawFee, knee, MAX_UNHAGGLED_FOREIGN_FEE);

const PRICE_DEVIATION = [0.9, 1.1] as const;
const MARKET_EMPTY = RYNEK_OPIS.pusty.mnoznikCeny;

export type QualifiedSpread = {
  low: number;
  high: number;
  spread: number;
  visibleSpread: number;
  relative: number;
  tiers: { name: string; low: number; high: number }[];
};

export const qualifiedSpread = (
  base: number,
  knee: number,
  marketMultiplier: number
): QualifiedSpread => {
  if (
    !Number.isFinite(base) ||
    base <= 0 ||
    !Number.isFinite(marketMultiplier) ||
    marketMultiplier <= 0
  ) {
    throw new Error("invalid offer factors");
  }
  const tiers = FOREIGN_TIERS.flatMap((tier) => {
    const multiplier = base * marketMultiplier * tier.buyerFactor;
    const low = softCapForeignOffer(multiplier * PRICE_DEVIATION[0], knee);
    const maxOffer = tier.maxSpend / (1 + HAGGLE_SALE_BONUS);
    if (low > maxOffer) return [];
    // The cap is continuous and increasing, so the feasible deviation set
    // is an interval. min below computes its image, not a clipped offer.
    const high = Math.min(softCapForeignOffer(multiplier * PRICE_DEVIATION[1], knee), maxOffer);
    return [{ name: tier.name, low, high }];
  });
  // Defensive against a future tier retune, not reachable today: the
  // legendary ceiling equals the unhaggled asymptote the soft cap stays
  // below, so the richest buyer can always afford the capped offer.
  if (tiers.length === 0) throw new Error("no qualified foreign tier");
  const low = Math.min(...tiers.map((tier) => tier.low));
  const high = Math.max(...tiers.map((tier) => tier.high));
  const visibleLow = Number(low.toFixed(2));
  const visibleHigh = Number(high.toFixed(2));
  const visibleSpread = (Math.round(visibleHigh * 100) - Math.round(visibleLow * 100)) / 100;
  return {
    low,
    high,
    spread: high - low,
    visibleSpread,
    relative: visibleSpread / ((visibleHigh + visibleLow) / 2),
    tiers,
  };
};

export const spreadPasses = (spread: QualifiedSpread): boolean =>
  spread.tiers.length >= 2 ? spread.relative >= 0.05 : spread.visibleSpread >= 0.15;

/**
 * The spread a player actually sees at the top of the market, measured over
 * the offers that can be made rather than over every tier's arithmetic. Only
 * tiers whose maxOffer covers the offer qualify, so at the top the buyer set
 * collapses to one and buyerFactor stops varying.
 */
export const topAnchorSpread = (params: ValueCurveParams, knee: number): QualifiedSpread => {
  const base = marketValueAt(90, 22, DEFAULT_PROFILE, params);
  return qualifiedSpread(base, knee, MARKET_EMPTY);
};

export const feasibleKnees = (params: ValueCurveParams): number[] => {
  const out: number[] = [];
  const bases = [
    marketValueAt(85, 24, DEFAULT_PROFILE, params),
    marketValueAt(90, 22, DEFAULT_PROFILE, params),
  ];
  for (let cents = MAX_DOMESTIC_FEE * 100; cents < MAX_UNHAGGLED_FOREIGN_FEE * 100; cents += 5) {
    const knee = cents / 100;
    if (bases.every((base) => spreadPasses(qualifiedSpread(base, knee, MARKET_EMPTY)))) {
      out.push(knee);
    }
  }
  return out;
};

const anchorCost = (params: ValueCurveParams): number =>
  PRICE_ANCHORS.reduce((sum, a) => {
    const error = (marketValueAt(a.ovr, a.age, DEFAULT_PROFILE, params) - a.target) / a.target;
    return sum + error * error;
  }, 0);

export type FeasibleCurve = { params: ValueCurveParams; knees: number[] };

/** Feasibility includes the knee BEFORE minimising the anchor loss. */
export const feasibleJointSets = (range: SearchRange): FeasibleCurve[] =>
  feasibleSets(range).flatMap((params) => {
    const knees = feasibleKnees(params);
    return knees.length === 0 ? [] : [{ params, knees }];
  });

/** The optimum is over the declared discrete grid, not all real parameters.
 * Anchor loss is primary; among equally good knees prefer the spec's 6.0
 * reference, then the smaller knee. Curve ties keep enumeration order. */
export const bestFit = (
  joint: readonly FeasibleCurve[]
): { params: ValueCurveParams; knee: number } => {
  const candidates = joint.filter((candidate) => candidate.knees.length > 0);
  if (candidates.length === 0) {
    throw new Error("no jointly feasible parameter set in the declared grid");
  }
  let best = at(candidates, 0, "first feasible candidate");
  let bestCost = anchorCost(best.params);
  for (const candidate of candidates.slice(1)) {
    const cost = anchorCost(candidate.params);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  const knees = [...best.knees].sort((a, b) => Math.abs(a - 6) - Math.abs(b - 6) || a - b);
  return { params: best.params, knee: at(knees, 0, "best knee") };
};

/**
 * Every amount the spec quotes, computed from the fitted parameters. The
 * spec says the tool is the source of these numbers rather than the prose,
 * because hand-copied examples drifted twice: once when the buyer factor
 * narrowed the multiplier, once when a base was rounded to a value the
 * parameters do not produce.
 */
export const canonicalExamples = (
  params: ValueCurveParams,
  knee: number
): Record<string, number> => {
  const topAnchorBase = marketValueAt(90, 22, DEFAULT_PROFILE, params);
  const spread = topAnchorSpread(params, knee);
  const midAnchorBase = marketValueAt(85, 24, DEFAULT_PROFILE, params);
  const midSpread = qualifiedSpread(midAnchorBase, knee, MARKET_EMPTY);
  const reference = marketValueAt(70, DEFAULT_PROFILE.peakStart, DEFAULT_PROFILE, params);
  const next = (ovr: number) =>
    marketValueAt(ovr, DEFAULT_PROFILE.peakStart + 1, DEFAULT_PROFILE, params);
  const anchorEntries = PRICE_ANCHORS.flatMap((anchor) => {
    const value = marketValueAt(anchor.ovr, anchor.age, DEFAULT_PROFILE, params);
    const key = `anchor${anchor.ovr}Age${anchor.age}`;
    return [
      [key, value],
      [`${key}SignedError`, (value - anchor.target) / anchor.target],
    ] as const;
  });
  const ageEntries = AGE_RATIO_BANDS.map(
    (band) =>
      [
        band.label,
        marketValueAt(70, band.at(DEFAULT_PROFILE), DEFAULT_PROFILE, params) / reference,
      ] as const
  );
  const yearlyBounds = VALIDATION_PROFILES.flatMap((profile) => {
    const anchors = anchorsFor(profile, params);
    return anchors.slice(1).map((hi, i) => {
      const lo = at(anchors, i, "value-curve anchor");
      return 1 - Math.exp(-(lo.shift - hi.shift) / (hi.age - lo.age) / params.slope);
    });
  });
  const anchorErrors = PRICE_ANCHORS.map(
    (a) => Math.abs(marketValueAt(a.ovr, a.age, DEFAULT_PROFILE, params) - a.target) / a.target
  );
  const sortedErrors = [...anchorErrors].sort((a, b) => a - b);
  return {
    ...Object.fromEntries(anchorEntries),
    ...Object.fromEntries(ageEntries),
    medianAnchorError:
      (at(sortedErrors, 1, "anchor error") + at(sortedErrors, 2, "anchor error")) / 2,
    worstAnchorError: Math.max(...anchorErrors),
    lowerTail58Age25: marketValueAt(58, 25, DEFAULT_PROFILE, params),
    peakMinusTwoRatio:
      marketValueAt(70, DEFAULT_PROFILE.peakStart - 2, DEFAULT_PROFILE, params) / reference,
    worstYearlyDropBound: Math.max(...yearlyBounds),
    primeNeutralOvrGain:
      -params.peakEndShift / (DEFAULT_PROFILE.peakEnd - DEFAULT_PROFILE.peakStart),
    primeSameOvrChange: next(70) / reference - 1,
    primePlusOneOvrChange: next(71) / reference - 1,
    primeMinusOneOvrChange: next(69) / reference - 1,
    topAnchorBase,
    midAnchorBase,
    topLegendaryRawLow: topAnchorBase * MARKET_EMPTY * 1.25 * PRICE_DEVIATION[0],
    topLegendaryRawHigh: topAnchorBase * MARKET_EMPTY * 1.25 * PRICE_DEVIATION[1],
    softCappedLow: spread.low,
    softCappedHigh: spread.high,
    afterHaggleLow: spread.low * (1 + HAGGLE_SALE_BONUS),
    afterHaggleHigh: spread.high * (1 + HAGGLE_SALE_BONUS),
    spreadAbsolute: spread.spread,
    spreadVisible: spread.visibleSpread,
    spreadRelative: spread.relative,
    midOfferHigh: midSpread.high,
    baseGrowthMidToTop: topAnchorBase / midAnchorBase - 1,
    offerGrowthMidToTop: spread.high / midSpread.high - 1,
  };
};

/** The two upper anchors, with the tiers that can actually pay for them.
 * The report prints this table; the fit uses feasibleKnees, which asks the
 * same question through spreadPasses. */
export const upperAnchorSpreads = (
  params: ValueCurveParams,
  knee: number
): { label: string; base: number; spread: QualifiedSpread; passes: boolean }[] =>
  [
    { label: "85/24", base: marketValueAt(85, 24, DEFAULT_PROFILE, params) },
    { label: "90/22", base: marketValueAt(90, 22, DEFAULT_PROFILE, params) },
  ].map(({ label, base }) => {
    const spread = qualifiedSpread(base, knee, MARKET_EMPTY);
    return { label, base, spread, passes: spreadPasses(spread) };
  });

export const MARKET_EMPTY_MULTIPLIER = MARKET_EMPTY;
export const PRICE_DEVIATION_BAND = PRICE_DEVIATION;
export const CONSTRAINT_THRESHOLDS = {
  minMarketValue: MIN_MARKET_VALUE,
  maxYearlyDrop: MAX_YEARLY_DROP,
  medianAnchorError: MEDIAN_ANCHOR_ERROR,
  worstAnchorError: WORST_ANCHOR_ERROR,
  topAnchorCeiling: TOP_ANCHOR_CEILING,
  minVisibleSpread: 0.15,
  minRelativeSpread: 0.05,
} as const;

/** Bumped when the fitted numbers can change: a constraint, a threshold, the
 * grid, or the curve itself. The pinned report carries it so a stale file is
 * recognisable without rerunning the tool. */
export const FIT_TOOL_VERSION = "1.0.0";
