/**
 * Pure functions for computing a player's impact on club ratings.
 *
 * playerImpact(player) derives a player's attack/defence delta from their
 * analyst profile. Every player carries one: the market edge is a property of
 * the footballer, not a bonus the club unlocks by signing him. The starting
 * squad, free agents, academy debutants and the user's own transfers are all
 * treated identically.
 *
 * sideAdjustment(players, side) aggregates these impacts across a squad list,
 * dividing by the total roster size (not just active players).
 */

import { selectAnalystProfile } from "./analyst-profile";
import { MARKET_EDGE_IMPACT_MULTIPLIER } from "../data/balance";
import type { Player, PlayerImpact, ImpactSide } from "../data/types";

/**
 * Derive a player's impact on club attack or defence rating.
 *
 * Calls selectAnalystProfile() to determine the position group and domain
 * assignment, then assigns the profile's marketEdge to the matching side
 * (attack or defence) and leaves the other at 0.
 *
 * Pure function: does not mutate the player object.
 * Deterministic: depends only on player.id and player.poz. Notably NOT on
 * player.moj - see the file header.
 *
 * @param player - The player to evaluate. Only player.id and player.poz matter.
 * @returns PlayerImpact with attackDelta and defenceDelta.
 */
export const playerImpact = (player: Player): PlayerImpact => {
  const profile = selectAnalystProfile(player);

  // Assign marketEdge to the matching side, zero to the other. The multiplier
  // lives here and nowhere else: it changes what reading a report correctly is
  // worth, not what the report says.
  const delta = profile.marketEdge * MARKET_EDGE_IMPACT_MULTIPLIER;
  if (profile.impactSide === "attack") {
    return {
      attackDelta: delta,
      defenceDelta: 0,
    };
  } else {
    // profile.impactSide === "defence"
    return {
      attackDelta: 0,
      defenceDelta: delta,
    };
  }
};

/**
 * Aggregate a squad's impact on a single side (attack or defence).
 *
 * Sums the relevant delta (attackDelta for "attack", defenceDelta for "defence")
 * across all players via playerImpact(), then divides by the total roster size.
 * The divisor is the whole list, including players whose edge lands on the
 * other side and contributes nothing here: the squad's overall strength is
 * measured against a fixed squad size.
 *
 * For an empty list, returns 0.
 *
 * Pure function: does not mutate the players array or any player object.
 * Deterministic: depends only on the player list and the chosen side.
 *
 * @param players - The squad list (typically 11-13 players).
 * @param side - "attack" or "defence".
 * @returns The aggregated delta per player, divided by roster size. One player's range is [-6/n, 6/n].
 */
export const sideAdjustment = (players: Player[], side: ImpactSide): number => {
  if (players.length === 0) {
    return 0;
  }

  const sum = players.reduce((acc, player) => {
    const impact = playerImpact(player);
    const delta = side === "attack" ? impact.attackDelta : impact.defenceDelta;
    return acc + delta;
  }, 0);

  return sum / players.length;
};
