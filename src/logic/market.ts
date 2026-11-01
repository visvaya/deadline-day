import type { Formation, Market, MarketState, PositionCode } from "../data/types";
import { POSITION_WEIGHTS } from "../data/balance";
import { RYNEK_OPIS } from "../data/market-states";
import { pick, type Rng } from "./rng";

/** Mirrors prototype's losujRynek :120-127, now over the formation's own
 * positions. Codes the formation does not use are filled with "spokoj"
 * rather than left undefined, so every read stays total and no caller needs
 * a fallback. They are never drawn from: pickMarketPosition walks the same
 * formation. */
export const rollMarket = (rng: Rng, formation: Formation): Market => {
  const r = {} as Market;
  for (const kod of Object.keys(POSITION_WEIGHTS) as PositionCode[]) r[kod] = "spokoj";
  formation.pozycje.forEach((t) => {
    const x = rng.next();
    r[t.kod] = x < 0.28 ? "obfity" : x < 0.72 ? "spokoj" : "pusty";
  });
  return r;
};

/**
 * Mirrors prototype's losujPozycjeZRynku :129-136, extended with an optional
 * exclusion list (used by PANIC to stay off the "obfity" market). Falls back to the unfiltered pool
 * when every position is excluded, so the draw never throws on an empty
 * pool - single rng.next() call either way, so draw order is unaffected.
 */
export const pickMarketPosition = (
  rng: Rng,
  rynek: Market,
  formation: Formation,
  kierunek: "kupno" | "sprzedaz",
  exclude: readonly MarketState[] = []
): PositionCode => {
  const buildPool = (applyExclude: boolean): PositionCode[] => {
    const pula: PositionCode[] = [];
    formation.pozycje.forEach((t) => {
      if (applyExclude && exclude.includes(rynek[t.kod])) return;
      const w = RYNEK_OPIS[rynek[t.kod]][kierunek === "kupno" ? "wagaKupno" : "wagaSprzedaz"];
      for (let i = 0; i < Math.round(w * 10); i++) pula.push(t.kod);
    });
    return pula;
  };
  const pula = buildPool(true);
  return pick(rng, pula.length ? pula : buildPool(false));
};
