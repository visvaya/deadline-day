import { expect, test } from "vitest";

import { CLUBS } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import { clubRating, leagueRatings } from "../../src/logic/league-ratings";
import { startingMembership } from "../../src/logic/league-membership";
import { expectedPlace, expectedSeasonPoints } from "../../src/logic/expected-points";
import { buildFixtures, emptyStandings, playRounds, sortStandings } from "../../src/logic/league";
import { createRng } from "../../src/logic/rng";
import { createSquadFromFormation } from "../../src/logic/squad";

/**
 * Place is clamped at both ends of an eighteen-club table, so comparing rank
 * with rank stops measuring anything at the edges: a club forecast 18th
 * satisfies "place <= 18" in every season that can be played, relegation
 * included, while a club forecast 1st satisfies it only by winning the
 * league. Measured before the fix: 100% for four clubs against 22.8% for
 * Lech. Expected points are continuous and unclamped, so every club sits
 * near half.
 *
 * Two thousand seasons per club: at two hundred a rate carries about 3.5 pp
 * of standard error, so eighteen clubs scatter over a 16 pp spread by
 * sampling alone and the bands below would fail on noise rather than on the
 * criterion. The place criterion used to be pinned at two hundred, which was
 * only ever safe by luck: the fixture order now comes from the membership
 * (RYWALE) rather than from the ratings snapshot, and that reordering alone
 * moved Lech's two-hundred-season rate from 28% to 36%, across a band it was
 * never meant to test. At two thousand the rate is 33.9% under either order,
 * so the sample was the noise, not the criterion. The 22.8% quoted above
 * predates the match engine's later calibration and is kept as the
 * historical reason for the fix, not as a number to assert against.
 *
 * Thirty-six thousand simulated seasons run in about eight seconds, but v8
 * coverage instrumentation multiplies that by nine - hence the wide timeout
 * rather than a smaller sample, which would put the spread assertion inside
 * its own sampling error.
 */
const overperformRate = (krotko: string, criterion: "place" | "points", runs = 2000): number => {
  const klub = CLUBS.find((k) => k.shortName === krotko)!;
  const formation = FORMACJE["4-3-3"];
  const kadra = createSquadFromFormation(createRng(0x5eed_2001), formation, clubRating(klub));
  const ratings = leagueRatings(kadra, null, krotko, formation, startingMembership());
  const own = ratings.get(krotko)!;
  const opponents = [...ratings.entries()].filter(([c]) => c !== krotko).map(([, r]) => r);
  const clubs = [...ratings.keys()];

  let hits = 0;
  for (let s = 0; s < runs; s += 1) {
    const rng = createRng(0x2000 + s * 7919);
    const table = sortStandings(
      playRounds(rng, buildFixtures(clubs), ratings, emptyStandings(clubs))
    );
    const row = table.find((r) => r.club === krotko)!;
    const miejsce = table.indexOf(row) + 1;
    hits +=
      criterion === "place"
        ? miejsce <= expectedPlace(own, opponents)
          ? 1
          : 0
        : row.points > expectedSeasonPoints(own, opponents)
          ? 1
          : 0;
  }
  return hits / runs;
};

test("the place criterion is degenerate at both ends of the table", () => {
  // Pinned as the reason this change exists, not as desired behaviour.
  expect(overperformRate("Radomiak", "place")).toBe(1);
  expect(overperformRate("Lech", "place")).toBeLessThan(0.4);
  // Same wide timeout as the test below, and for the same reason: coverage
  // instrumentation multiplies four thousand simulated seasons by nine.
}, 300000);

test("the points criterion sits near half for every club in the league", () => {
  const rates = CLUBS.map((k) => ({
    krotko: k.shortName,
    rate: overperformRate(k.shortName, "points"),
  }));
  for (const { krotko, rate } of rates) {
    expect(rate, `${krotko}: ${(rate * 100).toFixed(1)}%`).toBeGreaterThan(0.4);
    expect(rate, `${krotko}: ${(rate * 100).toFixed(1)}%`).toBeLessThan(0.6);
  }
  const spread = Math.max(...rates.map((r) => r.rate)) - Math.min(...rates.map((r) => r.rate));
  expect(spread, `spread ${(spread * 100).toFixed(1)} pp, was 77 pp on place`).toBeLessThan(0.15);
}, 300000);
