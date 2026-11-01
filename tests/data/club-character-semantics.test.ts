import { describe, expect, it } from "vitest";

import { CLUBS, ratingForClubId } from "../../src/data/clubs";
import { initialEuropeanBerth } from "../../src/data/european-berths-2026";
import type { EuropeanCup } from "../../src/data/types";
import { scaledRecurringRevenue } from "../../src/logic/finance-scale";
import { initialClubProjection } from "../../src/logic/league-projection";
import {
  projectedSeasonBalance,
  projectedTransferBudgetChange,
} from "../../src/logic/club-projection";

/**
 * Confronts every one of the eighteen `character` sentences with the live
 * projections they claim to describe.
 *
 * This is deliberately NOT a regex that parses meaning out of the sentence -
 * `docs/decisions/club-character-convention.md` forbids exactly that, and a
 * parser would just be a second, buggier copy of Polish. Instead this file
 * hand-tags, per club, the handful of concrete theses each sentence actually
 * asserts (sporting rank, which side of attack/defence, revenue rank, the
 * operating-margin band, an eligible European cup, backer context) and checks
 * each tag against `initialClubProjection`, `scaledRecurringRevenue` and the
 * sign of `projectedTransferBudgetChange`.
 *
 * A tag is left `null` wherever the sentence's wording is genuinely
 * ambiguous rather than a checkable claim - "stabilne finanse" is not the
 * same assertion as "znaczny deficyt", and forcing a tag onto vague wording
 * would test the tagger's judgement, not the sentence.
 *
 * The fixture is intentionally local to this test - it must never be
 * exported to production, since `character` is authored prose, not
 * something the game derives from data.
 */

type MarginClaim =
  | "nearZero"
  | "lightSurplus"
  | "significantSurplus"
  | "lightDeficit"
  | "significantDeficit"
  | "surplus" // generic: either surplus band
  | "deficit" // generic: either deficit band
  | "extremeDeficit"; // the single most negative margin in the whole league

type SportClaim =
  | "best"
  | "podium"
  | "topThird"
  | "upperHalf"
  | "lowerHalf"
  | "bottomThird"
  | "worst";

type AttackVsDefenceClaim = "strongerAttack" | "strongerDefence";

type RevenueClaim =
  | "highest"
  | "upperThird"
  | "upperHalf"
  | "lowerHalf"
  | "lowerQuartile"
  | "lowest";

type BackerContextClaim = "invested" | "none";

type ClubCharacterFixture = {
  readonly clubId: string;
  readonly sportRank: SportClaim | null;
  readonly attackVsDefence: AttackVsDefenceClaim | null;
  readonly revenueRank: RevenueClaim | null;
  readonly operatingMarginBand: MarginClaim | null;
  readonly europe: EuropeanCup | null;
  readonly backerContext: BackerContextClaim;
};

const FIXTURE: readonly ClubCharacterFixture[] = [
  {
    clubId: "lech-poznan",
    sportRank: "best", // "Najmocniejsza kadra"
    attackVsDefence: null,
    revenueRank: null,
    operatingMarginBand: "surplus", // "zdrowa nadwyżka"
    europe: "LM", // "eliminacjami Ligi Mistrzów"
    backerContext: "none",
  },
  {
    clubId: "legia-warszawa",
    sportRank: "topThird", // "walki o czołówkę"
    attackVsDefence: null,
    revenueRank: "highest", // "Największe przychody ligi"
    operatingMarginBand: "significantSurplus", // "ogromny margines finansowy"
    europe: null,
    backerContext: "none",
  },
  {
    clubId: "rakow-czestochowa",
    sportRank: "podium", // "walkę o tytuł"
    attackVsDefence: null,
    revenueRank: null,
    // "stabilne finanse" is not a checkable directional claim.
    operatingMarginBand: null,
    europe: "LK", // "eliminacje Ligi Konferencji"
    backerContext: "none",
  },
  {
    clubId: "jagiellonia-bialystok",
    sportRank: "upperHalf", // "Kadra górnej połowy"
    attackVsDefence: null,
    revenueRank: null,
    operatingMarginBand: "surplus", // "zdrowy bilans" - and the sign here is actually positive
    europe: "LE", // "eliminacjach Ligi Europy"
    backerContext: "none",
  },
  {
    clubId: "pogon-szczecin",
    sportRank: "upperHalf", // "Kadra na górną połowę"
    attackVsDefence: null,
    revenueRank: "upperThird", // "wysokie przychody"
    operatingMarginBand: "significantSurplus", // "duży margines na przebudowę"
    europe: null,
    backerContext: "none",
  },
  {
    clubId: "gornik-zabrze",
    sportRank: "upperHalf", // "Mocna kadra"
    attackVsDefence: null,
    revenueRank: "lowerHalf", // "skromnym przychodzie"
    operatingMarginBand: "lightDeficit", // "lekkim deficycie"
    europe: "LM", // "eliminacje Ligi Mistrzów"
    backerContext: "none",
  },
  {
    clubId: "cracovia",
    sportRank: null,
    attackVsDefence: "strongerDefence", // "Solidna obrona"
    revenueRank: null,
    operatingMarginBand: "nearZero", // "bilans bliski zera"
    europe: null,
    backerContext: "none",
  },
  {
    clubId: "widzew-lodz",
    sportRank: "podium", // "kadrę na podium"
    attackVsDefence: null,
    revenueRank: "upperHalf", // "górnej połowie ligi"
    operatingMarginBand: null,
    europe: null,
    backerContext: "invested", // "Pieniądze właściciela zbudowały kadrę" - past tense
  },
  {
    clubId: "slask-wroclaw",
    sportRank: "bottomThird", // "walki o utrzymanie"
    attackVsDefence: null,
    revenueRank: null,
    operatingMarginBand: "nearZero", // "bilans bliski zera"
    europe: null,
    backerContext: "none",
  },
  {
    clubId: "piast-gliwice",
    sportRank: "bottomThird", // "Słaba kadra"
    attackVsDefence: "strongerAttack", // "zwłaszcza w obronie" - defence is the weaker side
    revenueRank: null,
    operatingMarginBand: "lightDeficit", // "lekki deficyt"
    europe: null,
    backerContext: "none",
  },
  {
    clubId: "radomiak-radom",
    sportRank: "worst", // "Najniższa prognoza sportowa"
    attackVsDefence: null,
    revenueRank: "lowerQuartile", // "jednym z najniższych przychodów"
    operatingMarginBand: "significantDeficit", // "znaczny deficyt"
    europe: null,
    backerContext: "none",
  },
  {
    clubId: "korona-kielce",
    sportRank: null, // "środka tabeli" is too vague to bucket confidently
    attackVsDefence: null,
    revenueRank: "lowerHalf", // "niski przychód"
    operatingMarginBand: "significantDeficit", // "znaczny deficyt"
    europe: null,
    backerContext: "invested", // "Nowy właściciel już wzmocnił" - past tense
  },
  {
    clubId: "motor-lublin",
    sportRank: null, // "Wyrównana kadra" is not a rank claim
    attackVsDefence: null,
    revenueRank: null,
    operatingMarginBand: "nearZero", // "bilans bliski zera"
    europe: null,
    backerContext: "none",
  },
  {
    clubId: "zaglebie-lubin",
    sportRank: null,
    attackVsDefence: "strongerDefence", // "Słaby atak"
    revenueRank: "upperHalf", // "przychodu z górnej połowy"
    operatingMarginBand: "nearZero", // "bilans bliski zera"
    europe: null,
    backerContext: "none", // KGHM is described as a backdrop, not a support floor
  },
  {
    clubId: "wisla-plock",
    sportRank: null,
    attackVsDefence: "strongerDefence", // "Niezła obrona"
    revenueRank: "lowest", // "najniższy przychód"
    operatingMarginBand: "extremeDeficit", // "najgłębszy deficyt"
    europe: null,
    backerContext: "none",
  },
  {
    clubId: "wisla-krakow",
    sportRank: null,
    attackVsDefence: "strongerAttack", // "Ofensywny profil, słaba obrona"
    revenueRank: null,
    operatingMarginBand: "lightSurplus", // "niewielka nadwyżka"
    europe: null,
    backerContext: "none",
  },
  {
    clubId: "gks-katowice",
    sportRank: null, // "środka tabeli" is too vague to bucket confidently
    attackVsDefence: null,
    revenueRank: null,
    operatingMarginBand: "significantDeficit", // "znaczny deficyt"
    europe: "LK", // "kampania w Lidze Konferencji"
    backerContext: "none",
  },
  {
    clubId: "wieczysta-krakow",
    sportRank: "lowerHalf",
    attackVsDefence: null,
    revenueRank: "lowerQuartile", // "niski przychód"
    operatingMarginBand: "deficit", // "deficyt" (no magnitude word)
    europe: null,
    backerContext: "invested", // "Pieniądze głównego sponsora zbudowały" - past tense
  },
];

describe("club character fixture", () => {
  it("covers every one of the eighteen canonical clubs exactly once", () => {
    expect(FIXTURE).toHaveLength(18);
    expect([...FIXTURE.map((row) => row.clubId)].sort()).toEqual(
      [...CLUBS.map((club) => club.clubId)].sort()
    );
  });
});

const sportedPlaceRank = (clubId: string): number => initialClubProjection(clubId).expectedPlace;

const revenueDescRank = (): Map<string, number> => {
  const sorted = [...CLUBS]
    .map((club) => ({ clubId: club.clubId, revenue: scaledRecurringRevenue(club.clubId) }))
    .sort((a, b) => b.revenue - a.revenue);
  const ranks = new Map<string, number>();
  sorted.forEach((row, index) => ranks.set(row.clubId, index + 1));
  return ranks;
};

const REVENUE_RANK = revenueDescRank();

const marginOf = (clubId: string): number =>
  projectedSeasonBalance(clubId) / scaledRecurringRevenue(clubId);

const bandOf = (
  margin: number
): "nearZero" | "lightSurplus" | "significantSurplus" | "lightDeficit" | "significantDeficit" => {
  if (Math.abs(margin) < 0.1) return "nearZero";
  if (margin > 0) return margin >= 0.25 ? "significantSurplus" : "lightSurplus";
  return margin <= -0.25 ? "significantDeficit" : "lightDeficit";
};

const isExtremeDeficit = (clubId: string): boolean => {
  const margins = CLUBS.map((club) => ({ clubId: club.clubId, margin: marginOf(club.clubId) }));
  const minMargin = Math.min(...margins.map((row) => row.margin));
  return marginOf(clubId) === minMargin;
};

describe("sportRank thesis matches initialClubProjection().expectedPlace", () => {
  const checks: Record<SportClaim, (_place: number) => boolean> = {
    best: (place) => place === 1,
    podium: (place) => place <= 3,
    topThird: (place) => place <= 6,
    upperHalf: (place) => place <= 9,
    lowerHalf: (place) => place >= 10,
    bottomThird: (place) => place >= 13,
    worst: (place) => place === 18,
  };

  for (const row of FIXTURE) {
    if (row.sportRank === null) continue;
    it(`${row.clubId}: "${row.sportRank}"`, () => {
      const place = sportedPlaceRank(row.clubId);
      expect(checks[row.sportRank!](place), `place ${place}`).toBe(true);
    });
  }
});

describe("attackVsDefence thesis matches the active TEAM_RATINGS snapshot", () => {
  for (const row of FIXTURE) {
    if (row.attackVsDefence === null) continue;
    it(`${row.clubId}: "${row.attackVsDefence}"`, () => {
      const rating = ratingForClubId(row.clubId);
      if (row.attackVsDefence === "strongerAttack") {
        expect(rating.attack, JSON.stringify(rating)).toBeGreaterThan(rating.defence);
      } else {
        expect(rating.defence, JSON.stringify(rating)).toBeGreaterThan(rating.attack);
      }
    });
  }
});

describe("revenueRank thesis matches scaledRecurringRevenue's league ranking", () => {
  const checks: Record<RevenueClaim, (_rank: number) => boolean> = {
    highest: (rank) => rank === 1,
    upperThird: (rank) => rank <= 6,
    upperHalf: (rank) => rank <= 9,
    lowerHalf: (rank) => rank >= 10,
    lowerQuartile: (rank) => rank >= 14,
    lowest: (rank) => rank === 18,
  };

  for (const row of FIXTURE) {
    if (row.revenueRank === null) continue;
    it(`${row.clubId}: "${row.revenueRank}"`, () => {
      const rank = REVENUE_RANK.get(row.clubId)!;
      expect(checks[row.revenueRank!](rank), `revenue rank ${rank} of 18`).toBe(true);
    });
  }
});

describe("operatingMarginBand thesis matches projectedSeasonBalance / scaledRecurringRevenue", () => {
  for (const row of FIXTURE) {
    if (row.operatingMarginBand === null) continue;
    it(`${row.clubId}: "${row.operatingMarginBand}"`, () => {
      const margin = marginOf(row.clubId);
      const band = bandOf(margin);
      // The sign of the transfer-budget change must agree with the margin's
      // sign - both read the same pre-transfer, pre-cup balance, and the
      // brief singles this sign out explicitly.
      expect(Math.sign(projectedTransferBudgetChange(row.clubId))).toBe(Math.sign(margin));

      switch (row.operatingMarginBand) {
        case "surplus":
          expect(band, `margin ${margin}`).toMatch(/Surplus$/);
          break;
        case "deficit":
          expect(band, `margin ${margin}`).toMatch(/Deficit$/);
          break;
        case "extremeDeficit":
          expect(band, `margin ${margin}`).toBe("significantDeficit");
          expect(isExtremeDeficit(row.clubId), `margin ${margin}`).toBe(true);
          break;
        default:
          expect(band, `margin ${margin}`).toBe(row.operatingMarginBand);
      }
    });
  }
});

describe("europe thesis matches initialEuropeanBerth", () => {
  for (const row of FIXTURE) {
    it(`${row.clubId}: ${row.europe ?? "no European mention"}`, () => {
      const berth = initialEuropeanBerth(row.clubId);
      expect(berth?.cup ?? null).toBe(row.europe);
    });
  }
});

describe("backerContext thesis matches the club-owner-finance-context audit", () => {
  // Only these three clubs are in the backerSupportFloor measurement grid
  // (docs/decisions/club-owner-finance-context-2026-09-11.md): Widzew and
  // Wieczysta as "strong", Korona as "active". Every other club's owner or
  // sponsor context, however colourful, is "none".
  const BACKED_CLUB_IDS = new Set(["widzew-lodz", "korona-kielce", "wieczysta-krakow"]);

  for (const row of FIXTURE) {
    it(`${row.clubId}: "${row.backerContext}"`, () => {
      const expected = BACKED_CLUB_IDS.has(row.clubId) ? "invested" : "none";
      expect(row.backerContext).toBe(expected);
      // Rule 9 of the convention: a sentence may describe money ALREADY
      // invested in the current squad in the past tense. It may only
      // promise ADDITIONAL cash on top of the shown budget when the active
      // formula has a binding backerSupportFloor - and none of these
      // eighteen sentences makes that stronger, forward-looking claim, so
      // there is nothing here that needs to check `binding`.
    });
  }
});

describe("character sentence form (docs/decisions/club-character-convention.md)", () => {
  const FORBIDDEN_WORDS = [/\błatwy\b/i, /\bśredni\b/i, /\btrudny\b/i];

  for (const club of CLUBS) {
    it(`${club.clubId}: single sentence, no difficulty label, no em dash`, () => {
      const text = club.character;
      expect(text.endsWith(".")).toBe(true);
      // Exactly one sentence: one full stop, and it is the last character.
      expect(text.indexOf(".")).toBe(text.length - 1);
      expect(text).not.toContain(String.fromCodePoint(0x2014));
      for (const forbidden of FORBIDDEN_WORDS) {
        expect(text, text).not.toMatch(forbidden);
      }
      // "docelowo 70-125 znaków" (convention doc) is an aim, not a hard
      // limit, so this leaves generous slack either side of it.
      expect(text.length, text).toBeGreaterThanOrEqual(50);
      expect(text.length, text).toBeLessThanOrEqual(140);
    });
  }
});
