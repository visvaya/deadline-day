/**
 * Stable per-player domain assignment for analyst reports.
 *
 * Each player gets a deterministic profile independent of their ceiling, OVR,
 * age, club, formation, or the main RNG stream. Profiles consist of:
 * - One of three metric bundles for their position group
 * - An impact side (attack/defence)
 * - A marketEdge in [-3, 3] representing current sporting value the market's
 *   OVR-and-age valuation does not capture
 *
 * All components derive purely from player.id and position group via stable seeds.
 */

import { ANALYST_BUNDLES, analystPositionGroup } from "../data/analyst-metrics";
import type { AnalystProfile, Player } from "../data/types";
import { deriveSeed } from "./stable-seed";
import { createRng } from "./rng";
import { at } from "./invariant";

/**
 * Select or derive an analyst profile for a player.
 * Deterministic, stable, and independent of ceiling, OVR, age, club and the
 * main RNG.
 *
 * Process:
 * 1. Get position group from player position code
 * 2. Use deriveSeed(player.id, group, "analyst-bundle-v1") to pick one of three bundles uniformly
 * 3. Use the historical analyst-domain seed to compute marketEdge [-3, 3]
 */
export const selectAnalystProfile = (player: Player): AnalystProfile => {
  const pos = player.poz;
  const group = analystPositionGroup(pos);

  // Step 1: Select bundle uniformly from the three bundles for this position group
  const bundleSeed = deriveSeed(player.id, group, "analyst-bundle-v1");
  const bundles = ANALYST_BUNDLES[group];
  const bundleIndex = bundleSeed % 3; // Deterministic uniform pick from [0, 1, 2]
  const bundle = at(bundles, bundleIndex, "analyst bundle for position group");

  // Step 2: draw the player's hidden market edge once from stable identity.
  // The historical seed NAMESPACE is kept, not the values: the pre-talent code
  // was `deltaSeed % 7` and this is `createRng(deltaSeed).next() * 7`, which
  // is a different draw from the same seed. Keeping the namespace only avoids
  // inventing a new one for no reason.
  const edgeRng = createRng(deriveSeed(player.id, group, bundle.id, "analyst-domain-v1"));
  const edgeIndex = Math.min(6, Math.floor(edgeRng.next() * 7)); // Uniform [0, 6]
  const marketEdge = edgeIndex - 3; // Maps [0, 1, 2, 3, 4, 5, 6] to [-3, 3]

  return {
    ...bundle,
    group,
    marketEdge,
  };
};
