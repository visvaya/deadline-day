import { RELEGATED_COUNT } from "../../src/data/balance";
import type { TraceEvent } from "../../src/logic/trace-format";
import type { Policy } from "./headless";

/** The top flight the golden scenarios are played in. */
const LEAGUE_SIZE = 18;

import {
  alwaysHaggle,
  alwaysPass,
  alwaysTake,
  cycle,
  readyOnly,
  stallThenTake,
  youngOnly,
} from "../../src/logic/simulate-policies";

export type Scenario = {
  slug: string;
  seed: number;
  /* A predicate says what ONE scenario must contain. What the corpus must
   * contain as a whole - full tenures against careers cut short - is pinned
   * separately in coverage-shape.test.ts, because no per-scenario predicate
   * can see the mix. Read that file before weakening one of these. */
  /**
   * The club this scenario now plays through, per
   * docs/decisions/golden-master.md - a frozen scenario -> clubId mapping chosen by the task
   * that replaced the drawn difficulty with a picked club (2026-09-14). Each
   * value here is the very club the old `pick(rng, level.clubs)` draw had
   * already assigned this seed under the removed difficulty pool - see the
   * `klub=` field recorded on the v1 traces before the retrace - so the v1
   * adapter changes nothing about what each career was, only how it started.
   * Not chosen for coverage; that is a later task's job (step 8). */
  clubId: string;
  policy: Policy;
  /** What this scenario must produce. record.test.ts retries with an
   * incremented seed (up to 200 attempts) until this is satisfied. */
  coverage: (_events: TraceEvent[]) => boolean;
};

const decisionsWithWynik = (events: TraceEvent[], wynik: string) =>
  events.some((e) => e.type === "decision" && e.wynik === wynik);

const epilogueWithHeadline = (events: TraceEvent[], kind: string) =>
  events.some((e) => e.type === "epilogue" && e.naglowki.includes(kind));

const verdictTitled = (events: TraceEvent[], tytul: string) =>
  events.some((e) => e.type === "verdict" && e.tytul === tytul);

export const scenarios: Scenario[] = [
  {
    slug: "latwy-mieszany",
    seed: 0x1000_0001,
    clubId: "rakow-czestochowa",
    policy: cycle(["bierz", "pas", "targ"]),
    coverage: (events) => events.some((e) => e.type === "season" && e.europa !== "brak"),
  },
  {
    slug: "sredni-mieszany",
    seed: 0x1000_0002,
    clubId: "gornik-zabrze",
    policy: cycle(["bierz", "targ", "pas"], 1),
    coverage: (events) => events.some((e) => e.type === "decision"),
  },
  {
    slug: "trudny-mieszany",
    seed: 0x1000_0003,
    clubId: "wisla-plock",
    policy: cycle(["bierz", "pas", "targ"], 2),
    // The drop zone, counted the way the engine counts it. Written as 18 -
    // RELEGATED_COUNT + 1 rather than a literal because the literal 17 was
    // still here after the league moved to three relegations, quietly asking
    // for a scenario one place deeper than the one that matters.
    coverage: (events) =>
      events.some((e) => e.type === "season" && e.miejsce >= LEAGUE_SIZE - RELEGATED_COUNT + 1),
  },
  {
    slug: "targ-zawsze",
    seed: 0x1000_0004,
    clubId: "piast-gliwice",
    policy: alwaysHaggle,
    // "BEZ_RUCHU" (no-change) was removed 2026-08-12 - every haggle now
    // either improves a term or loses the offer.
    coverage: (events) =>
      ["UTARG_KWOTA", "UTARG_PLACA", "PRZEPADL"].every((wynik) =>
        decisionsWithWynik(events, wynik)
      ),
  },
  {
    slug: "przeciaganie",
    seed: 0x1000_0005,
    clubId: "slask-wroclaw",
    policy: stallThenTake,
    coverage: (events) =>
      events.some((e) => e.type === "decision" && e.akcje.filter((a) => a === "CZAS").length >= 3),
  },
  {
    slug: "wszystko-pas",
    seed: 0x1000_0006,
    clubId: "wisla-krakow",
    policy: alwaysPass,
    coverage: (events) => events.some((e) => e.type === "secondChance"),
  },
  {
    slug: "same-mlode",
    seed: 0x1000_0007,
    clubId: "gornik-zabrze",
    policy: youngOnly,
    coverage: (events) => epilogueWithHeadline(events, "PRZELOM"),
  },
  {
    slug: "sami-gotowi",
    seed: 0x1000_0008,
    clubId: "pogon-szczecin",
    policy: readyOnly,
    coverage: (events) => epilogueWithHeadline(events, "FLOP"),
  },
  {
    slug: "bierz-zawsze",
    seed: 0x1000_0009,
    clubId: "zaglebie-lubin",
    policy: alwaysTake,
    // "bierz" is only ever clickable when affordable (the button is disabled
    // otherwise), so BRAK_SRODKOW is unreachable through this policy directly
    // - it only fires via the TARG path (either the "niższa kwota" outcome
    // capping too low to matter, or the "niższa płaca" outcome, which never
    // touches cena at all), already covered by "przeciaganie" and
    // "targ-zawsze". Aggressive buying still drives cash negative through
    // wage pressure across seasons, which is what the predicate below checks.
    // It also exercises squad-position eviction on unlimited signings
    // (game-reducer.ts:264), but that path has no predicate of its own here -
    // it's covered only indirectly, through squad strength feeding place/points.
    coverage: (events) => events.some((e) => e.type === "decision" && e.kasa < 0),
  },
  {
    slug: "latwy-pas",
    seed: 0x1000_000a,
    clubId: "jagiellonia-bialystok",
    policy: alwaysPass,
    // Titles renamed in the 2026-08-09 UI redesign: ZWOLNIONY -> ROZWIĄZANIE KONTRAKTU.
    coverage: (events) => verdictTitled(events, "ROZWIĄZANIE KONTRAKTU"),
  },
  {
    slug: "latwy-bierz",
    seed: 0x1000_000b,
    clubId: "legia-warszawa",
    policy: alwaysTake,
    // OFERTA Z ZAGRANICY -> KLUB Z ZAGRANICY.
    coverage: (events) => verdictTitled(events, "KLUB Z ZAGRANICY"),
  },
  {
    slug: "sredni-wykupiony",
    seed: 0x1000_000c,
    clubId: "pogon-szczecin",
    policy: cycle(["bierz", "bierz", "pas"]),
    // WYKUPIONY -> KLUB Z CZOŁÓWKI.
    coverage: (events) => verdictTitled(events, "KLUB Z CZOŁÓWKI"),
  },
  {
    slug: "przedluzenie",
    seed: 0x1000_000d,
    clubId: "cracovia",
    policy: cycle(["bierz", "pas", "targ"]),
    // A plain decline never sets wynik away from its "OK" default (see
    // game-reducer.ts's decide) - taken/declined is only visible in akcje.
    coverage: (events) =>
      events.some(
        (e) => e.type === "decision" && e.kartaTyp === "PRZEDLUZENIE" && e.akcje.includes("BIERZ")
      ) &&
      events.some(
        (e) => e.type === "decision" && e.kartaTyp === "PRZEDLUZENIE" && e.akcje.includes("PAS")
      ),
  },
];
