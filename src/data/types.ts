/**
 * Domain types for phase 2 extraction. Type and function names are English;
 * object field names stay Polish where they name game data (poz, wiek, ovr,
 * sufit...), matching the precedent already set by src/logic/trace-format.ts.
 * Renaming those fields is a separate, later pass - not part of this
 * extraction.
 */

/**
 * Position codes. The eight original ones describe a 4-3-3 and nothing else;
 * the nine added on 2026-08-14 are what makes other formations expressible.
 *
 * POM and ŚN are on their way out - ŚP and N replace them - but they stay
 * until the formation wiring lands, because a code rename shows up in every
 * decision line of the golden trace and is therefore a behaviour change, not
 * an addition.
 */
export type PositionCode =
  | "BR"
  | "LO"
  | "ŚO"
  | "PO"
  | "CLS"
  | "CPS"
  | "ŚPD"
  | "ŚP"
  | "LP"
  | "PP"
  | "ŚPO"
  | "LS"
  | "PS"
  | "CN"
  | "N"
  | "POM"
  | "ŚN";

export type PositionGroup = "BR" | "OBR" | "POM" | "ATK";

/** How rich a foreign buyer is, relative to the Ekstraklasa. Never rendered:
 * the player reads the tier off the club's name (spec 4 §8.1). */
export type ForeignWealthTier = "wysoki" | "bardzo wysoki" | "legendarny";

export type ForeignClub = {
  readonly clubId: string;
  readonly name: string;
  readonly tier: ForeignWealthTier;
  /** Top flight of its country in the game's season (2026/27). False caps
   * the tier at "wysoki" - owner decision 2026-09-22. */
  readonly topFlight: boolean;
  readonly provenance: "estimated";
  readonly rationale: string;
};

export type FormationId = "4-3-3" | "4-4-2" | "4-2-3-1" | "4-1-4-1" | "4-5-1" | "3-5-2" | "5-3-2";

/** One position inside a formation. Replaced PositionDef, which carried a
 * `grupa` the four-group weighting needed; that weighting went with the
 * formation wiring and PositionDef with it on 2026-08-17. PositionGroup
 * itself stays, because the squad screen still groups tiles into lines and
 * the scout report still branches on it. */
export type FormationSlot = { kod: PositionCode; xi: number; kadra: number };

export type Formation = {
  id: FormationId;
  /** Every position this formation uses, with how many start and how many
   * the squad carries. A game only ever knows about these positions - the
   * other codes simply do not exist in it. */
  pozycje: FormationSlot[];
  /** The starting eleven in rendering order, goalkeeper first. */
  kolejnoscXi: PositionCode[];
};

/** One club's attack/defence multipliers on the external model's scale
 * (league average = 1.00). Source and refresh: `pnpm sync:ratings`. */
export type TeamRating = {
  krotko: string;
  nazwa: string;
  attack: number;
  defence: number;
};

/** One row of the accumulating league table. Serialisable on purpose - it
 * goes into GameState and therefore into the autosave. */
export type LeagueStanding = {
  club: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Marks the player's own club, for highlighting in the table. */
  isPlayer?: true;
};

/** The league season in progress: the shuffled club order the fixture list
 * is generated from, plus the standings accumulated so far. Serialisable on
 * purpose - it goes into the autosave. The fixture list itself is NOT
 * stored; buildFixtures(order) reproduces it exactly. */
type LeagueSeason = {
  order: string[];
  standings: LeagueStanding[];
};

export type PlayerType = "mlody" | "gotowy" | "weteran" | "akademia";

export type Player = {
  id: string;
  nazwa: string;
  poz: PositionCode;
  wiek: number;
  ovr: number;
  sufit: number;
  moj: boolean;
  cenaZakupu: number | null;
  /** How old he was when we signed him, or null for anyone we did not buy.
   * The legacy screen shows this next to the fee: his current age would say
   * how old he is now, which is not what section 12 of the brief asks for. */
  ageAtSigning: number | null;
  mnoznikPlacy: number;
  /** Season this player joined the club, 0 for the starting squad ("był
   * przed tobą"). An academy debutant called up at a season end dates from
   * the season ahead, because development ran before he arrived. Display
   * only. */
  wKlubieOd: number;
  /** Season of the last contract signing (purchase or extension), 0 for the
   * starting squad. Drives PRZEDLUZENIE eligibility - see
   * eligibleForExtension in logic/offers.ts. */
  kontraktOd: number;
  /** Set when the player declined a PRZEDLUZENIE card - leaves at the next
   * koniecSezonu, stays in the squad until then. */
  wygasa: boolean;
};

export type MarketState = "obfity" | "spokoj" | "pusty";

export type Market = Record<PositionCode, MarketState>;

export type EuropeanCup = "LM" | "LE" | "LK";

export type EuropeanStage = "qualifying" | "league" | "knockout";

export type EuropeanRun = { cup: EuropeanCup; stage: EuropeanStage; money: number };

/** The Super Cup as the player experienced it: who they faced and whether
 * they won. Null for every season the player's club did not qualify. */
export type SuperCupOutcome = { opponent: string; won: boolean };

export type EuropeanSpot = { klub: string; puchar: EuropeanCup };

export type OfferType = "KUPNO" | "SPRZEDAZ" | "WOLNY" | "PANIC" | "PRZEDLUZENIE";

/** Domestic (an Ekstraklasa or pool-tier club) or foreign - the one split
 * every SPRZEDAZ buyer falls into. Lives here, not in logic/buyers.ts, so
 * SaleBuyer.origin and BuyerCandidate.origin (buyers.ts) share a single
 * definition instead of two copies of the same two-value union. */
export type BuyerOrigin = "domestic" | "foreign";

/** Who bids on a SPRZEDAZ card. The tier of a foreign buyer is deliberately
 * absent: the player reads it off the name, and nothing may render it. */
export type SaleBuyer = {
  readonly clubId: string;
  readonly name: string;
  readonly origin: BuyerOrigin;
};

/**
 * An offer the player turned down, as it stood at that moment: the player
 * snapshot from the card and the fee it asked, stalling surcharge included.
 */
export type PassedOnOffer = {
  player: Player;
  /** mln EUR. */
  fee: number;
};

export type Offer = {
  typ: OfferType;
  zawodnik: Player;
  cena: number;
  staffAssessment: StaffAssessment;
  analystReport: AnalystReport;
  /**
   * Club the player comes from, for offers that bring one in - the very club
   * whose level the analyst report names one line below, so the two can never
   * disagree. Null where the question does not arise: the player is already
   * ours (SPRZEDAZ, PRZEDLUZENIE).
   */
  sourceClub: string | null;
  /** Non-null exactly for SPRZEDAZ. */
  buyer: SaleBuyer | null;
};

export type ScheduleStep =
  | { typ: "okno"; sezon: number; tura: "lato" | "zima"; ruchy: number }
  | { typ: "runda"; sezon: number; polowa: 1 | 2 }
  | { typ: "koniecSezonu"; sezon: number }
  | { typ: "werdykt" };

type SeasonResult = {
  sezon: number;
  pkt: number;
  miejsce: number;
  puchar: boolean;
  mistrz: boolean;
  bilans: number;
  place: number;
  przychodZLigi: number;
  spadek: boolean;
  emeryci: Player[];
  debiutanci: Player[];
  /** Left the squad because a PRZEDLUZENIE card was declined this season. */
  odeszli: Player[];
  /** European qualification earned for next season, or null. */
  europeanCup: EuropeanCup | null;
  /** Every leg of this season's european campaign, in the order played.
   * Empty when the club was not in Europe. A cascade shows up as two or
   * three entries. */
  europeanRun: EuropeanRun[];
  /** Full-table assignment, for the season-end screen. */
  europeanSpots: EuropeanSpot[];
  /** Short name of the Polish Cup winner, even when it is not the player's club. */
  polishCupWinner: string;
  europeanIncome: number;
  polishCupIncome: number;
  /** Null when the club did not qualify for the Super Cup. */
  superCup: SuperCupOutcome | null;
  superCupIncome: number;
};

export type SeasonHistoryEntry = {
  sezon: number;
  pkt: number;
  miejsce: number;
  puchar: boolean;
  mistrz: boolean;
  spadek: boolean;
};

export type Verdict = {
  tytul: string;
  opis: string;
  ocena: number;
};

type HeadlineKind =
  | "PRZELOM"
  | "FLOP"
  | "CIECIA_PLAC"
  | "MISTRZOSTWO"
  | "PUCHAR"
  | "SPADEK"
  | "SEZON_BEZ_HISTORII";

export type Headline = {
  kind: HeadlineKind;
  text: string;
};

export type EpiloguePage = {
  nr: number;
  miejsce: number;
  pkt: number;
  naglowki: Headline[];
};

/**
 * The six terms that sum to `dziedzictwo`, exposed for balance measurement
 * (scripts/balance.ts). Optional because the UI never needs it - see the
 * hidden-ceiling rule, which this mirrors: derived numbers that
 * would leak strategy value must stay out of the player-facing layer.
 */
export type LegacyBreakdown = {
  pktA: number;
  pktB: number;
  trofea: number;
  kasa: number;
  wartoscKadry: number;
  wartoscKadryMoj: number;
  /** The player's own signings valued at handover (end of season 5) rather
   * than after the epilogue. Diagnostic only - never enters `dziedzictwo`. */
  wartoscKadryMojAtHandover: number;
  spadki: number;
  /** Relegations during the player's own five seasons, excluding the epilogue.
   * Diagnostic only - `dziedzictwo` penalises the combined `spadki`. */
  spadkiKadencja: number;
  /** Season of the first relegation during the tenure, 0 when there was none. */
  pierwszySpadekSezon: number;
  /** Squad size at the end of season 5. English name: this type is mid-migration
   * (PL -> EN naming migration), new fields go in English. */
  squadSizeAtHandover: number;
  /** The season the club changed hands. SEZONY_GRY for a tenure played out,
   * earlier when relegation ended it - which is why the two fields above are
   * named "at handover" rather than "S5": after 2026-08-23 they no longer
   * always describe season five. */
  handoverSeason: number;
  /** Squad size after the five epilogue seasons - the squad that produced
   * pktB and wartoscKadryMoj. English name: this type is mid-migration
   * (PL -> EN naming migration), new fields go in English. */
  squadSizeEnd: number;
};

/**
 * The closing story of one player the user developed - and nothing else.
 *
 * Replaced the epilogue's automatic sale (2026-08-20). It pays no money,
 * removes nobody, creates no successor and never touches `dziedzictwo`: the
 * epilogue inherits the club rather than improving it. Kept out of `Headline`
 * on purpose - it belongs to the career's end, not to one simulated season.
 */
export type TransferRumour = {
  /** Ready-to-render Polish sentence. Built in logic so the wording, the
   * comma decimal and the hard spaces have one home and one test. */
  text: string;
  /** Structured for tests and for any future re-wording; the UI reads `text`. */
  club: string;
  amount: number;
};

export type Legacy = {
  dziedzictwo: number;
  kasa: number;
  tytul: string;
  nastepny: number | null;
  breakdown?: LegacyBreakdown;
};

export type Phase =
  | "start"
  | "wybor"
  | "przeglad"
  | "okno"
  | "polSezonu"
  | "koniecSezonu"
  | "werdykt"
  | "epilog"
  | "final";

type DecisionChoice = "take" | "haggle" | "pass";

/**
 * Mirrors the 28 useState hooks in DeadlineDay() one field at a time, so the
 * transcription in game-reducer.ts stays auditable 1:1 against the prototype.
 * trace/akcje/cardActions/decisionIndex correspond to the mutable refs.
 */
/**
 * How much each surviving player's ovr moved, and which season it moved in.
 * The season is what lets a later window show the delta as history rather
 * than as something that just happened - development runs once a season, so
 * an untagged "+3" reads as "+3 this half", which is false. It also says who
 * the game has no reading for at all: a player who joined after that season
 * ended carries no entry because he was never measured, which is a different
 * fact from "he did not move".
 *
 * UI-facing only, never traced.
 */
export type OvrChange = { season: number; byPlayer: Record<string, number> };

/**
 * One club as the league carries it across seasons.
 *
 * baseAttack/baseDefence are canonical and never rewritten: the snapshot's
 * pair for a top-flight club, or `strength` twice for one from the pool.
 * Promotion and relegation move `tier` and bump `swaps`; the rating actually
 * played is derived by currentRating. Rewriting the base in place was how the
 * first draft of this plan lost both the asymmetry and the club's full name.
 */
export type LeagueClub = {
  /** Stable join key, the same one CLUBS and FIRST_DIVISION carry. Identity,
   * the own-club exclusion and fixture order read this; table maps keep
   * using shortName as their key. */
  clubId: string;
  name: string;
  shortName: string;
  baseAttack: number;
  baseDefence: number;
  tier: "league" | "pool";
  /** How many times this club has changed tier. Each round trip costs it
   * PROMOTION_BONUS * RELEGATION_PENALTY of its rating. */
  swaps: number;
};

/** Who is in the top flight and who waits below. Outlives a season, unlike
 * `liga`, which is one season's fixtures and table. */
export type LeagueMembership = { clubs: LeagueClub[] };

/**
 * A stable identity for every club, so tables that are about clubs -
 * finances, european berths - can be joined to one rather than to a short
 * name that exists to be printed.
 *
 * Short names are display text: `Wisła K.` and `Wisła P.` are abbreviations
 * chosen to fit a 360 px column, and a table keyed on them would have to be
 * rewritten the day one of them is made clearer. The id never appears on
 * screen and therefore never has a reason to change.
 *
 * Ids are WRITTEN OUT, not generated. A slugifier would have to make its own
 * decisions about ł, ę and the space in `GKS Katowice`, and those decisions
 * would silently rename a club the day the function was tidied - taking every
 * joined table with it.
 *
 * `character` is the one-sentence description shown on the club choice
 * screen; see docs/decisions/club-character-convention.md for its schema and
 * for the table src/data/clubs.ts copies verbatim. Defined here, not in
 * clubs.ts, so this leaf type file never has to import the club catalogue.
 */
export type ClubRecord = {
  readonly clubId: string;
  readonly name: string;
  readonly shortName: string;
  readonly character: string;
};

/**
 * The manager's chosen name, shared by the setup form, the reducer's
 * START_GAME/START_CAREER actions, the autosave guard and the archive entry
 * guard - one contract everywhere a manager identity crosses a boundary.
 * Defined here, not in logic/manager-identity.ts, because GameState and
 * GameAction below need it and this file must stay a dependency leaf; the
 * validation and drawing functions that operate on this shape still live in
 * logic/manager-identity.ts.
 */
export type ManagerIdentity = {
  readonly firstName: string;
  readonly lastName: string;
};

/**
 * The frozen starting advantage a career is judged against: how strong the
 * chosen club's sporting projection and structural finances are, translated
 * into the same two handicaps the three former difficulty levels used to
 * hand out - now DERIVED from the club instead of picked from a pool.
 *
 * Frozen once, at career start, and never recomputed afterwards: a
 * mid-career transfer or a European run must not move the yardstick the
 * verdict and the legacy score are measured against, or a club that got
 * stronger over five seasons would be judged against a moving target it
 * helped move.
 *
 * Defined here, not in logic/career-baseline.ts, because GameState below
 * needs it and this file must stay a dependency leaf; the function that
 * builds and freezes one still lives in logic/career-baseline.ts.
 */
export type CareerBaseline = {
  readonly clubId: string;
  readonly baselineExpectedSeasonPoints: number;
  readonly advantageScore: number;
  readonly tenureHandicap: number;
  readonly legacyHandicap: number;
  readonly initialEuropeanCup: EuropeanCup | null;
};

export type GameState = {
  faza: Phase;
  /** Chosen at the club-choice screen, not drawn. Null until
   * START_CAREER, complete for the rest of the career after it. */
  club: ClubRecord | null;
  /** Set by START_GAME and kept for the rest of the session, including
   * across CONFIRM_RESTART: only the club and the baseline reset, the
   * manager does not re-introduce themself. */
  manager: ManagerIdentity | null;
  /** Frozen once at START_CAREER from the chosen club alone - never
   * recomputed mid-career. See src/logic/career-baseline.ts. */
  careerBaseline: CareerBaseline | null;
  /** Drawn once when the career starts and fixed for its whole length.
   * Every position that exists in this game comes from it - the squad, the
   * market, the offers and the pitch layout all read it. */
  formacja: FormationId;
  kadra: Player[];
  kasa: number;
  kroki: ScheduleStep[];
  krok: number;
  ruchy: number;
  rynek: Market;
  karta: Offer | null;
  czas: number;
  maxCzas: number;
  przeciagniecia: number;
  timerWl: boolean;
  log: string[];
  historia: SeasonHistoryEntry[];
  moje: Player[];
  odrzuceni: PassedOnOffer[];
  polowa1: number;
  tabela: LeagueStanding[] | null;
  /** Null between seasons and before the first round of a season. */
  liga: LeagueSeason | null;
  wynikSezonu: SeasonResult | null;
  /** European cup the club is playing in this season, or null. */
  europeanCup: EuropeanCup | null;
  /**
   * The two halves of the season's income the HUD forecast is allowed to
   * assume, frozen once the season is prepared and before the first summer
   * card. With these fixed, a transfer moves the forecast by exactly minus
   * the change in the whole payroll - which is what makes the number
   * readable rather than a promise.
   *
   * Serialised, because a forecast recomputed after a reload would jump for
   * no reason the player could see. Only these two: the third forecast in
   * the game (`formExpectedSeasonPoints`) belongs to the settlement and is
   * computed there from the squad that actually played.
   */
  seasonForecastExpectedPlace: number;
  seasonForecastEuropeanIncome: number;
  ovrChange: OvrChange;
  werdykt: Verdict | null;
  epilog: EpiloguePage[];
  epilogIdx: number;
  finalne: Legacy | null;
  drugaSzansa: string | null;
  /** At most one, produced after the last epilogue season. Null when no
   * player in the final squad qualifies. English field name per the PL -> EN
   * naming migration. */
  transferRumour: TransferRumour | null;
  pytamRestart: boolean;
  seed: number | null;
  rngState: number;
  /**
   * How many values the career has drawn from the RNG since the start
   * action. A measurement instrument, not an input: nothing reads it back
   * into the simulation, so it can never change what a career does.
   *
   * `rngState` alone cannot answer this. It is a position in a cyclic
   * stream, so it says where the generator stands, not how far it has
   * travelled - two runs that drew a wildly different number of values can
   * sit on the same word.
   */
  rngDrawCount: number;
  trace: import("../logic/trace-format").TraceEvent[];
  akcje: string[];
  cardActions: string[];
  decisionIndex: number;
  membership: LeagueMembership;
  /** Set when the club goes down: the tenure ends here and the remaining
   * seasons are not played. */
  relegated: boolean;
  /**
   * The club's memory of its own staff reports, keyed by player id. Written
   * when a player joins the squad and refreshed once per season - never when
   * somebody opens a drawer, or two identical careers would diverge purely
   * from how often the player looked.
   */
  staffMemory: Record<string, StaffMemo>;
};

/**
 * The manager's chosen identity, carried by START_GAME and re-carried by
 * START_CAREER. The type here is `ManagerIdentity`, but that alone never
 * substitutes for `validateManagerIdentity`: the shape check it does not
 * capture (length, allowed characters, profanity) still has to run on
 * every dispatch, because the type only says the value HAS a firstName and
 * lastName, not that they are valid ones - and a caller that bypasses the
 * setup form can send anything shaped like the type.
 *
 * @internal Consumed directly (as a standalone action type, not only inside
 * the GameAction union) by a later task's replay-builder helper for the v2
 * archive format, not yet implemented.
 */
export type StartCareerAction = {
  readonly type: "START_CAREER";
  readonly clubId: string;
  readonly manager: ManagerIdentity;
  readonly seed: number;
};

export type GameAction =
  | { type: "START_GAME"; manager: ManagerIdentity }
  | { type: "BACK" }
  | { type: "TOGGLE_TIMER" }
  | StartCareerAction
  | { type: "OPEN_OFFERS" }
  | { type: "STALL" }
  | { type: "DECIDE"; choice: DecisionChoice }
  /**
   * A signing the player has explicitly agreed to, knowing it releases a
   * squad member. Carries both ids so the reducer can re-check that the offer
   * on screen and the player it named are still the ones being agreed to -
   * the timer keeps running under the dialog, and an expired offer must never
   * let a late confirmation accept the card that replaced it.
   *
   * Not a replay token: `.replay.json` still records only BIERZ/TARG, and
   * this action is how both the UI and the simulator deliver one.
   */
  | {
      type: "CONFIRM_SQUAD_EVICTION";
      choice: "take" | "haggle";
      offerPlayerId: string;
      evictedPlayerId: string;
    }
  | { type: "ADVANCE" }
  | { type: "RUN_EPILOGUE" }
  | { type: "TICK" }
  | { type: "RECONCILE_TIME"; elapsedSeconds: number }
  | { type: "ASK_RESTART" }
  | { type: "CONFIRM_RESTART" }
  | { type: "CANCEL_RESTART" }
  | { type: "PLAY_AGAIN"; seed: number };

// Analyst and staff report types (Task 1: metric catalog)

export type StaffSource = "scout" | "coach";
export type StaffFocus = "potential" | "current";
export type StaffOutlook = "limited" | "leagueLevel" | "leadingLeague" | "aboveLeague";
export type StaffConfidence = "high" | "medium" | "low";

export type StaffAssessment = {
  source: StaffSource;
  focus: StaffFocus;
  outlook: StaffOutlook;
  confidence: StaffConfidence;
  /**
   * Whether this is the first season the club could watch this player at all.
   *
   * Safe context for the UI, derived from tenure alone - never from sufit, the
   * draw, or the peak range. It exists so the shared renderer can say "the
   * staff is still gathering observations" without being handed the memory or
   * the ceiling to work it out itself.
   */
  isFirstObservation: boolean;
};

/**
 * What the club remembers about one player's last staff report.
 *
 * Lives in GameState rather than on Player on purpose: a Player travels to
 * offers, the squad, the legacy screen and the archive, and a report field
 * there would leak into all four. The club is what has the memory.
 *
 * `seasonsObserved` counts the seasons the club could actually watch him,
 * including the season this memo was written in. It is carried rather than
 * recomputed, because nothing else in the state records when observation
 * started - wKlubieOd dates the arrival, not the first report a player saw.
 */
export type StaffMemo = {
  season: number;
  outlook: StaffOutlook;
  confidence: StaffConfidence;
  seasonsObserved: number;
};

export type AnalystPositionGroup =
  | "goalkeeper"
  | "centreBack"
  | "wideDefender"
  | "centralMidfielder"
  | "attackingMidfielder"
  | "striker";

export type ImpactSide = "attack" | "defence";
export type AnalystContextTier = "bottom" | "mid" | "top";
export type AnalystBundleId =
  | "gkShotStopping"
  | "gkDistribution"
  | "gkAreaCommand"
  | "centreBackDefending"
  | "centreBackProgression"
  | "centreBackAerial"
  | "wideDefenderDefending"
  | "wideDefenderCarrying"
  | "wideDefenderCreating"
  | "centralMidfielderPassing"
  | "centralMidfielderPressureResistance"
  | "centralMidfielderRecovering"
  | "attackingMidfielderCreating"
  | "attackingMidfielderCarrying"
  | "attackingMidfielderFinishing"
  | "strikerFinishing"
  | "strikerLinkup"
  | "strikerAerial";

export type AnalystMetricId =
  | "goalsPreventedPer90"
  | "positioningErrorAverage"
  | "passCompletionAboveExpected"
  | "longBallCompletionPct"
  | "crossClaimSuccessPct"
  | "successfulGkExitsPct"
  | "stopReducePossessionDangerPct"
  | "defensiveDuelsWonPct"
  | "lineBreakingPassCompletionPct"
  | "hops"
  | "aerialWinPct"
  | "successfulDribblesPct"
  | "xaPerKeyPass"
  | "ballRetentionRatioUnderHighPressure"
  | "progressiveActionUnderIntensePressure"
  | "dangerousOpponentHalfRecoveriesPer90"
  | "dribbleCarryObv"
  | "xgotMinusXg"
  | "xgPerShot"
  | "successfulLinkupPlaysPct"
  | "passCompletionRatioUnderHighPressure";

/**
 * UI rendering uses this to distinguish ordinary and reverse-scaled quality
 * values. Every analyst metric judges quality; style comes from bundle choice.
 */
type MetricSemantics = "qualityHigherRaw" | "qualityLowerRaw";

/**
 * How a metric value is formatted for display: its range, decimals and unit.
 * Also read by the source manifest (src/data/analyst-metric-sources.ts).
 */
export type MetricDisplayScale = {
  min: number;
  max: number;
  decimals: 0 | 1 | 2;
  unit: "" | "%" | "pp" | "/90" | "m";
  signed?: boolean;
};
/**
 * Every metric judges quality. A metric with no unambiguous good direction
 * (the old `profile` semantics: CCAA, Carry Directness) could not help a
 * transfer decision in a game with no tactics, roles or style fit - it only
 * described how a player plays. Style is carried by WHICH bundle is drawn
 * instead, which says the same thing without spending one of the two lines.
 */
export type AnalystMetricDefinition = {
  label: string;
  /** Polish player-facing explanation shown by the shared metric help popover. */
  helpText: string;
  semantics: MetricSemantics;
  displayScale: MetricDisplayScale;
};
export type SampleTier = "small" | "medium" | "large";

/**
 * How much football a player in our own squad actually gets.
 *
 * Derived from the same idea the engine already uses for season form: the
 * automatic XI, then FORM_ROTATION_SLOTS substitutes, then everyone else.
 * Without it a 52-OVR reserve keeper drew the same minutes as the 72-OVR
 * starter ahead of him, because minutes came from age alone.
 *
 * Safe with respect to the hidden ceiling: playing status is a deterministic
 * function of visible ovr, age and name within the squad. Id only breaks a
 * complete collision of those visible fields. Given the values the reader
 * can already see, the status carries no extra information about sufit.
 *
 * Absent for players outside our squad - we do not pick their teams.
 */
export type PlayingTime = "starter" | "rotation" | "reserve";
export type ReportWindow = "summer" | "winter";
export type ReportPeriod = { season: number; window: ReportWindow };
export type OfferReportContext = {
  period: ReportPeriod;
  /** The player's own club, excluded from every source and buyer draw. */
  userClubId: string;
  currentClubOvr: number;
  /** The live league, so the source club of an offer can be drawn from the
   * same eighteen the engine is playing plus the pool below them. Static
   * TEAM_RATINGS would keep offering a club its own promotion had removed. */
  membership: LeagueMembership;
  /** The club's report memory, so an offer for one of our own players reads
   * the SAME verdict the squad drawer shows him. */
  staffMemory: Record<string, StaffMemo>;
};

export type AnalystBundleDefinition = {
  id: AnalystBundleId;
  metrics: readonly [AnalystMetricId, AnalystMetricId];
  impactSide: ImpactSide;
};

export type AnalystProfile = AnalystBundleDefinition & {
  group: AnalystPositionGroup;
  marketEdge: number;
};

export type PlayerImpact = {
  attackDelta: number;
  defenceDelta: number;
};

export type AnalystMetricResult = {
  metricId: AnalystMetricId;
  percentile: number;
  value: number;
};

export type AnalystReport = {
  metrics: [AnalystMetricResult, AnalystMetricResult];
  minutes: number;
  sampleTier: SampleTier;
  period: ReportPeriod;
  contextTier: AnalystContextTier;
};
