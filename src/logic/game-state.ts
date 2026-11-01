import type { GameState, Market } from "../data/types";
import { CZAS_BAZOWY } from "../data/balance";
import { buildSchedule } from "./season";
import { startingMembership } from "./league-membership";

/**
 * Initial state. Draws nothing - the eager `useState(() => losujRynek())`
 * in the prototype (:165) is discarded by START_CAREER before it is
 * ever read, so omitting that draw here does not touch the golden stream.
 */
export const initialState = (): GameState => ({
  faza: "start",
  club: null,
  manager: null,
  careerBaseline: null,
  // Never read before START_CAREER overwrites it: no career is in
  // progress before that action, so this is only a type filler.
  formacja: "4-3-3",
  kadra: [],
  kasa: 0,
  kroki: buildSchedule(),
  krok: 0,
  ruchy: 0,
  // Never read before START_CAREER overwrites it with rollMarket(rng).
  rynek: {} as Market,
  karta: null,
  czas: CZAS_BAZOWY,
  maxCzas: CZAS_BAZOWY,
  przeciagniecia: 0,
  timerWl: true,
  log: [],
  historia: [],
  moje: [],
  odrzuceni: [],
  polowa1: 0,
  tabela: null,
  liga: null,
  wynikSezonu: null,
  europeanCup: null,
  // Never read before START_CAREER freezes the first season's forecast:
  // no career is in progress before that action, so these are type fillers.
  seasonForecastExpectedPlace: 0,
  seasonForecastEuropeanIncome: 0,
  ovrChange: { season: 0, byPlayer: {} },
  werdykt: null,
  epilog: [],
  membership: startingMembership(),
  relegated: false,
  staffMemory: {},
  epilogIdx: 0,
  finalne: null,
  drugaSzansa: null,
  transferRumour: null,
  pytamRestart: false,
  seed: null,
  rngState: 0,
  rngDrawCount: 0,
  trace: [],
  akcje: [],
  cardActions: [],
  decisionIndex: 0,
});
