import { expect, test } from "vitest";

import { formatTrace, type TraceEvent } from "../src/logic/trace-format";

test("renders a start line with a dot decimal separator", () => {
  const events: TraceEvent[] = [
    {
      type: "start",
      seed: 918273,
      clubId: "wieczysta-krakow",
      club: "Wieczysta",
      budget: 0.9,
      formation: "4-3-3",
      tenureHandicap: 110,
      legacyHandicap: 130,
      rngDrawCount: 412,
    },
  ];
  expect(formatTrace(events)).toBe(
    "seed=918273 clubId=wieczysta-krakow club=Wieczysta budget=0.90 formation=4-3-3 " +
      "tenureHandicap=110.00 legacyHandicap=130.00 rngDraws=412"
  );
});

test("rounds floats to two places so reordering a sum cannot break a golden", () => {
  const events: TraceEvent[] = [
    {
      type: "start",
      seed: 1,
      clubId: "legia-warszawa",
      club: "Legia",
      budget: 0.1 + 0.2,
      formation: "4-3-3",
      tenureHandicap: 0,
      legacyHandicap: 0,
      rngDrawCount: 0,
    },
  ];
  expect(formatTrace(events)).toContain("budget=0.30");
});

test("renders a decision line", () => {
  const events: TraceEvent[] = [
    {
      type: "decision",
      index: 3,
      kartaTyp: "KUPNO",
      poz: "SN",
      ovr: 71,
      wiek: 24,
      ceiling: 75,
      cena: 1.8,
      akcje: ["CZAS", "CZAS", "TARG"],
      wynik: "UTARG",
      cenaKoncowa: 1.61,
      kasa: 0.29,
      season: 2,
      payrollBefore: 4.007,
      payrollAfter: 4.2049,
      signedPlayerId: "p42",
      signedAnnualWage: 0.2,
      signedBaseAnnualWage: 0.25,
      buyer: null,
    },
  ];
  expect(formatTrace(events)).toBe(
    "    3 KUPNO        SN  ovr=71 wiek=24 ceiling=75 cena=1.80 -> CZAS CZAS TARG:UTARG " +
      "cena=1.61 kasa=0.29 season=2 payrollBefore=4.01 payrollAfter=4.20 " +
      "signedPlayerId=p42 signedAnnualWage=0.20 signedBaseAnnualWage=0.25"
  );
});

test("renders a decision line's buyer only when a SPRZEDAZ card named one", () => {
  const events: TraceEvent[] = [
    {
      type: "decision",
      index: 4,
      kartaTyp: "SPRZEDAZ",
      poz: "SN",
      ovr: 71,
      wiek: 24,
      ceiling: 75,
      cena: 1.8,
      akcje: ["BIERZ"],
      wynik: "OK",
      cenaKoncowa: 1.8,
      kasa: 0.29,
      season: 2,
      payrollBefore: 4.007,
      payrollAfter: 3.9,
      signedPlayerId: null,
      signedAnnualWage: null,
      signedBaseAnnualWage: null,
      buyer: "legia-warszawa",
    },
  ];
  expect(formatTrace(events)).toBe(
    "    4 SPRZEDAZ     SN  ovr=71 wiek=24 ceiling=75 cena=1.80 -> BIERZ:OK " +
      "cena=1.80 kasa=0.29 season=2 payrollBefore=4.01 payrollAfter=3.90 " +
      "signedPlayerId=brak signedAnnualWage=brak signedBaseAnnualWage=brak buyer=legia-warszawa"
  );
});

test("renders epilogue headlines as ids, never as text", () => {
  const events: TraceEvent[] = [
    { type: "epilogue", nr: 7, miejsce: 6, pkt: 44, naglowki: ["TRANSFER_ZAGRANICA", "PRZELOM"] },
  ];
  expect(formatTrace(events)).toBe("== EPILOG s7 miejsce=6 pkt=44 [TRANSFER_ZAGRANICA, PRZELOM]");
});

test("renders the second-chance line with the passed player's ceiling", () => {
  const events: TraceEvent[] = [{ type: "secondChance", ceiling: 81 }];
  expect(formatTrace(events)).toBe("== DRUGA_SZANSA ceiling=81");
});

test("joins events with newlines in order", () => {
  const events: TraceEvent[] = [
    { type: "window", sezon: 1, tura: "LATO", ruchy: 8 },
    { type: "half", sezon: 1, polowa: 1, pkt: 19, bz: 12, bs: 8 },
  ];
  expect(formatTrace(events)).toBe("== S1 LATO ruchy=8\n== S1 R1 pkt=19 bz=12 bs=8");
});
