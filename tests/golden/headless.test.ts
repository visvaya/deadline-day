import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { formatTrace } from "../../src/logic/trace-format";
import { playGoldenV1Replay } from "./headless";
import { scenarios } from "./scenarios";

/**
 * Proves the pure reducer reproduces the traces recorded in tests/golden/traces,
 * bit-identically. Trace comparison goes through toMatchFileSnapshot, so a
 * deliberate balance change can be re-baselined with `vitest -u` - the diff it
 * produces must be explained in the commit that follows
 * (docs/decisions/golden-master.md).
 * Replay files (seed/akcje) are separate, permanent inputs and are never
 * touched by `-u`; re-recording them requires `pnpm golden:record`.
 *
 * The thirteen `.replay.json` files stay v1 (Task 6F): they were recorded
 * under the removed difficulty draw, and playGoldenV1Replay is the adapter
 * that plays their frozen decisions through the club the scenario now names
 * instead. See scenarios.ts for the scenario -> clubId table.
 */

/**
 * Scenarios whose coverage predicate a balance or engine change invalidated
 * for THIS SEED, with the evidence that the path itself is still reachable.
 *
 * These seeds stopped landing in a world that satisfies their predicate
 * because something upstream shifted the seed-to-world mapping - not because
 * the code path died. Restoring coverage needs new seeds, and searching for
 * them now would be wasted work: chapter 8.3 re-records all thirteen replays
 * as v2 at step 8b anyway (just before calibration, step 9), once new seeds are chosen deliberately for
 * coverage. So the loss is pinned rather than papered over, in the same idiom
 * as EXPECTED_TRACE_DIGEST: the assertion below passes for EXACTLY this list,
 * and breaks both ways - a scenario losing coverage that isn't listed fails,
 * and one recovering that IS listed fails too, so the list cannot rot into a
 * silent exemption.
 *
 * The share is over 400 seeds swept per scenario under its own policy and
 * (as of Task 6F) its own clubId, measuring the predicate itself rather than
 * a proxy for it.
 *
 * This list is a loose end owned by step 8b and must be empty when the v2
 * replays are recorded.
 */
const COVERAGE_LOST_TO_ACTIVATION: ReadonlyMap<string, string> = new Map([
  // Rare even before activation, and the rarest of the three now: a future
  // re-record has to search for this one deliberately, not stumble on it.
  ["sami-gotowi", "FLOP headline: reachable in 1.5% of swept seeds"],
  ["bierz-zawsze", "negative cash at a decision: reachable in 63.8% of swept seeds"],
  // Added 2026-09-14 by Task 6F's retrace: the removed club draw shifts
  // every later RNG call by one, and the fixture order no longer follows
  // the CLUBS literal (retrace categories 3-4 in the Task 6F commit
  // message, 19856ba) - so this seed's contract-extension timing lands
  // somewhere its old recorded coverage no longer reaches. trudny-mieszany,
  // latwy-pas and przedluzenie, the three other entries this retrace added,
  // were dropped again 2026-09-22 (see below) - only latwy-bierz survives
  // from that batch.
  ["latwy-bierz", "KLUB Z ZAGRANICY verdict: reachable in 42.5% of swept seeds"],
  // Added 2026-09-22 by the clubId fixture-order retrace
  // ("leagueFixtureOrder"): sorting the fixture shuffle's input by clubId
  // instead of short name reshuffles every round from S1 R1 onward, so
  // relegation timing, verdicts and contract-extension decisions land on
  // different seeds again. Dropped trudny-mieszany, latwy-pas and
  // przedluzenie - their predicates are reachable again under the new
  // order - and added same-mlode, whose PRZELOM headline this retrace
  // pushes back out of reach. Shares measured over seeds 1-400 swept per
  // scenario under its own policy and clubId - the same convention the
  // 2026-09-10/09-14 entries above used, made explicit here because no
  // earlier entry states its range.
  ["same-mlode", "PRZELOM headline: reachable in 43.5% of swept seeds"],
  // Dropped 2026-09-23 by the buyer-capacity retrace (Task 7, ENGINE_REVISION
  // "2026-09-22.2"): sredni-wykupiony's KLUB Z CZOŁÓWKI verdict, entered
  // 2026-09-12 by the opening-budget activation, is reachable again and this
  // entry is removed - the test itself is the proof (it fails with "satisfies
  // its coverage again" whenever a dropped entry is left in place, so no
  // separate sweep is needed for a removal, only for an addition). Traced the
  // mechanism directly rather than assuming "cash moved a bit": the new
  // SPRZEDAZ pricing (deviation-then-buyer-factor fee, replacing the flat
  // rand(1.0, 1.6)) changes decision 2's price, which changes the cash
  // available at decision 5 (a KUPNO card, unrelated to SPRZEDAZ), which
  // flips that purchase from BIERZ:OK to BIERZ:BRAK_SRODKOW - one player
  // fewer joins the squad. From there, rollOffer's bounded retry loop
  // (selectDisplayableOffer), which discards an external-signing card the
  // current squad depth would reject, takes a different number of attempts
  // at decision 7 onward, shifting the rng stream for the rest of the
  // tenure - a legitimate cascade, not a bug, and why every later decision's
  // card type, the league table and the final verdict all differ from here.
  // No entry was added: none of the other twelve scenarios lost their
  // declared coverage under this retrace.
]);

describe("golden traces via the pure reducer", () => {
  for (const scenario of scenarios) {
    test(
      scenario.slug,
      async () => {
        const { replay, result, recordedCount } = playGoldenV1Replay(scenario);
        // The adapter ignores only the leading START:<difficulty> token; the
        // rest of the recorded decisions must reproduce exactly, unchanged by
        // which club actually played them. Only the recorded prefix is
        // pinned here - see playGoldenV1Replay's comment on recordedCount:
        // the shifted RNG cascade (category 3) and the fixture reorder
        // (category 4) can move relegation timing, so a tenure may now need
        // decisions beyond what was ever recorded (a scenario's own policy
        // fills those in) or may end before the recording is exhausted.
        expect(result.akcje.slice(0, recordedCount)).toEqual(
          replay.akcje.slice(1, 1 + recordedCount)
        );
        // A replay can still run to the end and yet stop proving what it was
        // recorded to prove: the scenario's own predicate is what makes it a
        // regression input rather than an arbitrary sequence of clicks. Left
        // unchecked here, a balance change could drain a scenario of its
        // coverage while the snapshot happily re-baselined around the loss.
        // Deliberately BEFORE the snapshot, so `vitest -u` cannot accept a
        // trace that no longer covers its case.
        const lostToActivation = COVERAGE_LOST_TO_ACTIVATION.get(scenario.slug);
        expect(
          scenario.coverage(result.events),
          lostToActivation === undefined
            ? `${scenario.slug} no longer satisfies its declared golden coverage`
            : `${scenario.slug} satisfies its coverage again (${lostToActivation}) - drop it from COVERAGE_LOST_TO_ACTIVATION`
        ).toBe(lostToActivation === undefined);
        await expect(formatTrace(result.events)).toMatchFileSnapshot(
          join("traces", `${scenario.slug}.trace.txt`)
        );
      },
      10_000
    );
  }
});
