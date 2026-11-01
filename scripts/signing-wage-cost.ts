import type { GameState, Player } from "../src/data/types";
import { playerWage, totalPayroll } from "../src/logic/wages";

/**
 * The squad a tenure season's payroll was charged on, captured by a step
 * observer. The reducer charges `totalPayroll(state.kadra)` at settlement and
 * writes it to the season event as `place` (rounded to 0,01), so the snapshot
 * is checked against that figure: a mismatch means the reconstruction below
 * disagrees with the engine and this measurement would be wrong.
 *
 * The squad here is NOT `before.kadra` of the dispatch that carries the
 * `season` event. The winter window's last card is always decided in the
 * SAME dispatch that settles the season - `nastepnaKarta` cascades straight
 * into the settlement once `ruchy` hits zero (game-reducer.ts) - so that
 * card's own effect (a signing, an eviction, a contract renewal's new wage)
 * is already inside `event.place` but not yet inside `before.kadra`.
 * `reconstructSettledSquad` below undoes the one transformation the reducer
 * runs AFTER settlement instead - `ageSquad` - using state the reducer
 * already publishes for other reasons (`ovrChange`, `wynikSezonu`), so the
 * result is the squad exactly as it stood when `place` was computed.
 */
export type SettlementSnapshot = {
  readonly season: number;
  readonly squad: readonly Player[];
  readonly chargedPayroll: number;
};

const PAYROLL_TOLERANCE = 0.005;

/**
 * Undoes `ageSquad` and `fillEmptyPositions` on `after.kadra` to recover the
 * squad as it stood at settlement, right after the season's last card and
 * right before development, retirement and the academy refill:
 *
 * - drops this season's academy debutants (`wynikSezonu.debiutanci`) - they
 *   are new members for the season AHEAD, never on the season being settled;
 * - reverses each remaining player's development delta (`ovrChange.byPlayer`)
 *   to recover his settlement-time ovr; `mnoznikPlacy` is untouched by
 *   `ageSquad`, so the wage a renewed contract landed on carries over as-is;
 * - adds back this season's retirees (`wynikSezonu.emeryci`, already stored
 *   at "the ovr he actually played", per development.ts) and the players who
 *   left after declining a renewal (`wynikSezonu.odeszli`) - both are gone
 *   from `after.kadra` but were still on the payroll `place` charged.
 *
 * Falls back to `after.kadra` untouched when `wynikSezonu`/`ovrChange` do not
 * (yet) describe this season - only reachable from a synthetic fixture that
 * skips those fields, never from a real dispatch, where the mismatch check
 * below still catches the resulting disagreement.
 */
const reconstructSettledSquad = (after: GameState, sezon: number): readonly Player[] => {
  const seasonResult = after.wynikSezonu;
  if (!seasonResult || seasonResult.sezon !== sezon) return after.kadra;
  const ovrDeltas =
    after.ovrChange && after.ovrChange.season === sezon ? after.ovrChange.byPlayer : {};
  const debutantIds = new Set(seasonResult.debiutanci.map((debutant) => debutant.id));
  const kept = after.kadra
    .filter((player) => !debutantIds.has(player.id))
    .map((player) => {
      const delta = ovrDeltas[player.id];
      return delta === undefined ? player : { ...player, ovr: player.ovr - delta };
    });
  return [...kept, ...seasonResult.emeryci, ...seasonResult.odeszli];
};

/**
 * Records one snapshot per played tenure season, built from the `onStep`
 * hook: on every dispatch that adds a `season` trace event, the settled
 * squad is reconstructed from the state the SAME dispatch published (see
 * `reconstructSettledSquad`) and checked against the payroll the reducer
 * actually charged.
 */
export const createSettlementRecorder = (): {
  readonly onStep: (_before: GameState, _after: GameState) => void;
  readonly settlements: () => readonly SettlementSnapshot[];
} => {
  let recorded: readonly SettlementSnapshot[] = [];
  const onStep = (before: GameState, after: GameState): void => {
    for (const event of after.trace.slice(before.trace.length)) {
      if (event.type !== "season") continue;
      const squad = reconstructSettledSquad(after, event.sezon);
      const payroll = totalPayroll(squad);
      if (Math.abs(payroll - event.place) > PAYROLL_TOLERANCE) {
        throw new Error(
          `settlement payroll mismatch in season ${event.sezon}: squad ${payroll} vs charged ${event.place}`
        );
      }
      recorded = [...recorded, { season: event.sezon, squad, chargedPayroll: event.place }];
    }
  };
  return { onStep, settlements: () => recorded };
};

/**
 * Sums the wage a signed player actually cost across every settlement he was
 * still on the payroll for - his own tenure seasons, not the club's. A player
 * absent from every settlement (never signed, or signed and gone before the
 * next one) costs nothing and is on the payroll zero seasons.
 */
export const wageCostOf = (
  settlements: readonly SettlementSnapshot[],
  playerId: string
): { seasonsOnPayroll: number; wageCostToHandover: number } =>
  settlements.reduce(
    (acc, settlement) => {
      const player = settlement.squad.find((candidate) => candidate.id === playerId);
      return player === undefined
        ? acc
        : {
            seasonsOnPayroll: acc.seasonsOnPayroll + 1,
            wageCostToHandover: acc.wageCostToHandover + playerWage(player),
          };
    },
    { seasonsOnPayroll: 0, wageCostToHandover: 0 }
  );
