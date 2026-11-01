import { describe, it, expect } from "vitest";
import { playerImpact, sideAdjustment } from "../../src/logic/player-impact";
import type { FormationId, ImpactSide, Player, PositionCode } from "../../src/data/types";
import { selectAnalystProfile } from "../../src/logic/analyst-profile";
import { FORMACJE } from "../../src/data/positions";
import { clubById } from "../../src/data/clubs";
import { clubRating } from "../../src/logic/league-ratings";
import { createSquadFromFormation } from "../../src/logic/squad";
import { createRng } from "../../src/logic/rng";

/**
 * Tests for playerImpact() and sideAdjustment().
 *
 * playerImpact(player) maps the player's stable marketEdge onto one side of
 * the pitch. It does NOT look at `moj`: a market edge is a property of the
 * player, not a bonus the club unlocks by buying him. The starting squad,
 * free agents and academy debutants all carry theirs.
 *
 * sideAdjustment(players, side) sums the relevant delta across all players
 * and divides by the total number of players in the list.
 */

/** Total contribution to one side, before the roster-size divisor. Adding a
 * player changes the divisor, so the averages on both sides move; the sums
 * are what "joining only touches the assigned side" is actually about. */
const sideTotal = (players: readonly Player[], side: ImpactSide): number =>
  players.reduce(
    (total, player) =>
      total +
      (side === "attack" ? playerImpact(player).attackDelta : playerImpact(player).defenceDelta),
    0
  );

/**
 * Create a synthetic test player. Does not require RNG - purely for testing.
 */
const createTestPlayer = (
  id: string,
  poz: PositionCode,
  wiek = 25,
  ovr = 75,
  sufit = 85,
  moj = false
): Player => ({
  id,
  nazwa: `Player ${id}`,
  poz,
  wiek,
  ovr,
  sufit,
  moj,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
});

describe("playerImpact", () => {
  describe("independence from the moj flag", () => {
    it("gives the same impact whether or not the player was signed by the user", () => {
      for (let i = 0; i < 500; i += 1) {
        const unsigned = createTestPlayer(`moj-${i}`, "BR", 25, 75, 85, false);
        const signed = createTestPlayer(`moj-${i}`, "BR", 25, 75, 85, true);

        expect(playerImpact(unsigned)).toEqual(playerImpact(signed));
      }
    });

    it("lets a real starting squad carry positive, zero and negative impact", () => {
      // Never synthetic players sharing one value: a degenerate population
      // would pass this while the real generator produced a flat squad.
      const rng = createRng(0x51a7_0001);
      const club = clubById("gornik-zabrze");
      const seen = new Set<string>();

      for (const id of Object.keys(FORMACJE) as FormationId[]) {
        for (const player of createSquadFromFormation(rng, FORMACJE[id], clubRating(club))) {
          const { attackDelta, defenceDelta } = playerImpact(player);
          const delta = attackDelta + defenceDelta;
          seen.add(delta > 0 ? "positive" : delta < 0 ? "negative" : "zero");
        }
      }

      expect([...seen].sort()).toEqual(["negative", "positive", "zero"]);
    });

    it("moves only the assigned side when a player joins or leaves", () => {
      const squad = Array.from({ length: 11 }, (_, i) =>
        createTestPlayer(`squad-side-${i}`, "BR", 25, 75, 85, false)
      );
      const joiner = createTestPlayer("joiner-side", "ŚP", 24, 78, 84, true);
      const profile = selectAnalystProfile(joiner);
      const untouched: ImpactSide = profile.impactSide === "attack" ? "defence" : "attack";

      const before = { attack: sideTotal(squad, "attack"), defence: sideTotal(squad, "defence") };
      const after = [...squad, joiner];

      expect(sideTotal(after, untouched)).toBe(before[untouched]);
      expect(sideTotal(after, profile.impactSide)).toBe(
        before[profile.impactSide] + profile.marketEdge * 2
      );
      // And leaving puts it back exactly.
      expect(sideTotal(squad, profile.impactSide)).toBe(before[profile.impactSide]);
    });

    it("assigns the edge to exactly one side, never both", () => {
      for (let i = 0; i < 300; i += 1) {
        const player = createTestPlayer(`one-side-${i}`, "ŚPO", 25, 75, 85, false);
        const { attackDelta, defenceDelta } = playerImpact(player);

        expect(attackDelta === 0 || defenceDelta === 0).toBe(true);
      }
    });
  });

  it("turns a maximum marketEdge into a literal 6-point player impact at 2x", () => {
    let checked = false;

    for (let i = 0; i < 1000; i += 1) {
      // Deliberately unsigned: the multiplier applies to everyone.
      const player = createTestPlayer(`max-edge-${i}`, "BR", 25, 75, 85, false);
      const profile = selectAnalystProfile(player);
      if (profile.marketEdge !== 3) continue;

      const impact = playerImpact(player);
      expect(profile.impactSide === "attack" ? impact.attackDelta : impact.defenceDelta).toBe(6);
      checked = true;
      break;
    }

    expect(checked).toBe(true);
  });

  describe("independence from player attributes", () => {
    it("does not change impact when ceiling changes across many stable identities", () => {
      for (let i = 0; i < 500; i += 1) {
        const player1 = createTestPlayer(`p-ceiling-${i}`, "BR", 25, 75, 75, true);
        const player2 = createTestPlayer(`p-ceiling-${i}`, "BR", 25, 75, 95, true);

        expect(playerImpact(player1)).toEqual(playerImpact(player2));
      }
    });

    it("does not change impact when name changes", () => {
      const player1 = createTestPlayer("p-name", "BR", 25, 75, 85, true);
      const player2 = createTestPlayer("p-name", "BR", 25, 75, 85, true);
      player1.nazwa = "Player One";
      player2.nazwa = "Player Two";

      const impact1 = playerImpact(player1);
      const impact2 = playerImpact(player2);

      expect(impact1).toEqual(impact2);
    });

    it("does not change impact when age and OVR change across many stable identities", () => {
      for (let i = 0; i < 500; i += 1) {
        const player1 = createTestPlayer(`p-age-${i}`, "BR", 18, 58, 90, true);
        const player2 = createTestPlayer(`p-age-${i}`, "BR", 30, 80, 90, true);

        expect(playerImpact(player1)).toEqual(playerImpact(player2));
      }
    });

    it("does not change impact when club changes", () => {
      const player1 = createTestPlayer("p-club", "BR", 25, 75, 85, true);
      const player2 = createTestPlayer("p-club", "BR", 25, 75, 85, true);
      player1.nazwa = "Club A Player";
      player2.nazwa = "Club B Player";

      const impact1 = playerImpact(player1);
      const impact2 = playerImpact(player2);

      expect(impact1).toEqual(impact2);
    });
  });

  describe("no mutation", () => {
    it("does not mutate player object", () => {
      const player = createTestPlayer("p-mutation", "BR", 25, 75, 85, true);
      const originalOvr = player.ovr;
      const originalMoj = player.moj;

      playerImpact(player);

      expect(player.ovr).toBe(originalOvr);
      expect(player.moj).toBe(originalMoj);
    });

    it("does not mutate player.ovr", () => {
      const player = createTestPlayer("p-ovr-mutation", "BR", 25, 75, 85, true);
      const originalOvr = player.ovr;

      playerImpact(player);

      expect(player.ovr).toBe(originalOvr);
    });
  });
});

describe("sideAdjustment", () => {
  describe("aggregation formula", () => {
    it("returns 0 for empty list", () => {
      const result = sideAdjustment([], "attack");
      expect(result).toBe(0);
    });

    it("divides by total list length, including players who contribute nothing", () => {
      // Every player now carries an edge, so the divisor is no longer the
      // only thing the unsigned members of the list affect: they are part of
      // the sum too. Both halves of the formula are asserted from the same
      // eleven, computed independently of the function under test.
      const players = Array.from({ length: 11 }, (_, i) =>
        createTestPlayer(`divisor-${i}`, "BR", 25, 75, 85, false)
      );

      expect(sideAdjustment(players, "attack")).toBe(sideTotal(players, "attack") / 11);
      expect(sideAdjustment(players, "defence")).toBe(sideTotal(players, "defence") / 11);
    });

    it("keeps the two sides independent", () => {
      const players = Array.from({ length: 11 }, (_, i) =>
        createTestPlayer(`independent-${i}`, "ŚPO", 25, 75, 85, i === 0)
      );

      // A player assigned to attack must leave the defence sum untouched, and
      // the other way round. Summing both sides back up recovers every edge.
      const total = sideTotal(players, "attack") + sideTotal(players, "defence");
      const perPlayer = players.reduce(
        (acc, player) => acc + selectAnalystProfile(player).marketEdge * 2,
        0
      );

      expect(total).toBe(perPlayer);
      expect(sideAdjustment(players, "attack")).toBe(sideTotal(players, "attack") / 11);
      expect(sideAdjustment(players, "defence")).toBe(sideTotal(players, "defence") / 11);
    });

    it("goes negative when the list leans that way", () => {
      let negative: Player | null = null;
      for (let i = 0; i < 200; i += 1) {
        const player = createTestPlayer(`negative-${i}`, "BR", 25, 75, 85, false);
        if (playerImpact(player).attackDelta < 0) {
          negative = player;
          break;
        }
      }

      expect(negative).not.toBeNull();
      expect(sideAdjustment([negative!], "attack")).toBeLessThan(0);
    });
  });
});
