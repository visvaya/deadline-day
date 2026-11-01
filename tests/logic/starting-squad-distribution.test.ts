import { expect, test } from "vitest";

import { CLUBS } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import { clubRating } from "../../src/logic/league-ratings";
import { createRng } from "../../src/logic/rng";
import { createSquadFromFormation } from "../../src/logic/squad";
import { RETIREMENT_OVR } from "../../src/data/balance";
import type { ClubRecord, Player } from "../../src/data/types";

const KLUBY: readonly ClubRecord[] = CLUBS;
const FORMACJE_LISTA = Object.values(FORMACJE);
const RUNS = 12;

/**
 * The seed has to move with the club and the formation, not with the run
 * index alone. Reusing one seed across clubs makes every squad in the sample
 * a copy of the same draw sequence read against a different target, which
 * duplicates rather than samples - and duplicated rows quietly narrow every
 * spread measured below.
 */
const squadsOf = (klub: ClubRecord): Player[][] => {
  const rating = clubRating(klub);
  const klubIdx = KLUBY.indexOf(klub);
  return FORMACJE_LISTA.flatMap((formation, formIdx) =>
    Array.from({ length: RUNS }, (_, run) =>
      createSquadFromFormation(
        createRng(0x5eed_1000 + klubIdx * 7919 + formIdx * 131 + run),
        formation,
        rating
      )
    )
  );
};

const sample = (): Player[] => KLUBY.flatMap((klub) => squadsOf(klub).flat());

const correlation = (xs: number[], ys: number[]): number => {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    cov += (xs[i]! - mx) * (ys[i]! - my);
    vx += (xs[i]! - mx) ** 2;
    vy += (ys[i]! - my) ** 2;
  }
  return cov / Math.sqrt(vx * vy);
};

/**
 * The leak this whole change exists to close. Before the fix a player's
 * visible rating predicted his hidden headroom at -0.782 across the league
 * and -0.730 inside a single club, so the top third of a strong club's tiles
 * was 82.5% players who could never improve. No code read sufit; the
 * correlation was the channel.
 *
 * Measured on residuals after removing the mean of each exact age - the same
 * method used for the analyst signal, where the question is
 * also "does a hidden quantity still move once everything visible is
 * accounted for". Age has to come out first because it is the one input the
 * headroom model legitimately reads, and the game shows it: leaving it in
 * measures age predicting headroom (r = -0.87, by design) rather than the
 * rating doing it.
 */
test("the visible rating does not predict hidden headroom", () => {
  const players = sample();
  const byAge = new Map<number, Player[]>();
  for (const p of players) {
    const bucket = byAge.get(p.wiek);
    if (bucket === undefined) byAge.set(p.wiek, [p]);
    else bucket.push(p);
  }

  const ovrResidual: number[] = [];
  const headroomResidual: number[] = [];
  for (const bucket of byAge.values()) {
    const meanOvr = bucket.reduce((s, p) => s + p.ovr, 0) / bucket.length;
    const meanHeadroom = bucket.reduce((s, p) => s + (p.sufit - p.ovr), 0) / bucket.length;
    for (const p of bucket) {
      ovrResidual.push(p.ovr - meanOvr);
      headroomResidual.push(p.sufit - p.ovr - meanHeadroom);
    }
  }

  const r = correlation(ovrResidual, headroomResidual);
  expect(
    Math.abs(r),
    `residual correlation ${r.toFixed(3)}, was -0.782 before the fix`
  ).toBeLessThan(0.15);
});

/**
 * What the fix actually buys is not a low share of players stuck at their
 * ceiling - the share is whatever the age bands imply - but the same share
 * everywhere. Before the fix it ran from 5.9% at Radomiak to 42.8% across
 * strong clubs, because base.ovr was drawn from a club-independent 58-70 and
 * then clamped against a rating that did know the club. That gap was an
 * accidental handicap nobody designed.
 */
test("no club gets a different amount of room to grow than another", () => {
  const shares = KLUBY.map((klub) => {
    const players = squadsOf(klub).flat();
    const stuck = players.filter((p) => p.sufit === p.ovr).length / players.length;
    return { shortName: klub.shortName, stuck };
  });

  const spread = Math.max(...shares.map((s) => s.stuck)) - Math.min(...shares.map((s) => s.stuck));
  const summary = shares
    .map((s) => `${s.shortName} ${(s.stuck * 100).toFixed(1)}%`)
    .sort()
    .join(", ");
  // Was 36.9 pp between Radomiak and the strong-club aggregate; the
  // eighteen clubs now sit inside 3.8 pp of each other, which is the
  // sampling noise of an ~1600-player draw and nothing more.
  expect(spread, `spread ${(spread * 100).toFixed(1)} pp: ${summary}`).toBeLessThan(0.08);
});

/**
 * And this is what defines the model instead: whether a player can still
 * grow is a function of his age and of nothing else. The three numbers below
 * are the age bands read back out of the squads, so a change to
 * STARTING_SQUAD_HEADROOM has to be argued for here rather than slipping
 * through as a shifted aggregate.
 */
test("room to grow is decided by age alone", () => {
  const players = sample();
  const stuckShare = (f: (_p: Player) => boolean): number => {
    const group = players.filter(f);
    expect(group.length).toBeGreaterThan(500);
    return group.filter((p) => p.sufit === p.ovr).length / group.length;
  };

  // Bands 17-20 (+6..14) and 21-23 (+3..9) never draw a zero.
  expect(stuckShare((p) => p.wiek < 24)).toBe(0);
  // 24-27 draws +0..4, so one roll in five leaves nothing. Bounds rather
  // than a point: the band holds a few thousand players, so the sample
  // moves by about half a point either way.
  const prime = stuckShare((p) => p.wiek >= 24 && p.wiek <= 27);
  expect(prime, `24-27 stuck ${(prime * 100).toFixed(1)}%, expected ~20%`).toBeGreaterThan(0.18);
  expect(prime).toBeLessThan(0.22);
  // Past the prime the ceiling is where the player already is, as it is for
  // createPlayer's "weteran".
  expect(stuckShare((p) => p.wiek >= 28)).toBe(1);
});

test("squads carry age tails, at roughly the shape a real squad has", () => {
  const players = sample();
  const share = (f: (_p: Player) => boolean) => players.filter(f).length / players.length;

  // Roughly four or five of a twenty-man squad aged 17-20, one or two past
  // 32 - the proportions measured on Lech, Cracovia and Radomiak.
  expect(share((p) => p.wiek <= 20)).toBeGreaterThan(0.15);
  expect(share((p) => p.wiek <= 20)).toBeLessThan(0.32);
  expect(share((p) => p.wiek >= 32)).toBeGreaterThan(0.03);
  expect(share((p) => p.wiek >= 32)).toBeLessThan(0.14);
  expect(Math.min(...players.map((p) => p.wiek))).toBe(17);
  expect(Math.max(...players.map((p) => p.wiek))).toBe(34);
});

test("the age tails sit on the bench, never in the eleven", () => {
  for (const formation of FORMACJE_LISTA) {
    const rating = clubRating(KLUBY[0]!);
    for (let run = 0; run < 20; run += 1) {
      const kadra = createSquadFromFormation(createRng(run * 31 + 7), formation, rating);
      let idx = 0;
      for (const slot of formation.pozycje) {
        for (let i = 0; i < slot.kadra; i += 1) {
          const p = kadra[idx];
          idx += 1;
          if (i < slot.xi) {
            expect(p!.wiek, `${formation.id} ${slot.kod} XI`).toBeGreaterThanOrEqual(21);
            expect(p!.wiek, `${formation.id} ${slot.kod} XI`).toBeLessThanOrEqual(31);
          }
        }
      }
    }
  }
});

/**
 * No starting-squad player is born below the retirement threshold. ageSquad
 * retires anyone under RETIREMENT_OVR, and the squad builder used to floor
 * new ratings at 48 - two points below it - so 2.7% of every starting squad,
 * and 11.5% of Radomiak's, expired on the first whistle having never been
 * available to play, sell or extend.
 *
 * What this pins is exactly that: nobody starts below the line. It does NOT
 * pin the stronger claim that nobody retires after season one, and that claim
 * is false on purpose - a 33-year-old created at the floor declines through
 * the age curve and drops under it. Measured 2026-08-24 over 76 140 players:
 * 0.95% of a starting squad retires after the first season, and 12% of those
 * created exactly at the floor. That is an old player finishing his career,
 * which is a football outcome; the bug was a player finishing it before
 * kick-off.
 *
 * The floor and the retirement check read the same constant now, but a
 * future edit could still lower one of them alone, so the constant is
 * asserted rather than the literal.
 */
test("no starting-squad player is born already retired", () => {
  const players = sample();

  expect(Math.min(...players.map((p) => p.ovr))).toBeGreaterThanOrEqual(RETIREMENT_OVR);
  expect(players.filter((p) => p.ovr < RETIREMENT_OVR)).toEqual([]);
});

test("the weakest clubs are the ones this used to hit", () => {
  // Radomiak sits at the bottom of the ratings, so its targets land closest
  // to the floor - it produced 11.5% of these before the fix. If the floor
  // ever slips, this is where it shows first.
  const radomiak = CLUBS.find((c) => c.shortName === "Radomiak")!;
  const rating = clubRating(radomiak);
  const squads = Object.values(FORMACJE).flatMap((formation) =>
    Array.from({ length: 40 }, (_, run) =>
      createSquadFromFormation(createRng(run * 7919 + 13), formation, rating)
    )
  );

  const all = squads.flat();
  expect(all.length).toBeGreaterThan(1000);
  expect(all.filter((p) => p.ovr < RETIREMENT_OVR)).toEqual([]);
});
