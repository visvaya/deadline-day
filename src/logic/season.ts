import { SEZONY_GRY } from "../data/balance";
import type { LeagueStanding, ScheduleStep } from "../data/types";
import { sortStandings } from "./league";
import type { Rng } from "./rng";

/** Mirrors prototype's harmonogram :125-136. Deterministic, no rng. */
export const buildSchedule = (): ScheduleStep[] => {
  const k: ScheduleStep[] = [];
  for (let s = 1; s <= SEZONY_GRY; s++) {
    k.push({ typ: "okno", sezon: s, tura: "lato", ruchy: 4 });
    k.push({ typ: "runda", sezon: s, polowa: 1 });
    k.push({ typ: "okno", sezon: s, tura: "zima", ruchy: 2 });
    k.push({ typ: "runda", sezon: s, polowa: 2 });
    k.push({ typ: "koniecSezonu", sezon: s });
  }
  k.push({ typ: "werdykt" });
  return k;
};

export type SeasonOutcome = {
  tabela: LeagueStanding[];
  miejsce: number;
  puchar: boolean;
  mistrz: boolean;
};

/**
 * The final table, position and Polish Cup outcome for one season. The table
 * now arrives already played (game-reducer and epilogue both run the
 * fixtures themselves); this function only sorts it, reads off the position
 * and draws the cup.
 *
 * Draw order is part of the golden contract: the cup draw comes after the
 * season is played, before anything europe-related.
 */
export const resolveSeasonOutcome = (
  rng: Rng,
  standings: readonly LeagueStanding[],
  klubKrotko: string,
  strength: number
): SeasonOutcome => {
  const tabela = sortStandings(standings).map((row) =>
    row.club === klubKrotko ? { ...row, isPlayer: true as const } : row
  );
  const miejsce = tabela.findIndex((row) => row.isPlayer) + 1;
  const puchar = rng.next() < Math.max(0.08, (strength - 60) / 60);
  const mistrz = miejsce === 1;
  return { tabela, miejsce, puchar, mistrz };
};
