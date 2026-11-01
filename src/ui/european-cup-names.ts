import type { EuropeanCup, EuropeanStage } from "../data/types";

/** Player-facing names for the three cup codes. Polish, like the rest of the
 * UI layer - the codes themselves (LM/LE/LK) stay data, not identifiers. */
export const EUROPEAN_CUP_NAMES: Record<EuropeanCup, string> = {
  LM: "Liga Mistrzów",
  LE: "Liga Europy",
  LK: "Liga Konferencji",
};

/** Player-facing label for how far a season's own campaign went. */
export const EUROPEAN_STAGE_LABELS: Record<EuropeanStage, string> = {
  qualifying: "odpadł w eliminacjach",
  league: "faza ligowa",
  knockout: "faza pucharowa",
};
