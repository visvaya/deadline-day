import type { MarketState } from "./types";

export const RYNEK_OPIS: Record<
  MarketState,
  { znak: string; klasa: string; mnoznikCeny: number; wagaKupno: number; wagaSprzedaz: number }
> = {
  obfity: { znak: "▼", klasa: "dd-zie", mnoznikCeny: 0.78, wagaKupno: 3.2, wagaSprzedaz: 0.4 },
  spokoj: { znak: "=", klasa: "dd-sza", mnoznikCeny: 1.0, wagaKupno: 1.4, wagaSprzedaz: 1.0 },
  pusty: { znak: "▲", klasa: "dd-cze", mnoznikCeny: 1.4, wagaKupno: 0.4, wagaSprzedaz: 2.6 },
};
