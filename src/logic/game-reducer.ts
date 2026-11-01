import type {
  FormationId,
  GameAction,
  GameState,
  Player,
  ScheduleStep,
  OfferReportContext,
  ReportPeriod,
  ReportWindow,
} from "../data/types";
import { FORMACJE } from "../data/positions";
import {
  CZAS_BAZOWY,
  CZAS_DODATKOWY,
  HAGGLE_FEE_DISCOUNT,
  HAGGLE_ODDS,
  HAGGLE_SALE_BONUS,
  HAGGLE_WAGE_DISCOUNT,
  MAX_PRZECIAGNIEC,
  KOSZTY_STALE,
  leaguePositionPrize,
  PUCHAR_POLSKI_PREMIA,
  SUPERPUCHAR_PREMIA,
  RELEGATED_COUNT,
} from "../data/balance";
import { clubById } from "../data/clubs";
import { buildCareerBaseline } from "./career-baseline";
import { validateManagerIdentity } from "./manager-identity";
import {
  calculateSeasonRevenue,
  freezeSeasonForecast,
  scaledRecurringRevenue,
  transferBudgetChange,
  type SeasonForecast,
} from "./finance";
import { openingBudget } from "./opening-budget";
import type { TraceEvent } from "./trace-format";
import { createRng, pick, shuffle, type Rng } from "./rng";
import {
  academyDebutMessage,
  buyerWithdrewMessage,
  extensionDeclinedMessage,
  extensionMessage,
  extensionWalkoutMessage,
  freeAgentDeclinedMessage,
  freeAgentSigningMessage,
  freeAgentWentElsewhereMessage,
  HAGGLE_WON,
  insufficientFundsMessage,
  purchaseDeclinedMessage,
  purchaseLostMessage,
  purchaseMessage,
  saleDeclinedMessage,
  saleMessage,
  squadEvictionMessage,
} from "./decision-messages";
import { zaokr } from "./format";
import { campaignMoney, resolveSeasonalEuropeanOutcome } from "./european-cups";
import { resolveSuperCup } from "./super-cup";
import { expectedSeasonPoints } from "./expected-points";
import { clubOvr, clubRating, leagueRatings } from "./league-ratings";
import { leagueFixtureOrder, startingMembership, swapTiers } from "./league-membership";
import { buildFixtures, emptyStandings, playRounds, sortStandings } from "./league";
import {
  acquisitionCapacityOutcome,
  baseSquadStrength,
  createSquadFromFormation,
  fillEmptyPositions,
  formationOf,
  squadStrength,
} from "./squad";
import { totalPayroll, baseWage, playerWage, signingWageMultiplier } from "./wages";
import { rememberSquad, staffMemoOf } from "./staff-assessment";
import { rollMarket } from "./market";
import {
  rollOffer,
  buyPrice,
  sellPrice,
  extensionWage,
  isExternalSigningType,
  marketHaggleShift,
} from "./offers";
import { resolveSeasonOutcome } from "./season";
import { ageSquad } from "./development";
import { creditedIncome, type IncomeMode, type MeasurementOptions } from "./income-mode";
import { computeVerdict } from "./scoring";
import { runEpilogue, runFinale } from "./epilogue";
import { defined, mapAt } from "./invariant";

/**
 * Pure game reducer. Transcribes the ~340 stateful lines of DeadlineDay()
 * (prototype/deadline-day-prototyp-v7.jsx :156-540).
 *
 * The cascade computes sequentially, no exceptions: every helper below
 * (nastepnaKarta, dalejKrok, symulujRunde, policzWerdykt) takes one working
 * `state` and both reads and writes it - a transfer decided this dispatch is
 * visible to every downstream step of the same cascade (squad strength,
 * wages, ageing, the next card's offer pool). `decide` alone keeps a
 * separate `base`: the untouched input snapshot a handler needs to diff
 * against (e.g. `next.akcje = [...base.akcje, token]`). The prototype quirks
 * this reducer used to preserve verbatim (Q1-Q7) have all been resolved.
 */

/**
 * The trace record of one freeze. The event, not the state, is what an audit
 * reads: `GameState` carries exactly the two frozen fields, so the opening
 * payroll they are judged against has to be written down at the moment it
 * was true.
 *
 * `bilans` excludes the expected european money on purpose - it is the drift
 * control of the spec's chapter 12.2, not the figure the HUD shows.
 */
const forecastEvent = (
  season: number,
  clubId: string,
  squad: readonly Player[],
  forecast: SeasonForecast
): TraceEvent => {
  const recurringRevenue = scaledRecurringRevenue(clubId);
  const payroll = totalPayroll(squad);
  return {
    type: "forecast",
    sezon: season,
    miejsce: forecast.expectedPlace,
    europa: zaokr(forecast.europeanIncome, 2),
    przychod: zaokr(recurringRevenue, 2),
    place: zaokr(payroll, 2),
    bilans: zaokr(
      recurringRevenue + leaguePositionPrize(forecast.expectedPlace) - payroll - KOSZTY_STALE,
      2
    ),
  };
};

/** Current season number, for PRZEDLUZENIE eligibility and stamping
 * wKlubieOd/kontraktOd. Only meaningful while faza is "okno". */
const currentSeason = (state: Pick<GameState, "kroki" | "krok">): number => {
  const k = state.kroki[state.krok];
  return k && k.typ === "okno" ? k.sezon : 0;
};

/**
 * The report period for the current game state - the single mapping from the
 * Polish schedule (`tura: "lato" | "zima"`) onto the report vocabulary.
 *
 * Exported because the squad review reads it too. A second copy in the UI
 * would drift the first time the schedule changes, and the drift would be
 * silent: reports would simply come from the wrong window.
 *
 * Outside an `okno` step there is no window, and season 0 is the marker for
 * that. Every caller so far is inside one; tests/logic/squad-reports.test.ts
 * turns that into an assertion rather than an assumption.
 */
export const reportPeriod = (state: Pick<GameState, "kroki" | "krok">): ReportPeriod => {
  const k = state.kroki[state.krok];
  if (!k || k.typ !== "okno") return { season: 0, window: "summer" };
  const window: ReportWindow = k.tura === "lato" ? "summer" : "winter";
  return { season: k.sezon, window };
};

const pushEvent = (next: GameState, event: TraceEvent): void => {
  next.trace = [...next.trace, event];
};

/**
 * The single place a dispatch's rng position and draw tally are written back.
 *
 * `initialDraws` is the count the dispatch STARTED from, never a tally that
 * has already been added to: `rng` is created fresh per dispatch and counts
 * only its own calls, so adding the two once is the whole arithmetic. Doing
 * it anywhere else - or twice - would silently inflate the counter, and
 * nothing downstream would notice, because nothing reads it back.
 */
const finishRng = (next: GameState, rng: Rng, initialDraws: number): GameState => ({
  ...next,
  rngState: rng.state(),
  rngDrawCount: initialDraws + rng.draws(),
});

/**
 * `finishRng` for the two call sites that route through `decide`, whose
 * defensive paths hand `base` back untouched. Callers rely on getting the
 * very same object - `finishRng` would return a deep-equal copy and quietly
 * break that contract - so identity has to be preserved rather than wrapped.
 *
 * The assertion is what makes that safe to rely on. "decide returns `base`
 * itself if and only if it drew nothing" is a convention held by three
 * scattered early returns and enforced by nothing: all three sit above the
 * first `rng.next()` today, but a defensive return added below one would
 * hand back `base` after drawing, and the draw would vanish from the tally
 * without anything noticing. Cheap to check, and the alternative is a silent
 * wrong number in exactly the diff the counter exists to explain.
 */
const finishDecision = (base: GameState, next: GameState, rng: Rng): GameState => {
  if (next !== base) return finishRng(next, rng, base.rngDrawCount);
  if (rng.draws() !== 0) {
    throw new Error("decide returned the base state after drawing from rng");
  }
  return base;
};

/** Mirrors symulujRunde :420-479. `state` is the single, sequentially-computed accumulator. */
const symulujRunde = (
  rng: Rng,
  state: GameState,
  k: Extract<ScheduleStep, { typ: "runda" }>,
  incomeMode: IncomeMode
): GameState => {
  const klubKrotko = defined(state.club, "club").shortName;
  const formacja = formationOf(state);
  const s = squadStrength(state.kadra, state.europeanCup, formacja);
  // Ratings are rebuilt for each half, so winter transfers only affect the
  // spring round - the same behaviour the old point draw had.
  const ratings = leagueRatings(
    state.kadra,
    state.europeanCup,
    klubKrotko,
    formacja,
    state.membership
  );

  // Draw order: the season's club order is shuffled once, at the autumn
  // round; the spring round reuses it from state. Shuffled over the current
  // membership rather than over the RYWALE constant - after the first
  // promotion the two stop naming the same eighteen clubs, and playRounds
  // would ask for a rating no longer in the league.
  const order =
    k.polowa === 1
      ? shuffle(rng, leagueFixtureOrder(state.membership))
      : defined(state.liga, "league").order;
  const fixtures = buildFixtures(order);
  const base = k.polowa === 1 ? emptyStandings(order) : defined(state.liga, "league").standings;
  const rounds = k.polowa === 1 ? fixtures.slice(0, 17) : fixtures.slice(17);
  const standings = playRounds(rng, rounds, ratings, base);
  state.liga = { order, standings };

  const own = defined(
    standings.find((row) => row.club === klubKrotko),
    "own standings row"
  );
  const pkt = own.points;

  if (k.polowa === 1) {
    pushEvent(state, {
      type: "half",
      sezon: k.sezon,
      polowa: 1,
      pkt,
      bz: own.goalsFor,
      bs: own.goalsAgainst,
    });
    state.polowa1 = pkt;
    state.tabela = sortStandings(standings).map((row) =>
      row.club === klubKrotko ? { ...row, isPlayer: true as const } : row
    );
    state.faza = "polSezonu";
    if (state.kroki[state.krok + 1]?.typ === "okno")
      state.rynek = rollMarket(rng, formationOf(state));
    return state;
  }

  const razem = pkt;
  const {
    tabela: tab,
    miejsce,
    puchar,
    mistrz,
  } = resolveSeasonOutcome(rng, standings, klubKrotko, s);
  // Draw order is part of the golden contract: the Polish Cup winner (drawn
  // only when the player didn't win it) and this season's european campaign
  // (resolved only when the player was playing in one) come after the
  // player's own cup draw, before ageSquad's.
  const { polishCupWinner, europeanRun, europeanSpots, nextCup } = resolveSeasonalEuropeanOutcome(
    rng,
    tab,
    puchar,
    klubKrotko,
    state.europeanCup,
    s
  );

  const place = totalPayroll(state.kadra);
  // The recurring base and the placement ladder are never controlled. The
  // three one-off receipts are, and each is credited BEFORE it reaches the
  // balance, so bilans, kasa, wynikSezonu and everything computed from them
  // agree with one another.
  const europeanIncome = creditedIncome(campaignMoney(europeanRun), incomeMode);
  const polishCupIncome = creditedIncome(puchar ? PUCHAR_POLSKI_PREMIA : 0, incomeMode);
  // Draw order: the european campaign first, the Super Cup after it. Both
  // consume a variable number of draws, so this ordering is part of the
  // golden contract.
  const superCup = resolveSuperCup(rng, tab, polishCupWinner, klubKrotko, ratings);
  const superCupIncome = creditedIncome(superCup?.won ? SUPERPUCHAR_PREMIA : 0, incomeMode);
  const clubId = defined(state.club, "club").clubId;
  const przychod = calculateSeasonRevenue({
    clubId,
    place: miejsce,
    europeanPrize: europeanIncome,
    polishCupPrize: polishCupIncome,
    superCupPrize: superCupIncome,
  });
  const bilans = zaokr(przychod - (place + KOSZTY_STALE), 2);

  // Two clubs down, two up. Placed here, after the season and the cups and
  // before ageSquad, because the draw consumes rng and draw order is part of
  // the golden contract.
  state.membership = swapTiers(
    rng,
    state.membership,
    tab.slice(-RELEGATED_COUNT).map((row) => row.club)
  );

  const ovrBefore = new Map(state.kadra.map((z) => [z.id, z.ovr]));
  const ownRating = mapAt(ratings, klubKrotko, "own rating");
  const opponents = [...ratings.entries()]
    .filter(([club]) => club !== klubKrotko)
    .map(([, rating]) => rating);
  const overperformed = razem > expectedSeasonPoints(ownRating, opponents);
  const {
    kadra: aged,
    emeryci,
    odeszli,
  } = ageSquad(rng, state.kadra, { overperformed }, formationOf(state));
  const { kadra: filled, debiutanci } = fillEmptyPositions(
    rng,
    aged,
    clubOvr(clubRating(defined(state.club, "club"))),
    formationOf(state)
  );
  // A debutant called up here joins after development has run, so he dates
  // from the season ahead: the delta screens then read him as unmeasured
  // ("?") rather than measured and unchanged ("0"). kontraktOd keeps the
  // season that ended - it gates PRZEDLUZENIE, and moving it would change
  // the engine and every golden trace. wKlubieOd is display only.
  const nowa = filled.map((z) =>
    debiutanci.some((d) => d.id === z.id)
      ? { ...z, wKlubieOd: k.sezon + 1, kontraktOd: k.sezon }
      : z
  );
  state.ovrChange = {
    season: k.sezon,
    byPlayer: Object.fromEntries(
      nowa.flatMap((z) => {
        const before = ovrBefore.get(z.id);
        return before === undefined || before === z.ovr ? [] : [[z.id, z.ovr - before]];
      })
    ),
  };
  state.kadra = nowa;
  // Refresh AFTER development and for the season AHEAD, not the one ending.
  // Anything else would remember a player as he was before he grew, and the
  // academy debutant stamped a moment ago with the season that is CLOSING
  // will not be seen by anyone until the next one - so his single opening
  // entry belongs there too, and he must not also pick one up here.
  state.staffMemory = rememberSquad(state.staffMemory, nowa, k.sezon + 1);
  // The board keeps most of the operating result and passes on a share of
  // it. `bilans` below stays the RAW result: the season report goes on
  // showing what the club earned, and only the part that reaches the transfer
  // budget is scaled. Rounding happens here, once, at the call site.
  state.kasa = zaokr(state.kasa + transferBudgetChange(bilans), 2);
  state.tabela = tab;
  state.europeanCup = nextCup;
  state.wynikSezonu = {
    sezon: k.sezon,
    pkt: razem,
    miejsce,
    puchar,
    mistrz,
    bilans,
    place: zaokr(place, 2),
    przychodZLigi: zaokr(przychod, 2),
    spadek: miejsce > tab.length - RELEGATED_COUNT,
    emeryci,
    debiutanci,
    odeszli,
    europeanCup: nextCup,
    europeanRun,
    europeanSpots,
    polishCupWinner,
    europeanIncome: zaokr(europeanIncome, 2),
    polishCupIncome: zaokr(polishCupIncome, 2),
    superCup,
    superCupIncome: zaokr(superCupIncome, 2),
  };
  // Relegation ends the tenure here, with no protected year: the remaining
  // seasons are not played and the verdict is computed from what happened.
  // The game has no model of the division below, so there is nothing to play.
  if (miejsce > tab.length - RELEGATED_COUNT) state.relegated = true;
  // updater form: setHistoria((h) => [...h, ...])
  state.historia = [
    ...state.historia,
    {
      sezon: k.sezon,
      pkt: razem,
      miejsce,
      puchar,
      mistrz,
      spadek: miejsce > tab.length - RELEGATED_COUNT,
    },
  ];
  pushEvent(state, {
    type: "season",
    sezon: k.sezon,
    miejsce,
    pkt: razem,
    bilans,
    place: zaokr(place, 2),
    puchar,
    europa: nextCup ?? "brak",
    kampania:
      europeanRun.length === 0
        ? "brak"
        : europeanRun.map((leg) => `${leg.cup}/${leg.stage}`).join(">"),
    kasaEuro: zaokr(europeanIncome, 2),
    kasa: state.kasa,
    sila: zaokr(s, 2),
    emeryci: emeryci.length,
    bz: own.goalsFor,
    bs: own.goalsAgainst,
    superpuchar: superCup === null ? "brak" : superCup.won ? "wygrany" : "przegrany",
    // The tally AT THIS MOMENT, not the one the state carries: the state's
    // copy is still the dispatch's entry value (finishRng writes it at the
    // very end), and the market roll a few lines below will draw more.
    rngDrawCount: state.rngDrawCount + rng.draws(),
  });
  state.krok += 1;
  state.faza = "koniecSezonu";
  const nextStep = state.kroki[state.krok + 1];
  if (nextStep?.typ === "okno") state.rynek = rollMarket(rng, formationOf(state));
  // The second freezing moment: after development, retirements, the refill
  // and the league swap, before the next summer's first card. Skipped when
  // relegation ended the tenure, because there is no season to forecast.
  //
  // Draws nothing, so its position relative to the market roll above is free
  // and cannot move the golden stream.
  if (nextStep?.typ === "okno" && !state.relegated) {
    const forecast = freezeSeasonForecast({
      squad: state.kadra,
      cup: nextCup,
      clubShortName: klubKrotko,
      formation: formationOf(state),
      membership: state.membership,
    });
    state.seasonForecastExpectedPlace = forecast.expectedPlace;
    state.seasonForecastEuropeanIncome = forecast.europeanIncome;
    pushEvent(state, forecastEvent(nextStep.sezon, clubId, state.kadra, forecast));
  }
  // A new season starts from a fresh fixture list and a fresh shuffle.
  state.liga = null;
  return state;
};

/** Mirrors policzWerdykt :482-490. */
const policzWerdykt = (rng: Rng, state: GameState): GameState => {
  const werdykt = computeVerdict(
    rng,
    state.historia,
    state.kasa,
    defined(state.careerBaseline, "career baseline").tenureHandicap,
    defined(state.club, "club").clubId
  );
  pushEvent(state, { type: "verdict", ocena: werdykt.ocena, tytul: werdykt.tytul });
  state.werdykt = werdykt;
  state.faza = "werdykt";
  return state;
};

/** Mirrors dalejKrok :400-418. */
const dalejKrok = (rng: Rng, state: GameState, incomeMode: IncomeMode): GameState => {
  // A relegated club skips whatever the schedule still holds: the verdict is
  // drawn from the seasons that were actually played.
  if (state.relegated) return policzWerdykt(rng, state);
  const n = state.krok + 1;
  state.krok = n;
  const k = state.kroki[n];
  if (!k) return state;

  if (k.typ === "okno") {
    pushEvent(state, {
      type: "window",
      sezon: k.sezon,
      tura: k.tura.toUpperCase(),
      ruchy: k.ruchy,
    });
    // rynek is already rolled ahead of time by symulujRunde, so the
    // half-season/season-end "preview" screens show the real upcoming
    // market instead of stale data from the window that just ended.
    state.ruchy = k.ruchy;
    state.karta = null;
    state.log = [];
    state.faza = "przeglad";
    return state;
  }
  if (k.typ === "runda") return symulujRunde(rng, state, k, incomeMode);
  if (k.typ === "koniecSezonu") {
    state.faza = "koniecSezonu";
    return state;
  }
  return policzWerdykt(rng, state);
};

/** Mirrors nastepnaKarta :389-397. */
const nastepnaKarta = (rng: Rng, state: GameState, incomeMode: IncomeMode): GameState => {
  const zostalo = state.ruchy - 1;
  state.ruchy = zostalo;
  state.czas = CZAS_BAZOWY;
  state.maxCzas = CZAS_BAZOWY;
  state.przeciagniecia = 0;
  if (zostalo <= 0) return dalejKrok(rng, state, incomeMode);
  const formacja = formationOf(state);
  const currentClubOvr = baseSquadStrength(state.kadra, null, formacja);
  const context: OfferReportContext = {
    period: reportPeriod(state),
    userClubId: defined(state.club, "club").clubId,
    currentClubOvr,
    membership: state.membership,
    staffMemory: state.staffMemory,
  };
  state.karta = rollOffer(
    rng,
    state.kadra,
    state.rynek,
    formacja,
    context,
    zostalo === 1,
    state.kasa,
    currentSeason(state)
  );
  return state;
};

/**
 * Refills whatever position a departure emptied and dates the debutants to
 * the current season. Shared by the two ways a player can leave mid-window -
 * sold, or walking away from a refused extension - which need identical
 * treatment: the same academy draw, against the same club strength, over the
 * same formation. Keeping one copy means a change to any of those three
 * cannot land on one path and miss the other.
 */
const refillAfterDeparture = (
  rng: Rng,
  base: GameState,
  remaining: readonly Player[],
  sezon: number
): { kadra: Player[]; debiutanci: Player[] } => {
  const { kadra, debiutanci } = fillEmptyPositions(
    rng,
    remaining,
    base.club ? clubOvr(clubRating(base.club)) : undefined,
    formationOf(base)
  );
  return {
    kadra: kadra.map((z) =>
      debiutanci.some((d) => d.id === z.id) ? { ...z, wKlubieOd: sezon, kontraktOd: sezon } : z
    ),
    debiutanci,
  };
};

/** Mirrors decyzja :287-387. Draw order and quirks Q5-Q7 are the golden contract. */
const decide = (
  rng: Rng,
  base: GameState,
  choice: "take" | "haggle" | "pass",
  incomeMode: IncomeMode,
  confirmedEvictedPlayerId?: string
): GameState => {
  if (!base.karta) return base;
  const karta = base.karta;

  // Squad depth is only ever a question for a signing the player is accepting.
  // A pass never fills a position, and SPRZEDAZ/PRZEDLUZENIE act on someone
  // already in the squad, so neither may be blocked by capacity.
  const checksSquadCapacity = choice !== "pass" && isExternalSigningType(karta.typ);
  const capacityOutcome = checksSquadCapacity
    ? acquisitionCapacityOutcome(base.kadra, karta.zawodnik, formationOf(base))
    : null;

  // Defensive: the generator must never show this card. Consume nothing -
  // no rng, no move, no recorded action - rather than sign and release a
  // player in the same breath.
  if (capacityOutcome?.kind === "rejectsIncoming") return base;
  // An eviction needs the player's explicit agreement, naming this exact
  // player. A plain DECIDE cannot walk past the dialog.
  if (
    capacityOutcome?.kind === "evictsExisting" &&
    capacityOutcome.player.id !== confirmedEvictedPlayerId
  ) {
    return base;
  }

  const next: GameState = { ...base };
  let akcja: "tak" | "pas" | "targ" =
    choice === "take" ? "tak" : choice === "haggle" ? "targ" : "pas";
  const tokenAkcjaInicjalna = akcja === "tak" ? "BIERZ" : akcja.toUpperCase();
  next.akcje = [...base.akcje, tokenAkcjaInicjalna];
  next.cardActions = [...base.cardActions, tokenAkcjaInicjalna];

  const n = base.przeciagniecia;
  const sezon = currentSeason(base);
  let wpis: string | null = null;
  let wynikId = "OK";
  let cena =
    karta.typ === "SPRZEDAZ"
      ? sellPrice(karta, n)
      : karta.typ === "PRZEDLUZENIE"
        ? extensionWage(karta, n)
        : buyPrice(karta, n);
  const cenaWyswietlana = cena;

  /**
   * Set only once the newcomer is actually in the squad. Deliberately not
   * inferred from the action token or from the payroll movement: a haggle
   * can be lost, a purchase can fail for want of funds, and an eviction can
   * turn a signing into a net wage saving.
   */
  let signedPlayer: Player | null = null;

  const pushDecisionEvent = (): void => {
    const idx = base.decisionIndex + 1;
    next.decisionIndex = idx;
    pushEvent(next, {
      type: "decision",
      index: idx,
      kartaTyp: karta.typ,
      poz: karta.zawodnik.poz,
      ovr: karta.zawodnik.ovr,
      wiek: karta.zawodnik.wiek,
      ceiling: karta.zawodnik.sufit,
      cena: cenaWyswietlana,
      akcje: next.cardActions,
      wynik: wynikId,
      cenaKoncowa: cena,
      kasa: next.kasa,
      // Read from `base`, which is the schedule step this decision was taken
      // in - the cascade below can move on to the next one.
      season: sezon,
      // Full precision here; the trace formatter is what rounds to two places.
      payrollBefore: totalPayroll(base.kadra),
      payrollAfter: totalPayroll(next.kadra),
      signedPlayerId: signedPlayer === null ? null : signedPlayer.id,
      signedAnnualWage: signedPlayer === null ? null : playerWage(signedPlayer),
      signedBaseAnnualWage: signedPlayer === null ? null : baseWage(signedPlayer.ovr),
      buyer: karta.buyer === null ? null : karta.buyer.clubId,
    });
    next.cardActions = [];
  };

  // Set only on the KUPNO/PANIC/WOLNY haggle "wage" outcome - applied to the
  // purchased/signed player's mnoznikPlacy below, mirroring KARA_PLACA's
  // permanent-multiplier treatment for stalling. PRZEDLUZENIE's own "wage"
  // outcome instead discounts cena directly (the ask itself), so it never
  // sets this flag.
  let wageHaggled = false;
  // Set only when a haggled PRZEDLUZENIE is lost - the player leaves right
  // away (mockup: "ryzyko że odejdzie od razu"), unlike a plain decline
  // ("Nie przedłużaj"), which sets wygasa and leaves the squad only at
  // season end.
  let extensionLeftImmediately = false;
  // A won haggle says what improved; the transaction sentence that follows
  // carries the resulting fee and wage, so neither amount is ever missing.
  let haggleNote: string | null = null;
  const withHaggleNote = (sentence: string): string =>
    haggleNote === null ? sentence : `${haggleNote} ${sentence}`;

  if (akcja === "targ") {
    // "Albo lepiej, albo przepada": rescale HAGGLE_ODDS by the market's state at this offer's
    // position, then roll once against the two improvement outcomes.
    const odds = HAGGLE_ODDS[karta.typ];
    const shift = marketHaggleShift(karta.typ, base.rynek[karta.zawodnik.poz]);
    const lost = Math.min(1, Math.max(0, odds.lost + shift));
    const scale = odds.lost >= 1 ? 0 : (1 - lost) / (1 - odds.lost);
    const feeChance = odds.fee * scale;
    const wageChance = odds.wage * scale;

    const r = rng.next();
    if (r < feeChance) {
      cena =
        karta.typ === "SPRZEDAZ"
          ? zaokr(cena * (1 + HAGGLE_SALE_BONUS), 2)
          : zaokr(cena * (1 - HAGGLE_FEE_DISCOUNT), 2);
      haggleNote = karta.typ === "SPRZEDAZ" ? HAGGLE_WON.higherFee : HAGGLE_WON.lowerFee;
      wynikId = "UTARG_KWOTA";
      akcja = "tak";
    } else if (r < feeChance + wageChance) {
      if (karta.typ === "PRZEDLUZENIE") {
        cena = zaokr(cena * (1 - HAGGLE_FEE_DISCOUNT), 2);
        haggleNote = HAGGLE_WON.lowerWage;
      } else {
        wageHaggled = true;
        haggleNote = HAGGLE_WON.lowerWage;
      }
      wynikId = "UTARG_PLACA";
      akcja = "tak";
    } else {
      wpis =
        karta.typ === "SPRZEDAZ"
          ? buyerWithdrewMessage(karta.zawodnik, karta.buyer?.name ?? null)
          : karta.typ === "WOLNY"
            ? freeAgentWentElsewhereMessage(karta.zawodnik)
            : karta.typ === "PRZEDLUZENIE"
              ? extensionWalkoutMessage(karta.zawodnik, playerWage(karta.zawodnik))
              : purchaseLostMessage(karta.zawodnik);
      wynikId = "PRZEPADL";
      akcja = "pas";
      if (karta.typ === "PRZEDLUZENIE") extensionLeftImmediately = true;
    }
  }

  if (akcja === "tak") {
    if (karta.typ === "SPRZEDAZ") {
      const afterSale = base.kadra.filter((z) => z.id !== karta.zawodnik.id);
      const { kadra: filled, debiutanci } = refillAfterDeparture(rng, base, afterSale, sezon);
      next.kadra = filled;
      // The fee on the card and the player's departure are unaffected: only
      // what the club banks is controlled.
      next.kasa = zaokr(next.kasa + creditedIncome(cena, incomeMode), 2);
      wpis = withHaggleNote(
        saleMessage(karta.zawodnik, cena, karta.buyer?.name ?? null, playerWage(karta.zawodnik))
      );
      const debut = academyDebutMessage(debiutanci);
      if (debut !== null) wpis = `${wpis} ${debut}`;
    } else if (karta.typ === "PRZEDLUZENIE") {
      next.kadra = base.kadra.map((z) =>
        z.id === karta.zawodnik.id
          ? { ...z, mnoznikPlacy: zaokr(cena / baseWage(z.ovr), 4), kontraktOd: sezon }
          : z
      );
      wpis = withHaggleNote(extensionMessage(karta.zawodnik, cena));
    } else {
      if (cena > base.kasa) {
        wynikId = "BRAK_SRODKOW";
        // After stalling, the player pushed the price up and then could not
        // pay it - a different story from simply not affording the asking
        // price. Stalling adds KARA_CENA (+12%) per attempt, so the
        // negotiation is often what put the deal out of reach, and saying
        // only "no funds" hides that from the person who caused it.
        //
        // The no-stall branch is reachable, not dead: capPurchasePrice caps
        // a card at kasa * PURCHASE_PRICE_CAP, which is 1 / (1 - 0.2) = 1.25,
        // so a fresh card can ask up to a quarter more than we hold. That is
        // the cap doing its job - such a card is affordable only after a
        // successful haggle, which takes HAGGLE_FEE_DISCOUNT (-20%) off and
        // brings 1.25 * kasa back to kasa. Taking it outright fails here.
        next.log = [
          withHaggleNote(insufficientFundsMessage(karta.zawodnik, cena, base.kasa, n > 0)),
          ...base.log,
        ].slice(0, 6);
        pushDecisionEvent();
        return nastepnaKarta(rng, next, incomeMode);
      }
      const nowy = {
        ...karta.zawodnik,
        moj: true,
        cenaZakupu: cena,
        ageAtSigning: karta.zawodnik.wiek,
        // A free agent costs more in wages precisely BECAUSE there is no fee:
        // the money the selling club does not take is split between the
        // player and his agent, as a higher salary and a signing premium.
        // Only the WOLNY card - KUPNO, PANIC and PRZEDLUZENIE keep today's
        // arithmetic. Without this the card is pure profit, and raising the
        // whole wage curve would not change that, because it raises KUPNO by
        // exactly as much.
        mnoznikPlacy:
          signingWageMultiplier(karta.typ, n) * (wageHaggled ? 1 - HAGGLE_WAGE_DISCOUNT : 1),
        wKlubieOd: sezon,
        kontraktOd: sezon,
      };
      // The cut uses the outcome computed above from the same shared
      // comparator - the reducer must not carry a second copy of the
      // tie-break. Only reached once the signing has actually gone through,
      // so a haggle that fell apart releases nobody.
      let nk = [...base.kadra, nowy];
      if (capacityOutcome?.kind === "evictsExisting") {
        nk = nk.filter((z) => z.id !== capacityOutcome.player.id);
      }
      next.kadra = nk;
      signedPlayer = nowy;
      // The scout's verdict on the offer card IS what the club now remembers.
      // Inherited verbatim, not "at least this good": the coach opening the
      // drawer a moment later must not contradict the card the player just
      // acted on.
      next.staffMemory = {
        ...next.staffMemory,
        [nowy.id]: staffMemoOf(karta.staffAssessment, sezon, null),
      };
      next.moje = [...base.moje, nowy];
      next.kasa = zaokr(next.kasa - cena, 2);
      wpis = withHaggleNote(
        karta.typ === "WOLNY"
          ? freeAgentSigningMessage(karta.zawodnik, playerWage(nowy))
          : purchaseMessage(karta.zawodnik, cena, playerWage(nowy))
      );
      if (capacityOutcome?.kind === "evictsExisting") {
        wpis = `${wpis} ${squadEvictionMessage(capacityOutcome.player.poz, capacityOutcome.player)}`;
      }
    }
  } else {
    if (karta.typ === "KUPNO" || karta.typ === "PANIC") {
      next.odrzuceni = [...base.odrzuceni, { player: karta.zawodnik, fee: cenaWyswietlana }];
    } else if (karta.typ === "PRZEDLUZENIE") {
      if (extensionLeftImmediately) {
        const afterLeave = base.kadra.filter((z) => z.id !== karta.zawodnik.id);
        const { kadra: filled, debiutanci } = refillAfterDeparture(rng, base, afterLeave, sezon);
        next.kadra = filled;
        const debut = academyDebutMessage(debiutanci);
        if (debut !== null) wpis = `${wpis} ${debut}`;
      } else {
        next.kadra = base.kadra.map((z) =>
          z.id === karta.zawodnik.id ? { ...z, wygasa: true } : z
        );
        wpis = extensionDeclinedMessage(karta.zawodnik);
      }
    }
    wpis =
      wpis ??
      (karta.typ === "SPRZEDAZ"
        ? saleDeclinedMessage(karta.zawodnik, cenaWyswietlana)
        : karta.typ === "WOLNY"
          ? freeAgentDeclinedMessage(
              karta.zawodnik,
              baseWage(karta.zawodnik.ovr) * signingWageMultiplier(karta.typ, n)
            )
          : purchaseDeclinedMessage(karta.zawodnik, cenaWyswietlana));
  }

  pushDecisionEvent();
  // updater form: setLog((l) => [wpis, ...l].slice(0, 6))
  next.log = [wpis, ...base.log].slice(0, 6);
  // A decision can add a player (signing, academy refill after a departure)
  // and remove one (sale, refused extension, a squad-depth cut). Rebuilding
  // the memory here does both: departures lose their entry, arrivals get one.
  // The signing already has his, seeded above from the scout's own card
  // verdict, and rememberSquad leaves a memo for THIS season alone - so the
  // coach shows exactly what the scout showed, rather than a fresh roll.
  next.staffMemory = rememberSquad(next.staffMemory, next.kadra, sezon);
  return nastepnaKarta(rng, next, incomeMode);
};

/**
 * Mirrors startZPoziomem :198-247, now driven by the club the player chose
 * rather than one drawn from a difficulty pool. Shared by START_CAREER and
 * PLAY_AGAIN.
 *
 * The career's first draw is the formation: the old club draw is gone
 * outright (2026-09-14) rather than kept as a dead `pick()` to preserve the
 * old stream position - a club that is chosen, not rolled, has nothing left
 * for that draw to decide.
 */
const applyStartCareer = (base: GameState, clubId: string, seed: number): GameState => {
  const rng = createRng(seed);
  const club = clubById(clubId);
  const careerBaseline = buildCareerBaseline(clubId);
  const formacja = pick(rng, Object.keys(FORMACJE) as FormationId[]);
  const kd = createSquadFromFormation(rng, FORMACJE[formacja], clubRating(club));
  const firstStep = base.kroki[0] as Extract<ScheduleStep, { typ: "okno" }>;
  // Hoisted out of the object literal below so the draw tally the start
  // event records is written after the market roll by construction, rather
  // than by whichever order the literal's properties happen to be in.
  const rynek = rollMarket(rng, FORMACJE[formacja]);
  const rngDrawCount = rng.draws();

  const budzet = zaokr(openingBudget(clubId), 2);
  // The first season replays Poland's real 2026/27 berths, via the same
  // baseline the verdict and the epilogue will later read - frozen once,
  // read everywhere, never rederived from the raw berth table a second time.
  const europeanCup = careerBaseline.initialEuropeanCup;
  const membership = startingMembership();
  // Frozen after the squad exists and the cup is known, before the first
  // summer card - the first of the spec's two freezing moments.
  const forecast = freezeSeasonForecast({
    squad: kd,
    cup: europeanCup,
    clubShortName: club.shortName,
    formation: FORMACJE[formacja],
    membership,
  });

  return {
    ...base,
    seed,
    club,
    careerBaseline,
    formacja,
    kadra: kd,
    // The club's own money, not a hand-written pool budget: a share of its
    // recurring revenue, floored for playability.
    kasa: budzet,
    rynek,
    krok: 0,
    ruchy: firstStep.ruchy,
    historia: [],
    moje: [],
    odrzuceni: [],
    log: [],
    epilog: [],
    epilogIdx: 0,
    finalne: null,
    werdykt: null,
    drugaSzansa: null,
    transferRumour: null,
    ovrChange: { season: 0, byPlayer: {} },
    wynikSezonu: null,
    // A fresh career starts with no table and no league season: both are
    // overwritten at the first autumn round anyway, but leaving the previous
    // career's copies behind puts dead state into the autosave.
    tabela: null,
    liga: null,
    // Named explicitly because `...base` would otherwise carry the previous
    // tenure's promotions, relegations and its relegation flag into a career
    // that has not played a match yet.
    membership,
    europeanCup,
    seasonForecastExpectedPlace: forecast.expectedPlace,
    seasonForecastEuropeanIncome: forecast.europeanIncome,
    relegated: false,
    // The starting squad is observed from season one: the club has had these
    // players all along, so the coach's first report is written now rather
    // than waiting for someone to open a drawer.
    staffMemory: rememberSquad({}, kd, firstStep.sezon),
    karta: null,
    czas: CZAS_BAZOWY,
    maxCzas: CZAS_BAZOWY,
    przeciagniecia: 0,
    pytamRestart: false,
    faza: "przeglad",
    // Only decisions taken after the start belong here - the chosen club,
    // the manager and the seed each have their own replay field instead.
    akcje: [],
    cardActions: [],
    decisionIndex: 0,
    trace: [
      {
        type: "start",
        seed,
        clubId,
        club: club.shortName,
        budget: budzet,
        formation: formacja,
        tenureHandicap: careerBaseline.tenureHandicap,
        legacyHandicap: careerBaseline.legacyHandicap,
        rngDrawCount,
      },
      forecastEvent(firstStep.sezon, clubId, kd, forecast),
      {
        type: "window",
        sezon: firstStep.sezon,
        tura: firstStep.tura.toUpperCase(),
        ruchy: firstStep.ruchy,
      },
    ],
    rngState: rng.state(),
    // A fresh career counts from its own seed, not from whatever the
    // previous tenure had drawn.
    rngDrawCount,
  };
};

/**
 * `options` is measurement scaffolding and nothing more: it defaults to the
 * normal game, is never read out of GameState, and never reaches a save or a
 * replay. Every caller inside a measurement run has to pass it to EVERY
 * dispatch, or a single uncontrolled settlement would quietly re-credit the
 * money the run exists to withhold.
 */
export const gameReducer = (
  base: GameState,
  action: GameAction,
  options?: MeasurementOptions
): GameState => {
  const incomeMode: IncomeMode = options?.incomeMode ?? "normal";
  switch (action.type) {
    case "START_GAME": {
      const managerResult = validateManagerIdentity(action.manager);
      if (!managerResult.ok) return base;
      return { ...base, faza: "wybor", manager: managerResult.value };
    }
    case "BACK":
      return { ...base, faza: "start" };
    case "TOGGLE_TIMER":
      return { ...base, timerWl: !base.timerWl };
    case "START_CAREER": {
      const managerResult = validateManagerIdentity(action.manager);
      if (!managerResult.ok) return base;
      let club;
      try {
        club = clubById(action.clubId);
      } catch {
        return base;
      }
      return applyStartCareer({ ...base, manager: managerResult.value }, club.clubId, action.seed);
    }
    case "PLAY_AGAIN":
      if (!base.club) return base;
      return applyStartCareer(base, base.club.clubId, action.seed);
    case "OPEN_OFFERS": {
      const rng = createRng(base.rngState);
      const formacja = formationOf(base);
      const currentClubOvr = baseSquadStrength(base.kadra, null, formacja);
      const context: OfferReportContext = {
        period: reportPeriod(base),
        userClubId: defined(base.club, "club").clubId,
        currentClubOvr,
        membership: base.membership,
        staffMemory: base.staffMemory,
      };
      const karta = rollOffer(
        rng,
        base.kadra,
        base.rynek,
        formacja,
        context,
        base.ruchy === 1,
        base.kasa,
        currentSeason(base)
      );
      return finishRng(
        {
          ...base,
          karta,
          czas: CZAS_BAZOWY,
          maxCzas: CZAS_BAZOWY,
          przeciagniecia: 0,
          faza: "okno",
        },
        rng,
        base.rngDrawCount
      );
    }
    case "STALL": {
      if (base.przeciagniecia >= MAX_PRZECIAGNIEC) return base;
      return {
        ...base,
        akcje: [...base.akcje, "CZAS"],
        cardActions: [...base.cardActions, "CZAS"],
        przeciagniecia: base.przeciagniecia + 1,
        czas: base.czas + CZAS_DODATKOWY,
        maxCzas: base.maxCzas + CZAS_DODATKOWY,
      };
    }
    case "CONFIRM_SQUAD_EVICTION": {
      // Re-validated against the state as it stands now, never trusted from
      // the caller. The timer runs under the dialog and can close this offer
      // and deal the next one in a single pass, so a late confirmation must
      // not be able to accept a card the player never saw.
      if (!base.karta || base.karta.zawodnik.id !== action.offerPlayerId) return base;
      if (!isExternalSigningType(base.karta.typ)) return base;
      const outcome = acquisitionCapacityOutcome(
        base.kadra,
        base.karta.zawodnik,
        formationOf(base)
      );
      if (outcome.kind !== "evictsExisting" || outcome.player.id !== action.evictedPlayerId) {
        return base;
      }
      const rng = createRng(base.rngState);
      const next = decide(rng, base, action.choice, incomeMode, action.evictedPlayerId);
      return finishDecision(base, next, rng);
    }
    case "DECIDE": {
      if (!base.karta) return base;
      const rng = createRng(base.rngState);
      const next = decide(rng, base, action.choice, incomeMode);
      return finishDecision(base, next, rng);
    }
    case "TICK": {
      if (base.faza !== "okno" || !base.timerWl || !base.karta) return base;
      if (base.czas <= 1) {
        const rng = createRng(base.rngState);
        return finishRng(decide(rng, base, "pass", incomeMode), rng, base.rngDrawCount);
      }
      return { ...base, czas: base.czas - 1 };
    }
    case "RECONCILE_TIME": {
      // Wall-clock catch-up for a countdown that kept running while the tab
      // was backgrounded/suspended (see src/ui/app.tsx) - closes the loophole
      // where locking the screen would otherwise freeze `czas`. Same
      // expiry-vs-tick split as TICK above, just for an arbitrary elapsed
      // span instead of one second.
      if (base.faza !== "okno" || !base.timerWl || !base.karta || action.elapsedSeconds <= 0) {
        return base;
      }
      if (base.czas - action.elapsedSeconds <= 0) {
        const rng = createRng(base.rngState);
        return finishRng(decide(rng, base, "pass", incomeMode), rng, base.rngDrawCount);
      }
      return { ...base, czas: base.czas - action.elapsedSeconds };
    }
    case "ADVANCE": {
      if (base.faza === "polSezonu" || base.faza === "koniecSezonu") {
        const rng = createRng(base.rngState);
        return finishRng(dalejKrok(rng, { ...base }, incomeMode), rng, base.rngDrawCount);
      }
      if (base.faza === "epilog") {
        if (base.epilogIdx < base.epilog.length - 1) {
          return { ...base, epilogIdx: base.epilogIdx + 1 };
        }
        return { ...base, faza: "final" };
      }
      return base;
    }
    case "RUN_EPILOGUE": {
      const rng = createRng(base.rngState);
      const input = {
        kadra: base.kadra,
        kasa: base.kasa,
        europeanCup: base.europeanCup,
        club: defined(base.club, "club"),
        formacja: formationOf(base),
        historia: base.historia,
        odrzuceni: base.odrzuceni,
        legacyHandicap: defined(base.careerBaseline, "career baseline").legacyHandicap,
        membership: base.membership,
        incomeMode,
      };
      // A relegated tenure has no seasons 6-8 to play: the club is no longer
      // in the top flight and the game does not model the one below. runFinale
      // draws nothing, so the rng state is left where the last season put it.
      const result = base.relegated ? runFinale(input) : runEpilogue(rng, input);
      const next: GameState = { ...base };
      result.pages.forEach((s) => {
        pushEvent(next, {
          type: "epilogue",
          nr: s.nr,
          miejsce: s.miejsce,
          pkt: s.pkt,
          naglowki: s.naglowki.map((x) => x.kind),
        });
      });
      if (result.secondChance) {
        next.drugaSzansa = result.secondChance.text;
        pushEvent(next, { type: "secondChance", ceiling: result.secondChance.ceiling });
      }
      // Deliberately not a trace event: the rumour changes nothing the engine
      // computes, so recording it would make the golden traces move for a
      // sentence. It is carried in state for the final screen only.
      next.transferRumour = result.transferRumour;
      pushEvent(next, {
        type: "end",
        dziedzictwo: result.legacy.dziedzictwo,
        kasa: result.legacy.kasa,
        tytul: result.legacy.tytul,
        nastepny: result.legacy.nastepny,
      });
      next.epilog = result.pages;
      next.epilogIdx = 0;
      next.finalne = result.legacy;
      // "final" is the legacy screen every career ends on, not a screen of its
      // own for relegation. A relegated tenure simply skips the epilogue pages
      // between werdykt and it. Going through an empty page list would work by
      // arithmetic (0 < -1 is false) rather than by intent.
      next.faza = base.relegated ? "final" : "epilog";
      return finishRng(next, rng, base.rngDrawCount);
    }
    case "ASK_RESTART":
      return { ...base, pytamRestart: true };
    case "CANCEL_RESTART":
      return { ...base, pytamRestart: false };
    case "CONFIRM_RESTART":
      // The manager stays; the previous tenure's club and baseline must not
      // leak into a screen that is about to show a fresh choice.
      return { ...base, faza: "wybor", club: null, careerBaseline: null };
    default:
      return base;
  }
};
