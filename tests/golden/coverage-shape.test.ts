import { expect, test } from "vitest";

import type { TraceEvent } from "../../src/logic/trace-format";
import { SEZONY_GRY } from "../../src/data/balance";
import { playGoldenV1Replay } from "./headless";
import { scenarios } from "./scenarios";
import type { Scenario } from "./scenarios";

/**
 * What the golden corpus as a WHOLE has to cover, as opposed to what each
 * scenario proves on its own.
 *
 * Every scenario carries a coverage predicate, and each one still holds - but
 * none of them asks for a full tenure, so nothing noticed when the corpus
 * drifted. Between 2026-08-24 and 2026-08-25 the third relegation place and
 * the lower-league offers together took four careers off their feet:
 * latwy-pas 5 seasons to 1, wszystko-pas 5 to 1, targ-zawsze 5 to 2,
 * trudny-mieszany 4 to 2. Scenarios reaching the epilogue fell from ten to
 * eight. Nothing failed, because nothing was watching the mix.
 *
 * Left alone the drift only goes one way: every balance change that makes the
 * game harder shortens more careers, and the day the count reaches zero the
 * golden master silently stops covering the epilogue, the legacy screen and
 * five seasons of player development.
 *
 * This lives outside the per-scenario predicates on purpose. Strengthening a
 * predicate re-records that scenario, which moves the trace digest, which
 * makes engine-revision.test.ts demand an ENGINE_REVISION bump - for a change
 * that never touched the engine. A suite-level invariant reads the corpus
 * that already exists and pins the shape without moving a single byte of it.
 */
const eventsFor = (scenario: Scenario): TraceEvent[] => playGoldenV1Replay(scenario).result.events;

const shape = () => {
  let fullTenures = 0;
  let cutShort = 0;
  const perScenario: string[] = [];

  for (const scenario of scenarios) {
    const events = eventsFor(scenario);
    const seasons = events.filter((e) => e.type === "season").length;
    const epilogue = events.some((e) => e.type === "epilogue");

    if (seasons >= SEZONY_GRY && epilogue) fullTenures += 1;
    else cutShort += 1;
    perScenario.push(`${scenario.slug}=${seasons}${epilogue ? "+E" : ""}`);
  }

  return { fullTenures, cutShort, detail: perScenario.join(" ") };
};

/**
 * Six is the floor, not the target - eight hold today. The gap is deliberate
 * slack: a balance change is allowed to cost the corpus a career or two
 * without failing a test, and only a real collapse trips this.
 */
test("at least six golden scenarios play a full tenure and reach the epilogue", () => {
  const { fullTenures, detail } = shape();

  expect(fullTenures, detail).toBeGreaterThanOrEqual(6);
  // Replays the whole golden corpus: 4.3 s alone against the 5 s default, and
  // over the default when the machine runs other suites at the same time.
}, 30_000);

/**
 * The other arc, and the reason this is not simply "keep every career long".
 * A tenure ended by relegation runs different code - the shortened ending,
 * the verdict without epilogue seasons, the legacy screen that has to reveal
 * ceilings anyway (brief section 12). Losing that coverage would be as bad as
 * losing the full tenures, and it is the direction the corpus drifts AWAY
 * from as the game gets easier.
 */
test("at least two golden scenarios end before the tenure runs out", () => {
  const { cutShort, detail } = shape();

  expect(cutShort, detail).toBeGreaterThanOrEqual(2);
}, 30_000);
