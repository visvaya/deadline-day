import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  HAGGLE_SALE_BONUS,
  MAX_FOREIGN_FEE,
  MAX_INTRA_LEAGUE_FEE,
  MAX_UNHAGGLED_FOREIGN_FEE,
} from "../../src/data/balance";
import { CLUB_FINANCE_PROFILES } from "../../src/data/club-finance-profiles";
import {
  FOREIGN_CANDIDATES,
  domesticBuyerFactor,
  domesticCandidates,
  domesticMaxSpend,
  maxOfferFor,
  priceCandidates,
  qualifiedPool,
} from "../../src/logic/buyers";
import { startingMembership } from "../../src/logic/league-membership";
import { zaokr } from "../../src/logic/format";

const ALL_DOMESTIC = CLUB_FINANCE_PROFILES.map((p) => p.clubId);

describe("buyerFactor", () => {
  test("domestic factors span exactly 1.00 to 1.12 and grow with revenue", () => {
    const rows = CLUB_FINANCE_PROFILES.map((p) => ({
      r: p.recurringRevenuePln,
      f: domesticBuyerFactor(p.clubId),
    })).sort((a, b) => a.r - b.r);
    expect(rows[0]!.f).toBeCloseTo(1, 12);
    expect(rows.at(-1)!.f).toBeCloseTo(1.12, 12);
    for (let i = 1; i < rows.length; i += 1)
      expect(rows[i]!.f).toBeGreaterThanOrEqual(rows[i - 1]!.f);
  });

  test("every foreign factor is strictly above every domestic one, all within 1.00-1.25", () => {
    const maxDomestic = Math.max(...ALL_DOMESTIC.map(domesticBuyerFactor));
    for (const c of FOREIGN_CANDIDATES) {
      expect(c.buyerFactor).toBeGreaterThan(maxDomestic);
      expect(c.buyerFactor).toBeLessThanOrEqual(1.25);
    }
  });

  test("an unknown club is a data error, not a default", () => {
    expect(() => domesticBuyerFactor("nie-istnieje")).toThrow();
  });
});

describe("capacity", () => {
  test("no domestic club can spend above the intra-league record", () => {
    for (const id of ALL_DOMESTIC)
      expect(domesticMaxSpend(id)).toBeLessThanOrEqual(MAX_INTRA_LEAGUE_FEE);
  });

  test("Legia is capped at the record fee; Wisla Plock spends about 0.69", () => {
    expect(domesticMaxSpend("legia-warszawa")).toBe(MAX_INTRA_LEAGUE_FEE);
    expect(domesticMaxSpend("wisla-plock")).toBeCloseTo(0.69, 2);
  });

  test("maxOffer leaves room for the whole haggle", () => {
    expect(maxOfferFor(6) * (1 + HAGGLE_SALE_BONUS)).toBeCloseTo(6, 12);
  });
});

describe("candidates", () => {
  test("the player's own club never bids and both lists are sorted by clubId", () => {
    const list = domesticCandidates(startingMembership(), "lech-poznan");
    expect(list.some((c) => c.clubId === "lech-poznan")).toBe(false);
    expect(list.length).toBe(35);
    const sorted = (ids: string[]) => [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(list.map((c) => c.clubId)).toEqual(sorted(list.map((c) => c.clubId)));
    expect(FOREIGN_CANDIDATES.map((c) => c.clubId)).toEqual(
      sorted(FOREIGN_CANDIDATES.map((c) => c.clubId))
    );
  });

  test("reordering the membership literal does not reorder the candidates", () => {
    const membership = startingMembership();
    const reversed = { clubs: [...membership.clubs].reverse() };
    expect(domesticCandidates(reversed, "lech-poznan")).toEqual(
      domesticCandidates(membership, "lech-poznan")
    );
  });

  test("renaming short names changes labels only, never the candidate ids or their order", () => {
    const membership = startingMembership();
    const renamed = {
      clubs: membership.clubs.map((c) => ({ ...c, shortName: `x-${c.shortName}` })),
    };
    const ids = (m: typeof membership) => domesticCandidates(m, "lech-poznan").map((c) => c.clubId);
    expect(ids(renamed)).toEqual(ids(membership));
  });
});

describe("pricing and qualification", () => {
  const all = () => [
    ...domesticCandidates(startingMembership(), "lech-poznan"),
    ...FOREIGN_CANDIDATES,
  ];

  test("a cheap player is sold at home", () => {
    const pool = qualifiedPool(priceCandidates(0.4, all()));
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((c) => c.origin === "domestic")).toBe(true);
  });

  test("a fee no domestic club can meet goes abroad, and the pool is never empty", () => {
    for (const base of [5, 8, 12, 50, 1000]) {
      const pool = qualifiedPool(priceCandidates(base, all()));
      expect(pool.length, String(base)).toBeGreaterThan(0);
      expect(
        pool.every((c) => c.origin === "foreign"),
        String(base)
      ).toBe(true);
    }
  });

  test("every qualified price survives a full haggle inside its buyer's maxSpend", () => {
    for (let base = 0.05; base <= 20; base += 0.037) {
      for (const c of qualifiedPool(priceCandidates(base, all()))) {
        expect(c.price).toBeLessThanOrEqual(c.maxOffer);
        expect(zaokr(c.price * (1 + HAGGLE_SALE_BONUS), 2)).toBeLessThanOrEqual(c.maxSpend);
        expect(zaokr(c.price * (1 + HAGGLE_SALE_BONUS), 2)).toBeLessThan(MAX_FOREIGN_FEE);
      }
    }
  });

  test("foreign prices are soft-capped and rounded down; domestic ones rounded normally", () => {
    const [foreign] = priceCandidates(
      1000,
      FOREIGN_CANDIDATES.filter((c) => c.maxSpend === MAX_FOREIGN_FEE)
    );
    expect(foreign!.price).toBeLessThan(MAX_FOREIGN_FEE / (1 + HAGGLE_SALE_BONUS));
    expect(Math.round(foreign!.price * 100)).toBe(foreign!.price * 100);
  });

  test("one foreign tier qualifies (base 9.5) and the price spread is at least 0.15 mln absolute", () => {
    // Base fee at the extremes of priceDeviation (0.9/1.1): only the legendarny
    // tier's maxOffer covers either extreme, so the whole spread comes from
    // priceDeviation alone, not from mixing buyers of different wealth.
    const base = 9.5;
    const low = qualifiedPool(priceCandidates(base * 0.9, all()));
    const high = qualifiedPool(priceCandidates(base * 1.1, all()));
    const tiers = new Set([...low, ...high].map((c) => c.maxSpend));
    const prices = [...low, ...high].map((c) => c.price);
    expect(tiers.size).toBe(1);
    expect(Math.max(...prices) - Math.min(...prices)).toBeGreaterThanOrEqual(0.15);
  });

  test("two foreign tiers qualify together (base 3.0) and the relative spread is at least 5%", () => {
    // A lower base fee lets more than one foreign wealth tier afford it at
    // once, so the spread reflects buyers of different wealth, not just
    // priceDeviation.
    const base = 3;
    const low = qualifiedPool(priceCandidates(base * 0.9, all()));
    const high = qualifiedPool(priceCandidates(base * 1.1, all()));
    const tiers = new Set([...low, ...high].map((c) => c.maxSpend));
    const prices = [...low, ...high].map((c) => c.price);
    expect(tiers.size).toBeGreaterThanOrEqual(2);
    expect(Math.max(...prices) - Math.min(...prices)).toBeGreaterThanOrEqual(
      0.05 * Math.min(...prices)
    );
  });

  test("a foreign price near the soft cap stays floored below it and haggles under MAX_FOREIGN_FEE", () => {
    const [legendary] = priceCandidates(
      1e9,
      FOREIGN_CANDIDATES.filter((c) => c.maxSpend === MAX_FOREIGN_FEE)
    );
    expect(legendary!.price).toBeLessThanOrEqual(MAX_UNHAGGLED_FOREIGN_FEE);
    expect(zaokr(legendary!.price * (1 + HAGGLE_SALE_BONUS), 2)).toBeLessThan(MAX_FOREIGN_FEE);
  });
});

test("the quote path never reads hidden potential", () => {
  const source = readFileSync(join(process.cwd(), "src", "logic", "buyers.ts"), "utf8");
  expect(source).not.toMatch(/sufit|ceiling|StaffOutlook|staffMemory|marketEdge/);
});
