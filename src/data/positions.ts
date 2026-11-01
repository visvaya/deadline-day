import type { Formation, FormationId, FormationSlot, PositionCode, PositionGroup } from "./types";

// TYPY i KOLEJNOSC_XI znikneły 2026-08-17. Były jedyną listą pozycji
// prototypu i po podpięciu formacji zostały wyłącznie jako wartość domyślna
// w squad.ts - a domyślna wartość w tym miejscu znaczyła "wynik, który
// wygląda wiarygodnie i jest zły": kadra zbudowana z formacji dzieli z tą
// listą kilka kodów, więc jedenastka wracała mniej więcej pięcioosobowa.
// Cztery wywołania faktycznie o formację zapomniały. Teraz jest wymagana.

/**
 * Which of the four broad lines a position code belongs to - display
 * grouping (squad-grid.tsx's formation lines, offer-card.tsx's percentile
 * context) and scoutReport's four-branch text (scout-report.ts), never read
 * by the match engine itself. Covers all seventeen codes, unlike TYPY's
 * eight - grupaPoz used to fall back to "POM" for the nine formation-only
 * codes, which misclassified even N (a pure striker) as a midfielder in
 * scouting text. Fixed 2026-08-14 alongside the formation wiring.
 */
const POSITION_GROUP: Record<PositionCode, PositionGroup> = {
  BR: "BR",
  ŚO: "OBR",
  LO: "OBR",
  PO: "OBR",
  CLS: "OBR",
  CPS: "OBR",
  ŚPD: "POM",
  ŚP: "POM",
  LP: "POM",
  PP: "POM",
  ŚPO: "POM",
  LS: "ATK",
  PS: "ATK",
  CN: "ATK",
  N: "ATK",
  POM: "POM",
  ŚN: "ATK",
};

export const grupaPoz = (kod: PositionCode): PositionGroup => POSITION_GROUP[kod];

/**
 * The seven formations a career can be dealt. Drawn once at club selection
 * and fixed for the whole game: a formation that moved would take away the
 * one thing the player plans, which is transfers.
 *
 * Depth is uniformly one over the starting count. That uniformity is
 * deliberate - a formation with fewer distinct positions would otherwise
 * carry a smaller squad, pay less in wages and finish with more cash, which
 * would decide part of the game before the first decision.
 */
const def = (kod: PositionCode, xi: number): FormationSlot => ({ kod, xi, kadra: xi + 1 });

export const FORMACJE: Record<FormationId, Formation> = {
  "4-3-3": {
    id: "4-3-3",
    pozycje: [
      def("BR", 1),
      def("LO", 1),
      def("ŚO", 2),
      def("PO", 1),
      def("ŚPD", 1),
      def("ŚP", 1),
      def("ŚPO", 1),
      def("LS", 1),
      def("N", 1),
      def("PS", 1),
    ],
    kolejnoscXi: ["BR", "LO", "ŚO", "ŚO", "PO", "ŚPD", "ŚP", "ŚPO", "LS", "N", "PS"],
  },
  "4-4-2": {
    id: "4-4-2",
    pozycje: [
      def("BR", 1),
      def("LO", 1),
      def("ŚO", 2),
      def("PO", 1),
      def("LP", 1),
      def("ŚP", 2),
      def("PP", 1),
      def("N", 2),
    ],
    kolejnoscXi: ["BR", "LO", "ŚO", "ŚO", "PO", "LP", "ŚP", "ŚP", "PP", "N", "N"],
  },
  "4-2-3-1": {
    id: "4-2-3-1",
    pozycje: [
      def("BR", 1),
      def("LO", 1),
      def("ŚO", 2),
      def("PO", 1),
      def("ŚPD", 2),
      def("LS", 1),
      def("ŚPO", 1),
      def("PS", 1),
      def("N", 1),
    ],
    kolejnoscXi: ["BR", "LO", "ŚO", "ŚO", "PO", "ŚPD", "ŚPD", "ŚPO", "LS", "N", "PS"],
  },
  "4-1-4-1": {
    id: "4-1-4-1",
    pozycje: [
      def("BR", 1),
      def("LO", 1),
      def("ŚO", 2),
      def("PO", 1),
      def("ŚPD", 1),
      def("LP", 1),
      def("ŚP", 2),
      def("PP", 1),
      def("N", 1),
    ],
    kolejnoscXi: ["BR", "LO", "ŚO", "ŚO", "PO", "LP", "ŚPD", "ŚP", "ŚP", "PP", "N"],
  },
  "4-5-1": {
    id: "4-5-1",
    pozycje: [
      def("BR", 1),
      def("LO", 1),
      def("ŚO", 2),
      def("PO", 1),
      def("LP", 1),
      def("ŚPD", 1),
      def("ŚP", 1),
      def("ŚPO", 1),
      def("PP", 1),
      def("N", 1),
    ],
    kolejnoscXi: ["BR", "LO", "ŚO", "ŚO", "PO", "LP", "ŚPD", "ŚP", "ŚPO", "PP", "N"],
  },
  "3-5-2": {
    id: "3-5-2",
    // CLS/CPS are wing-backs, i.e. always defenders - they only ever sit
    // next to ŚO in kolejnoscXi (see 5-3-2 below). A back-3 shape that wants
    // a five-man midfield line instead uses LP/PP, not a relabelled pair of
    // defenders.
    pozycje: [
      def("BR", 1),
      def("ŚO", 3),
      def("LP", 1),
      def("ŚPD", 1),
      def("ŚP", 1),
      def("ŚPO", 1),
      def("PP", 1),
      def("CN", 1),
      def("N", 1),
    ],
    kolejnoscXi: ["BR", "ŚO", "ŚO", "ŚO", "LP", "ŚPD", "ŚP", "ŚPO", "PP", "CN", "N"],
  },
  "5-3-2": {
    id: "5-3-2",
    pozycje: [
      def("BR", 1),
      def("CLS", 1),
      def("ŚO", 3),
      def("CPS", 1),
      def("ŚPD", 1),
      def("ŚP", 1),
      def("ŚPO", 1),
      def("CN", 1),
      def("N", 1),
    ],
    kolejnoscXi: ["BR", "CLS", "ŚO", "ŚO", "ŚO", "CPS", "ŚPD", "ŚP", "ŚPO", "CN", "N"],
  },
};
