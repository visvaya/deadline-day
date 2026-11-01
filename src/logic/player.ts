import type { Player, PlayerType, PositionCode } from "../data/types";
import { IMIONA, NAZWISKA, OBCE } from "../data/name-pools";
import {
  ACADEMY_CEILING_CLUB_FACTOR,
  ACADEMY_CEILING_CLUB_REFERENCE,
  AGE_PROFILES,
  MARKET_VALUE_AGE_SHIFTS,
  MARKET_VALUE_MAX,
  MARKET_VALUE_MIDPOINT,
  MARKET_VALUE_SLOPE,
  MIN_MARKET_VALUE,
  OFFER_SOURCE_CLUB_FACTOR,
  OFFER_SOURCE_CLUB_REFERENCE,
  RETIREMENT_OVR,
  STARTING_BENCH_OVR_BONUS,
  STARTING_SQUAD_BENCH_AGE_BANDS,
  STARTING_SQUAD_HEADROOM,
  STARTING_SQUAD_XI_AGE,
  STARTING_XI_OVR_BONUS,
} from "../data/balance";
import { pick, randInt, rand, type Rng } from "./rng";
import { selectPotentialSpread } from "../data/potential-variance";
import { at } from "./invariant";

/**
 * Age as an ovr shift, measured in years relative to the POSITION's own peak
 * band rather than in absolute years.
 *
 * Piecewise linear between the five anchors of `MARKET_VALUE_AGE_SHIFTS` and
 * flat outside the outermost two, so no birthday is a cliff and a player far
 * outside the band is not extrapolated into nonsense.
 *
 * Reads `poz` and `wiek`, both of which the player can see. It cannot leak
 * the hidden ceiling: `createPlayer` draws `sufit` independently of `poz`,
 * which is the same argument that already legalises the potential arrow.
 */
export const ageOvrShift = (age: number, pos: PositionCode): number => {
  const profile = AGE_PROFILES[pos];
  type Anchor = { readonly age: number; readonly shift: number };
  const young: Anchor = { age: profile.peakStart - 5, shift: MARKET_VALUE_AGE_SHIFTS.young };
  const peakStart: Anchor = { age: profile.peakStart, shift: MARKET_VALUE_AGE_SHIFTS.peakStart };
  const peakEnd: Anchor = { age: profile.peakEnd, shift: MARKET_VALUE_AGE_SHIFTS.peakEnd };
  const latePlusThree: Anchor = {
    age: profile.peakEnd + 3,
    shift: MARKET_VALUE_AGE_SHIFTS.latePlusThree,
  };
  const latePlusSix: Anchor = {
    age: profile.peakEnd + 6,
    shift: MARKET_VALUE_AGE_SHIFTS.latePlusSix,
  };
  const anchors: readonly Anchor[] = [young, peakStart, peakEnd, latePlusThree, latePlusSix];
  const first = young;
  const last = latePlusSix;
  if (age <= first.age) return first.shift;
  if (age >= last.age) return last.shift;
  let lo = first;
  for (const hi of anchors.slice(1)) {
    if (age <= hi.age) {
      const t = (age - lo.age) / (hi.age - lo.age);
      return lo.shift + t * (hi.shift - lo.shift);
    }
    lo = hi;
  }
  return last.shift;
};

/**
 * The only valuation of a player in the game, and the base of every transfer
 * fee. Spec 4, chapters 5.1 and 5.1a; fitted 2026-09-07.
 *
 * `poz` is REQUIRED and has no default. It used to be absent entirely, which
 * meant a thirty-year-old keeper at the height of his prime took the same
 * penalty as a thirty-year-old winger two years past his - a pricing error,
 * not a simplification. A default would have quietly restored it for whoever
 * forgot the argument, the same trap `formation` fell into in squad.ts.
 */
export const marketValue = (ovr: number, age: number, pos: PositionCode): number => {
  const x = (ovr + ageOvrShift(age, pos) - MARKET_VALUE_MIDPOINT) / MARKET_VALUE_SLOPE;
  return Math.max(MIN_MARKET_VALUE, MARKET_VALUE_MAX / (1 + Math.exp(-x)));
};

/** Headroom this player still has, from his age alone. See the constant's
 * comment for why age and not years to peak. */
export const startingSquadHeadroom = (rng: Rng, wiek: number): number => {
  const band =
    STARTING_SQUAD_HEADROOM.find((b) => wiek <= b.maxAge) ??
    at(
      STARTING_SQUAD_HEADROOM,
      STARTING_SQUAD_HEADROOM.length - 1,
      "startingSquadHeadroom fallback band"
    );
  return randInt(rng, band.min, band.max);
};

/** One draw either way, so the stream stays predictable per player. */
export const drawStartingSquadAge = (rng: Rng, isXi: boolean): number => {
  if (isXi) return randInt(rng, STARTING_SQUAD_XI_AGE.min, STARTING_SQUAD_XI_AGE.max);
  const total = STARTING_SQUAD_BENCH_AGE_BANDS.reduce((sum, b) => sum + b.weight, 0);
  let roll = rng.next() * total;
  for (const band of STARTING_SQUAD_BENCH_AGE_BANDS) {
    roll -= band.weight;
    if (roll < 0) return randInt(rng, band.min, band.max);
  }
  const last = at(
    STARTING_SQUAD_BENCH_AGE_BANDS,
    STARTING_SQUAD_BENCH_AGE_BANDS.length - 1,
    "drawStartingSquadAge fallback band"
  );
  return randInt(rng, last.min, last.max);
};

/** Mirrors prototype :36-37. Draw order: given name, then the origin threshold, then surname pool. */
const playerName = (rng: Rng): string =>
  `${pick(rng, IMIONA)[0]}. ${rng.next() < 0.18 ? pick(rng, OBCE) : pick(rng, NAZWISKA)}`;

/**
 * Mirrors prototype :60-97. Draw order must stay exactly as written - it is
 * part of the golden contract. `academyClubStrength` (clubOvr(clubRating(club)),
 * league-ratings.ts) only matters for typ "akademia" - a stronger club's
 * academy produces slightly higher-potential prospects. Deterministic, no
 * extra rng draw.
 */
export const createPlayer = (
  rng: Rng,
  typ: PlayerType,
  poz: PositionCode,
  academyClubStrength?: number,
  /** clubOvr of the club offering him, when the offer comes from outside.
   * Undefined for academy debutants and starting squads. */
  sourceClubOvr?: number
): Player => {
  const p = poz;
  let wiek: number;
  let ovr: number;
  let sufit: number;

  if (typ === "mlody") {
    wiek = randInt(rng, 17, 21);
    ovr = randInt(rng, 56, 67);
    const spread = selectPotentialSpread(rng);
    sufit = Math.round(ovr + randInt(rng, 6, 14) + rand(rng, -spread, spread));
  } else if (typ === "gotowy") {
    wiek = randInt(rng, 24, 28);
    ovr = randInt(rng, 67, 78);
    sufit = ovr + randInt(rng, 0, 3);
  } else if (typ === "weteran") {
    wiek = randInt(rng, 30, 34);
    ovr = randInt(rng, 70, 80);
    // A veteran has nothing left to add - his ceiling is where he already
    // is. The decline that follows comes from the age curve, not from here.
    sufit = ovr;
  } else {
    // Fills a position left with zero players (sale, refused extension,
    // retirement) - deliberately below league level so a sale never
    // upgrades a squad.
    // Ceiling (never ovr) shifts slightly with the club's own strength - a
    // stronger academy grooms slightly higher-potential prospects.
    wiek = randInt(rng, 16, 17);
    ovr = randInt(rng, 50, 56);
    const clubShift =
      academyClubStrength === undefined
        ? 0
        : Math.round(
            (academyClubStrength - ACADEMY_CEILING_CLUB_REFERENCE) * ACADEMY_CEILING_CLUB_FACTOR
          );
    sufit = ovr + randInt(rng, 2, 8) + clubShift;
  }
  // The ceiling is a hard cap: no player may ever be created above his own
  // potential, and develop() never raises ovr past it either. Until
  // 2026-08-14 this floor was ovr - 2, which let a "loteria" youngster whose
  // spread rolled badly start life two points beyond a ceiling he could
  // never reach - and the legacy screen then printed "Ocena 73, ukryty
  // sufit 72", which reads as a broken number because it was one. A bust
  // prospect now gets sufit === ovr: he will simply never improve.
  sufit = Math.max(ovr, Math.min(94, sufit));

  // A club below the top flight does not have this player, so it does not
  // offer him. The shift comes off ovr AND sufit, by the same number: moving
  // ovr alone would let the club's name predict the gap to the ceiling, which
  // is a hidden-ceiling leak - and the loudest kind,
  // because the name is printed on the card.
  if (sourceClubOvr !== undefined) {
    const raw = Math.min(
      0,
      Math.round((sourceClubOvr - OFFER_SOURCE_CLUB_REFERENCE) * OFFER_SOURCE_CLUB_FACTOR)
    );
    // Floored so nobody is offered already retired (see the starting squad,
    // commit 7effc27) - and the floor caps the shift itself, not ovr alone,
    // so the gap survives the clamp intact.
    const effective = Math.min(-raw, Math.max(0, ovr - RETIREMENT_OVR));
    ovr -= effective;
    sufit -= effective;
  }

  return {
    id: rng.next().toString(36).slice(2, 9),
    nazwa: playerName(rng),
    poz: p,
    wiek,
    ovr,
    sufit,
    moj: false,
    cenaZakupu: null,
    ageAtSigning: null,
    mnoznikPlacy: 1,
    // Callers that stamp a real join/contract season (game-reducer.ts, for
    // a fresh signing or a season-end debutant) override these afterward.
    wKlubieOd: 0,
    kontraktOd: 0,
    wygasa: false,
  };
};

/**
 * Builds one player for a starting squad, in the one order that makes the
 * ceiling mean anything: age first, then the rating the club's target
 * implies, and only then a ceiling derived from both.
 *
 * This exists because createSquadFromFormation used to call createPlayer
 * and overwrite the ovr it returned, leaving a ceiling computed from the
 * discarded draw. The ceiling therefore never learned the club's strength
 * while the rating did, and Math.max(ovr, sufit) flattened the difference:
 * in a strong club 62.7% of the eleven could not improve by a single point,
 * and ovr predicted headroom at -0.73 inside a single squad.
 *
 * Draw order is part of the golden contract: age, bonus, ceiling, id, name.
 */
export const createStartingSquadPlayer = (
  rng: Rng,
  poz: PositionCode,
  targetOvr: number,
  isXi: boolean
): Player => {
  const wiek = drawStartingSquadAge(rng, isXi);
  // Centred on zero for the eleven, because the target IS the intended mean;
  // the bench sits below it. Bands lifted to balance.ts on 2026-09-14 so the
  // analytic squad-cost model reads the same source.
  const band = isXi ? STARTING_XI_OVR_BONUS : STARTING_BENCH_OVR_BONUS;
  const bonus = rand(rng, band.lo, band.hi);
  // Floored at the retirement threshold, not below it: a starting squad has
  // no business containing players who retire before the first season ends.
  const ovr = Math.round(Math.max(RETIREMENT_OVR, targetOvr + bonus));
  const sufit = Math.min(94, ovr + startingSquadHeadroom(rng, wiek));

  return {
    id: rng.next().toString(36).slice(2, 9),
    nazwa: playerName(rng),
    poz,
    wiek,
    ovr,
    sufit,
    moj: false,
    cenaZakupu: null,
    ageAtSigning: null,
    mnoznikPlacy: 1,
    wKlubieOd: 0,
    kontraktOd: 0,
    wygasa: false,
  };
};
