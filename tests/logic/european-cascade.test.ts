import { expect, test } from "vitest";

import { EUROPEAN_PRIZE_MONEY } from "../../src/data/balance";
import { campaignMoney, resolveEuropeanCampaign } from "../../src/logic/european-cups";
import { createRng } from "../../src/logic/rng";

/** Every campaign that ends anywhere but the qualifying round of the bottom
 * competition must be a single leg: only elimination cascades. */
test("a campaign that clears qualifying never cascades", () => {
  const rng = createRng(0x5eed_0001);
  for (let i = 0; i < 500; i += 1) {
    const legs = resolveEuropeanCampaign(rng, "LM", 78);
    const cascaded = legs.slice(0, -1);
    for (const leg of cascaded) expect(leg.stage).toBe("qualifying");
  }
});

test("the cascade runs LM to LE to LK and stops there", () => {
  const rng = createRng(11);
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i += 1) {
    const legs = resolveEuropeanCampaign(rng, "LM", 40);
    seen.add(legs.map((leg) => leg.cup).join(">"));
    expect(legs.length).toBeLessThanOrEqual(3);
    expect(legs[0]!.cup).toBe("LM");
  }
  // A very weak club fails qualifying often, so all three shapes must appear.
  expect(seen.has("LM")).toBe(true);
  expect(seen.has("LM>LE")).toBe(true);
  expect(seen.has("LM>LE>LK")).toBe(true);
});

test("a club starting in the bottom competition never cascades", () => {
  const rng = createRng(3);
  for (let i = 0; i < 500; i += 1) {
    expect(resolveEuropeanCampaign(rng, "LK", 40)).toHaveLength(1);
  }
});

test("money is the sum of every leg's prize", () => {
  const rng = createRng(7);
  for (let i = 0; i < 300; i += 1) {
    const legs = resolveEuropeanCampaign(rng, "LM", 55);
    const expected = legs.reduce(
      (total, leg) => total + EUROPEAN_PRIZE_MONEY[leg.cup][leg.stage],
      0
    );
    expect(campaignMoney(legs)).toBeCloseTo(expected, 10);
  }
});

test("the same seed replays the same campaign", () => {
  expect(resolveEuropeanCampaign(createRng(42), "LM", 70)).toEqual(
    resolveEuropeanCampaign(createRng(42), "LM", 70)
  );
});
