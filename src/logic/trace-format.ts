/**
 * Golden trace serialisation. Text, not JSON: the diff is the test result.
 *
 * Floats are rounded to two places so reordering a sum inside the engine
 * cannot flip a low-order bit and break a golden with no real behaviour
 * change. Field order is fixed and explicit - never Object.keys, which the
 * JS engine reorders for numeric-looking keys.
 */
export type TraceEvent =
  | {
      type: "start";
      seed: number;
      /** The chosen club, canonical id and short display name. Replaces
       * `poziom`/`klub` (2026-09-14): the club is picked, not drawn from a
       * difficulty pool, so there is no level label left to record. */
      clubId: string;
      club: string;
      budget: number;
      formation: string;
      /** The two handicaps `career-baseline.ts` froze for this club, so an
       * audit of the trace alone can tell what yardstick the verdict and the
       * legacy score were judged against. */
      tenureHandicap: number;
      legacyHandicap: number;
      /** GameState.rngDrawCount at the moment this event was emitted. */
      rngDrawCount: number;
    }
  | { type: "window"; sezon: number; tura: string; ruchy: number }
  | {
      type: "decision";
      index: number;
      kartaTyp: string;
      poz: string;
      ovr: number;
      wiek: number;
      ceiling: number;
      cena: number;
      akcje: string[];
      wynik: string;
      cenaKoncowa: number;
      kasa: number;
      /** The season the decision was taken in, read before the cascade can
       * move on to the next schedule step. */
      season: number;
      /** Squad wage bill, in mln EUR per year, immediately before and after
       * this decision - before the season's ageing, which runs later in the
       * same dispatch. */
      payrollBefore: number;
      payrollAfter: number;
      /** Non-null only when a player actually joined the squad on this
       * decision. Neither the action token nor the payroll delta can stand
       * in for it: a haggle can be lost, funds can run out, and an eviction
       * can make the delta negative. */
      signedPlayerId: string | null;
      /** The wage the signing was actually put on, and the same wage before
       * the stalling penalty and any wage haggle. Both in mln EUR per year. */
      signedAnnualWage: number | null;
      signedBaseAnnualWage: number | null;
      /** clubId of the SPRZEDAZ buyer; null for every other card. */
      buyer: string | null;
    }
  | {
      /**
       * The season's income forecast, at the moment it was frozen: after the
       * squad exists and the cup is known, before the first summer card.
       *
       * Recorded because the freeze is the contract the HUD rests on - a
       * transfer moves the forecast by exactly minus the change in the whole
       * payroll - and a frozen value that nothing writes down is a contract
       * nothing can audit. `bilans` deliberately excludes the expected
       * european money, so it is the drift control of the spec's chapter
       * 12.2 rather than the number on screen.
       */
      type: "forecast";
      sezon: number;
      miejsce: number;
      europa: number;
      przychod: number;
      place: number;
      bilans: number;
    }
  | { type: "half"; sezon: number; polowa: number; pkt: number; bz: number; bs: number }
  | {
      type: "season";
      sezon: number;
      miejsce: number;
      pkt: number;
      bilans: number;
      place: number;
      puchar: boolean;
      /** "LM" | "LE" | "LK" | "brak" - the cup qualified for next season. */
      europa: string;
      /** Every leg of this season's own campaign, e.g. "LM/qualifying>LE/league".
       * "brak" when the club did not play in Europe this season. */
      kampania: string;
      kasaEuro: number;
      /** The club's cash AFTER this season was settled. The balance alone
       * cannot answer "what did the manager hand over", and the running total
       * is what the five-season drift control is computed against. */
      kasa: number;
      /** squadStrength as symulujRunde computed it for the spring round -
       * the exact number that went into the league table, the Polish Cup
       * draw and resolveSeasonalEuropeanOutcome. Recorded because it is
       * load-bearing and was, until 2026-09-02, invisible: an audit could
       * only guess at the strength a club actually takes into Europe. */
      sila: number;
      emeryci: number;
      bz: number;
      bs: number;
      /** "wygrany" | "przegrany" | "brak" - the Super Cup, if the club played it. */
      superpuchar: string;
      /** Draws consumed by the career at the moment this event was emitted.
       * The dispatch may keep drawing afterwards (next season's market), so
       * the state's own counter can end up higher. */
      rngDrawCount: number;
    }
  | { type: "verdict"; ocena: number; tytul: string }
  | { type: "epilogue"; nr: number; miejsce: number; pkt: number; naglowki: string[] }
  | { type: "secondChance"; ceiling: number }
  | { type: "end"; dziedzictwo: number; kasa: number; tytul: string; nastepny: number | null };

const num = (value: number): string => value.toFixed(2);
const alignLeft = (value: string, width: number): string => value.padEnd(width);
const alignRight = (value: string, width: number): string => value.padStart(width);
const bool = (value: boolean): string => (value ? "tak" : "nie");
const optNum = (value: number | null): string => (value === null ? "brak" : num(value));

const formatEvent = (event: TraceEvent): string => {
  switch (event.type) {
    case "start":
      return (
        `seed=${event.seed} clubId=${event.clubId} club=${event.club} ` +
        `budget=${num(event.budget)} formation=${event.formation} ` +
        `tenureHandicap=${num(event.tenureHandicap)} legacyHandicap=${num(event.legacyHandicap)} ` +
        `rngDraws=${event.rngDrawCount}`
      );
    case "window":
      return `== S${event.sezon} ${event.tura} ruchy=${event.ruchy}`;
    case "decision":
      return (
        `${alignRight(String(event.index), 5)} ${alignLeft(event.kartaTyp, 13)}${alignLeft(event.poz, 4)}` +
        `ovr=${event.ovr} wiek=${event.wiek} ceiling=${event.ceiling} cena=${num(event.cena)} -> ` +
        `${event.akcje.join(" ")}:${event.wynik} cena=${num(event.cenaKoncowa)} kasa=${num(event.kasa)} ` +
        `season=${event.season} payrollBefore=${num(event.payrollBefore)} ` +
        `payrollAfter=${num(event.payrollAfter)} signedPlayerId=${event.signedPlayerId ?? "brak"} ` +
        `signedAnnualWage=${optNum(event.signedAnnualWage)} ` +
        `signedBaseAnnualWage=${optNum(event.signedBaseAnnualWage)}${
          event.buyer === null ? "" : ` buyer=${event.buyer}`
        }`
      );
    case "forecast":
      return (
        `== S${event.sezon} PROGNOZA miejsce=${event.miejsce} europa=${num(event.europa)} ` +
        `przychod=${num(event.przychod)} place=${num(event.place)} bilans=${num(event.bilans)}`
      );
    case "half":
      return `== S${event.sezon} R${event.polowa} pkt=${event.pkt} bz=${event.bz} bs=${event.bs}`;
    case "season":
      return (
        `== S${event.sezon} KONIEC miejsce=${event.miejsce} pkt=${event.pkt} ` +
        `bilans=${num(event.bilans)} place=${num(event.place)} puchar=${bool(event.puchar)} ` +
        `europa=${event.europa} kampania=${event.kampania} kasaEuro=${num(event.kasaEuro)} ` +
        `kasa=${num(event.kasa)} ` +
        `sila=${num(event.sila)} emeryci=${event.emeryci} bz=${event.bz} bs=${event.bs} ` +
        `superpuchar=${event.superpuchar} rngDraws=${event.rngDrawCount}`
      );
    case "verdict":
      return `== WERDYKT ocena=${event.ocena} tytul=${event.tytul}`;
    case "epilogue":
      return `== EPILOG s${event.nr} miejsce=${event.miejsce} pkt=${event.pkt} [${event.naglowki.join(", ")}]`;
    case "secondChance":
      return `== DRUGA_SZANSA ceiling=${event.ceiling}`;
    case "end":
      return (
        `== KONIEC dziedzictwo=${event.dziedzictwo} kasa=${num(event.kasa)} tytul=${event.tytul} ` +
        `nastepny=${event.nastepny ?? "brak"}`
      );
  }
};

export const formatTrace = (events: TraceEvent[]): string => events.map(formatEvent).join("\n");
