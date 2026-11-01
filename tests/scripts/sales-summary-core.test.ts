import { expect, test } from "vitest";

import { summarizeSales } from "../../scripts/sales-summary-core";
import type { SaleObservation } from "../../scripts/balance-metrics";

const row = (o: Partial<SaleObservation>): SaleObservation => ({
  clubId: "legia-warszawa",
  policyName: "mixed",
  seed: 1,
  decisionIndex: 1,
  season: 1,
  offerPrice: 1,
  realisedFee: null,
  buyerOrigin: "domestic",
  buyerClubId: null,
  ...o,
});

test("offer shares and deal shares are counted separately", () => {
  const [s] = summarizeSales([
    row({ offerPrice: 1, buyerOrigin: "domestic", realisedFee: 1 }),
    row({ offerPrice: 3, buyerOrigin: "foreign" }),
    row({ offerPrice: 5, buyerOrigin: "foreign", realisedFee: 6 }),
  ]);
  expect(s!.offers).toBe(3);
  expect(s!.foreignOfferShare).toBeCloseTo(2 / 3, 12);
  expect(s!.deals).toBe(2);
  expect(s!.foreignDealShare).toBeCloseTo(1 / 2, 12);
  expect(s!.medianOfferPrice).toBe(3);
  expect(s!.medianRealisedFee).toBe(3.5);
});

test("a cell without deals reports a null realised median", () => {
  const [s] = summarizeSales([row({ realisedFee: null })]);
  expect(s!.medianRealisedFee).toBeNull();
});
