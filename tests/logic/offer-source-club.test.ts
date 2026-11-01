import { expect, test } from "vitest";

import { LOWER_LEAGUE_SOURCE_SHARE, RETIREMENT_OVR } from "../../src/data/balance";
import { pickSourceClub } from "../../src/logic/analyst-context";
import { startingMembership } from "../../src/logic/league-membership";
import { createRng } from "../../src/logic/rng";
import { createStaffAssessment } from "../../src/logic/staff-assessment";
import { rollManyOffers } from "./offer-walk";
import { mean, sample } from "./source-club-sample";

test("a weaker source club offers a weaker player", () => {
  const strong = sample(72, "gotowy", 0, 20_000); // Lech
  const weak = sample(51, "gotowy", 0, 20_000); // Pogoń Siedlce
  expect(mean(weak.map((p) => p.ovr))).toBeLessThan(mean(strong.map((p) => p.ovr)) - 7);
});

test("nobody is offered below the retirement threshold", () => {
  for (const p of sample(51, "mlody", 0, 20_000)) {
    expect(p.ovr).toBeGreaterThanOrEqual(RETIREMENT_OVR);
  }
});

/**
 * And the half that WOULD be a leak: the shift must never widen the gap.
 * Paired on purpose - same seeds, so the only difference is the shift - and
 * exact, because a naive implementation that lowers ovr alone shows up here
 * as a gap larger by exactly the shift.
 */
test("the shift moves ovr and sufit by the same amount", () => {
  for (const typ of ["mlody", "gotowy", "weteran"] as const) {
    // Paired and exact: same seeds, so the only difference is the shift. This
    // is the primary guard - it catches the naive implementation on the first
    // player rather than statistically.
    const unshifted = sample(72, typ, 0, 5000);
    const shifted = sample(51, typ, 0, 5000);
    for (let i = 0; i < unshifted.length; i += 1) {
      expect(shifted[i]!.sufit - shifted[i]!.ovr).toBe(unshifted[i]!.sufit - unshifted[i]!.ovr);
    }
  }
}, 60000);

test("never offers the player his own club as an external source", () => {
  const membership = startingMembership();
  const rng = createRng(1);
  for (let i = 0; i < 2000; i += 1) {
    expect(pickSourceClub(rng, membership, "lech-poznan").clubName).not.toBe("Lech Poznań");
  }
});

test("about a quarter of source clubs come from below the top flight", () => {
  const membership = startingMembership();
  const pool = new Set(membership.clubs.filter((c) => c.tier === "pool").map((c) => c.name));
  const rng = createRng(0x50_17_ce);
  const RUNS = 20_000;
  let lower = 0;
  for (let i = 0; i < RUNS; i += 1) {
    if (pool.has(pickSourceClub(rng, membership, "lech-poznan").clubName)) lower += 1;
  }
  const share = lower / RUNS;
  expect(share, `udział ${(share * 100).toFixed(1)}%`).toBeGreaterThan(
    LOWER_LEAGUE_SOURCE_SHARE - 0.02
  );
  expect(share, `udział ${(share * 100).toFixed(1)}%`).toBeLessThan(
    LOWER_LEAGUE_SOURCE_SHARE + 0.02
  );
}, 60000);

test("every first-division club classifies as the bottom tier", () => {
  // Spec 4.3: the bottom threshold stretches rather than gaining a fourth
  // tier. The pool runs 51.0 to 60.0 clubOvr, all of it under 63.
  const membership = startingMembership();
  const rng = createRng(7);
  const pool = new Set(membership.clubs.filter((c) => c.tier === "pool").map((c) => c.name));
  for (let i = 0; i < 3000; i += 1) {
    const picked = pickSourceClub(rng, membership, "lech-poznan");
    if (pool.has(picked.clubName)) expect(picked.contextTier).toBe("bottom");
  }
});

/**
 * The staff outlook is the one permitted channel about the ceiling, and the
 * source club must not reach it except through the player's own numbers.
 *
 * What the outlook DOES change is the level itself: a shifted player is
 * genuinely worse and reads worse. That is the report doing its job, not a
 * leak, and asserting otherwise would pin a false property.
 */
test("the assessment on the card is the one the player's own numbers produce", () => {
  // Integration, not identity: rollOffer stores an assessment on the offer,
  // and this recomputes it from the player alone. If the club ever reached
  // createStaffAssessment by another route - an extra argument, a lookup -
  // the two would diverge here.
  const offers = rollManyOffers(300).filter(
    (o) => o.typ !== "SPRZEDAZ" && o.typ !== "PRZEDLUZENIE"
  );

  expect(offers.length).toBeGreaterThan(50);
  for (const offer of offers) {
    expect(offer.staffAssessment).toEqual(
      createStaffAssessment(offer.zawodnik, offer.period, "scout", null)
    );
  }
}, 60000);

/**
 * The confidence half of the same rule. Confidence may
 * depend on years to peak - a visible quantity - and forbids it depending on
 * the draw. The club is neither, so at a fixed age the distribution of
 * confidence must not move.
 */
test("the source club does not change how confident the staff is", () => {
  const period = { season: 1, window: "summer" } as const;
  const highShare = (sourceClubOvr: number, seedOffset: number) => {
    const players = sample(sourceClubOvr, "mlody", seedOffset, 8000).filter((p) => p.wiek === 19);
    const drawn = players.map((p) => createStaffAssessment(p, period, "scout", null).confidence);
    return drawn.filter((c) => c === "high").length / drawn.length;
  };

  expect(Math.abs(highShare(72, 0) - highShare(51, 500_000))).toBeLessThan(0.05);
}, 60000);
