import type { GameState, ManagerIdentity, Offer } from "../data/types";
import type { TraceEvent } from "./trace-format";
import { gameReducer } from "./game-reducer";
import type { MeasurementOptions } from "./income-mode";
import { initialState } from "./game-state";
import { isExternalSigningType } from "./offers";
import { acquisitionCapacityOutcome, formationOf } from "./squad";
import { defined } from "./invariant";

export type Action = "bierz" | "targ" | "pas" | "czas";
export type Policy = (_ctx: { card: Offer; state: GameState; index: number }) => Action;

/**
 * The one manager identity every headless run defaults to: nothing under
 * this driver - golden replay, balance measurement, coverage sweeps - has a
 * reason to vary the manager, and the reducer requires a valid one to reach
 * START_CAREER at all. `PlayOptions.manager` exists for the rare caller that
 * does care (a future manager-shaped test), but every script in `scripts/`
 * leaves it unset and gets this one.
 */
const HEADLESS_MANAGER: ManagerIdentity = { firstName: "Jan", lastName: "Kowalski" };

export type PlayOptions = {
  seed: number;
  clubId: string;
  /** Defaults to HEADLESS_MANAGER - see the comment above. */
  manager?: ManagerIdentity;
  policy?: Policy;
  replay?: string[];
  /** Measurement only: withholds the one-off income streams. Mapped onto the
   * reducer's context in exactly one place, below. See src/logic/income-mode.ts. */
  financeControl?: boolean;
  /** Measurement only: sees each card once, before the first decision on it,
   * together with the state it is shown in. Must not mutate either; it
   * receives the live objects. Draws no RNG and writes nothing to state, so a
   * watched career is bit-identical to an unwatched one
   * (tests/logic/simulate-observer.test.ts). */
  onCard?: (_card: Offer, _decisionIndex: number, _state: GameState) => void;
  /** Measurement only: called after every dispatch inside the decision loop
   * with the state before and after it. Same contract as onCard: no RNG, no
   * writes, no mutation. */
  onStep?: (_before: GameState, _after: GameState) => void;
};

export type PlayResult = {
  seed: number;
  clubId: string;
  akcje: string[];
  state: GameState;
  events: TraceEvent[];
};

/**
 * Dispatches the one phase transition that never needs a player choice
 * (`OPEN_OFFERS`, `ADVANCE`, `RUN_EPILOGUE`) - the same auto-clicks the
 * retired jsdom driver used to perform. Returns `null` once `state` needs an
 * actual decision (or has reached `final`), so callers can loop `state =
 * autoAdvance(state) ?? state` until they hit a phase they care about.
 */
export const autoAdvance = (state: GameState, options?: MeasurementOptions): GameState | null => {
  if (state.faza === "przeglad") return gameReducer(state, { type: "OPEN_OFFERS" }, options);
  if (state.faza === "polSezonu" || state.faza === "koniecSezonu") {
    return gameReducer(state, { type: "ADVANCE" }, options);
  }
  if (state.faza === "werdykt") return gameReducer(state, { type: "RUN_EPILOGUE" }, options);
  if (state.faza === "epilog") return gameReducer(state, { type: "ADVANCE" }, options);
  return null;
};

/**
 * Headless replay/record driver: dispatches actions straight into the pure
 * reducer, zero React/DOM/act. Two modes: `replay` (fixed token list, used by
 * golden tests) and `policy` (a choice function, used by record.test.ts and
 * scripts/balance.ts to explore for coverage/measurement).
 */
/**
 * Delivers an accept the way the UI does. The replay token is already the
 * record of a human decision, and headless has no dialog to click, so it
 * computes the same outcome from the same shared helper and sends the same
 * validated action. Not a second implementation of the eviction rule: the
 * reducer re-checks both ids and is the only thing that changes state.
 */
const signOrConfirm = (
  state: GameState,
  choice: "take" | "haggle",
  options?: MeasurementOptions
): GameState => {
  const karta = defined(state.karta, "card");
  if (!isExternalSigningType(karta.typ)) {
    return gameReducer(state, { type: "DECIDE", choice }, options);
  }
  const outcome = acquisitionCapacityOutcome(state.kadra, karta.zawodnik, formationOf(state));
  if (outcome.kind === "rejectsIncoming") {
    // The generator is contractually forbidden from showing this card. Fail
    // loudly rather than let the driver spin on an offer it cannot answer.
    throw new Error(
      `Generator showed an unusable ${karta.typ} for ${karta.zawodnik.poz}: the signing would rank last`
    );
  }
  if (outcome.kind === "evictsExisting") {
    return gameReducer(
      state,
      {
        type: "CONFIRM_SQUAD_EVICTION",
        choice,
        offerPlayerId: karta.zawodnik.id,
        evictedPlayerId: outcome.player.id,
      },
      options
    );
  }
  return gameReducer(state, { type: "DECIDE", choice }, options);
};

export const simulateGame = (opts: PlayOptions): PlayResult => {
  // The single place the flag becomes a reducer context. Every dispatch below
  // gets it: one uncontrolled settlement would silently re-credit the money
  // the run exists to withhold, and nothing in the result would say so.
  const options: MeasurementOptions | undefined = opts.financeControl
    ? { incomeMode: "finance-control" }
    : undefined;
  const manager = opts.manager ?? HEADLESS_MANAGER;
  let state = gameReducer(initialState(), { type: "START_GAME", manager }, options);
  state = gameReducer(
    state,
    { type: "START_CAREER", clubId: opts.clubId, manager, seed: opts.seed },
    options
  );

  // Replay drops the leading START entry - it is already consumed above.
  const queue = opts.replay ? opts.replay.slice(1) : null;
  let index = 0;
  let guard = 0;
  let lastObserved = -1;

  const advanceTo = (next: GameState): void => {
    opts.onStep?.(state, next);
    state = next;
  };

  while (state.faza !== "final") {
    guard += 1;
    if (guard > 5000) throw new Error("Headless driver exceeded its step guard");

    const advanced = autoAdvance(state, options);
    if (advanced) {
      advanceTo(advanced);
      continue;
    }
    if (state.faza !== "okno" || !state.karta) {
      throw new Error(`Headless driver stuck in phase "${state.faza}"`);
    }

    const closes = state.decisionIndex + 1;
    if (opts.onCard && closes !== lastObserved) {
      opts.onCard(state.karta, closes, state);
      lastObserved = closes;
    }

    const token = queue
      ? queue.shift()?.toLowerCase()
      : defined(opts.policy, "policy")({ card: state.karta, state, index });
    if (!token) throw new Error("The replay ran out of actions before the game ended");

    if (token === "czas") advanceTo(gameReducer(state, { type: "STALL" }, options));
    else if (token === "bierz") advanceTo(signOrConfirm(state, "take", options));
    else if (token === "targ") advanceTo(signOrConfirm(state, "haggle", options));
    // A pass never fills a position, so it is never gated on capacity.
    else if (token === "pas")
      advanceTo(gameReducer(state, { type: "DECIDE", choice: "pass" }, options));
    else throw new Error(`Unknown action token "${token}"`);
    index += 1;
  }

  return { seed: opts.seed, clubId: opts.clubId, akcje: state.akcje, state, events: state.trace };
};
