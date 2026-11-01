import { expect, test } from "vitest";

import type { GameState, Offer, Player } from "../../src/data/types";
import { SQUAD_BENCH_BUFFER } from "../../src/data/balance";
import { FORMACJE } from "../../src/data/positions";
import { gameReducer } from "../../src/logic/game-reducer";
import { acquisitionCapacityOutcome, formationOf } from "../../src/logic/squad";
import { initialState } from "../../src/logic/game-state";
import { makeTestPlayer, quietMarket, testCareerBaseline, testClub } from "./fixtures";

/**
 * Buying past a position's design squad size should build a deep bench, not
 * evict a reserve every time - the cap only kicks in past
 * kadra + SQUAD_BENCH_BUFFER. See the 2026-08-12 follow-up ("znika mi 3. rezerwowy" was unacceptable).
 *
 * Since 2026-08-27 the cut is no longer silent: it follows bySquadPriority
 * rather than array order, and an accept that would trigger one has to be
 * confirmed explicitly.
 */

// Stronger than every existing player by default, so the purchase itself
// never becomes the weakest reserve and the eviction check targets an
// existing player.
const kupnoCard = (id: string, overrides: Partial<Player> = {}): Offer => ({
  typ: "KUPNO",
  zawodnik: makeTestPlayer(id, { ovr: 90, ...overrides }),
  cena: 0.1,
  sourceClub: null,
  buyer: null,
  staffAssessment: {
    source: "scout",
    focus: "potential",
    outlook: "leagueLevel",
    confidence: "medium",
    isFirstObservation: true,
  },
  analystReport: {
    metrics: [
      { metricId: "goalsPreventedPer90", percentile: 50, value: 0 },
      { metricId: "positioningErrorAverage", percentile: 50, value: 2.06 },
    ],
    minutes: 900,
    sampleTier: "medium",
    period: { season: 1, window: "summer" },
    contextTier: "mid",
  },
});

const stateWithSquad = (squad: Player[], card: Offer = kupnoCard("nowy")): GameState => ({
  ...initialState(),
  faza: "okno",
  club: testClub,
  careerBaseline: testCareerBaseline,
  kadra: squad,
  kasa: 100,
  rynek: quietMarket,
  ruchy: 2,
  karta: card,
});

const descendingSquad = (count: number): Player[] =>
  Array.from({ length: count }, (_, i) => makeTestPlayer(`existing-${i}`, { ovr: 70 - i }));

const stateWithSquadOnPosition = (count: number): GameState =>
  stateWithSquad(descendingSquad(count));

// The state under test comes from initialState(), whose formation is
// 4-3-3, so the depth budget has to be read from that same shape.
const loDef = FORMACJE["4-3-3"].pozycje.find((t) => t.kod === "LO")!;
const capacity = loDef.kadra + SQUAD_BENCH_BUFFER;

/** Accepts the card the way the UI and the simulator both do: a plain DECIDE
 * when there is room, an explicit confirmation naming the evicted player when
 * there is not. */
const accept = (state: GameState, choice: "take" | "haggle" = "take"): GameState => {
  const outcome = acquisitionCapacityOutcome(
    state.kadra,
    state.karta!.zawodnik,
    formationOf(state)
  );
  return outcome.kind === "evictsExisting"
    ? gameReducer(state, {
        type: "CONFIRM_SQUAD_EVICTION",
        choice,
        offerPlayerId: state.karta!.zawodnik.id,
        evictedPlayerId: outcome.player.id,
      })
    : gameReducer(state, { type: "DECIDE", choice });
};

const buy = (existingCount: number): Player[] => {
  const before = stateWithSquadOnPosition(existingCount);
  const after = accept(before);
  const onPosition = after.kadra.filter((z) => z.poz === "LO");
  expect(onPosition).toHaveLength(Math.min(existingCount + 1, capacity));
  return onPosition;
};

test("buying does not evict a reserve while still under the bench buffer", () => {
  // One below the cap: this purchase lands exactly on the cap, nobody evicted.
  const onPosition = buy(capacity - 1);
  expect(onPosition.every((z) => z.id.startsWith("existing-") || z.id === "nowy")).toBe(true);
});

test("buying past the bench buffer evicts exactly the weakest reserve", () => {
  // Already at the cap - one more purchase must push someone out.
  const onPosition = buy(capacity);
  expect(onPosition.some((z) => z.id === "nowy")).toBe(true);
  expect(onPosition.some((z) => z.id === `existing-${capacity - 1}`)).toBe(false);
});

/**
 * The tie-break the whole change turns on: at equal ovr the older player has
 * the lower priority and is the one released. The result must not depend on
 * where either player sits in the squad array - that array order was exactly
 * the invisible rule this replaced.
 */

const equalBottomSquad = (youngFirst: boolean): Player[] => {
  const young = makeTestPlayer("young-bottom", { ovr: 60, wiek: 21, nazwa: "Adam Młody" });
  const old = makeTestPlayer("old-bottom", { ovr: 60, wiek: 35, nazwa: "Adam Młody" });
  return [
    ...Array.from({ length: capacity - 2 }, (_, i) => makeTestPlayer(`safe-${i}`, { ovr: 70 })),
    ...(youngFirst ? [young, old] : [old, young]),
  ];
};

test("on an equal bottom ovr the older player is released, whatever the array order", () => {
  for (const youngFirst of [true, false]) {
    const after = accept(stateWithSquad(equalBottomSquad(youngFirst)));
    const ids = after.kadra.map((z) => z.id);

    expect(ids, `youngFirst=${youngFirst}`).toContain("young-bottom");
    expect(ids, `youngFirst=${youngFirst}`).not.toContain("old-bottom");
    expect(ids).toContain("nowy");
  }
});

test("a plain DECIDE cannot sign past the cap without confirmation", () => {
  const before = stateWithSquad(descendingSquad(capacity));

  for (const choice of ["take", "haggle"] as const) {
    // No move consumed, no action recorded, no rng advanced.
    expect(gameReducer(before, { type: "DECIDE", choice }), choice).toBe(before);
  }
});

test("a card whose own player would rank last is refused defensively", () => {
  // The generator must never show this, so the reducer only has to refuse it
  // without consuming anything.
  const before = stateWithSquad(
    Array.from({ length: capacity }, (_, i) => makeTestPlayer(`existing-${i}`, { ovr: 80 })),
    kupnoCard("weakest", { ovr: 40 })
  );

  for (const choice of ["take", "haggle"] as const) {
    expect(gameReducer(before, { type: "DECIDE", choice }), choice).toBe(before);
  }
});

test("passing is never blocked by squad capacity", () => {
  const before = stateWithSquad(
    Array.from({ length: capacity }, (_, i) => makeTestPlayer(`existing-${i}`, { ovr: 80 })),
    kupnoCard("weakest", { ovr: 40 })
  );
  const after = gameReducer(before, { type: "DECIDE", choice: "pass" });

  expect(after).not.toBe(before);
  expect(after.akcje.at(-1)).toBe("PAS");
  expect(after.kadra.map((z) => z.id)).toEqual(before.kadra.map((z) => z.id));
});

test("a confirmation naming a stale offer is a no-op", () => {
  const before = stateWithSquad(descendingSquad(capacity));

  expect(
    gameReducer(before, {
      type: "CONFIRM_SQUAD_EVICTION",
      choice: "take",
      offerPlayerId: "someone-else",
      evictedPlayerId: `existing-${capacity - 1}`,
    })
  ).toBe(before);
});

test("a confirmation naming the wrong squad player is a no-op", () => {
  const before = stateWithSquad(descendingSquad(capacity));

  expect(
    gameReducer(before, {
      type: "CONFIRM_SQUAD_EVICTION",
      choice: "take",
      offerPlayerId: "nowy",
      evictedPlayerId: "existing-0",
    })
  ).toBe(before);
});

test("the released player leaves kadra and staffMemory but stays in moje", () => {
  const doomedId = `existing-${capacity - 1}`;
  const base = stateWithSquad(descendingSquad(capacity));
  const before: GameState = {
    ...base,
    // He was signed by this manager in an earlier window: the legacy screen
    // still owes him a line, so `moje` keeps him even though the squad does not.
    moje: [makeTestPlayer(doomedId, { ovr: 70 - (capacity - 1), moj: true })],
    staffMemory: {
      ...base.staffMemory,
      [doomedId]: {
        season: 1,
        outlook: "leagueLevel",
        confidence: "medium",
        seasonsObserved: 1,
      },
    },
  };
  const after = accept(before);

  expect(after.kadra.map((z) => z.id)).not.toContain(doomedId);
  expect(after.staffMemory[doomedId]).toBeUndefined();
  expect(after.moje.map((z) => z.id)).toContain(doomedId);
  // `odrzuceni` means offers the player turned down, not men the club sacked.
  expect(after.odrzuceni.map((entry) => entry.player.id)).not.toContain(doomedId);
});

test("a confirmed haggle that falls through releases nobody", () => {
  const doomedId = `existing-${capacity - 1}`;
  const before = stateWithSquad(descendingSquad(capacity));

  // Walk seeds until one makes the haggle fail, then check that the failure
  // leaves the squad exactly as it was.
  let failures = 0;
  for (let seed = 1; seed < 400 && failures === 0; seed += 1) {
    const after = accept({ ...before, rngState: seed }, "haggle");
    if (after.log[0]?.includes("przepadł")) {
      failures += 1;
      expect(after.kadra.map((z) => z.id)).toContain(doomedId);
      expect(after.kadra.map((z) => z.id)).not.toContain("nowy");
      expect(after.log[0]).not.toContain("rozwiązał kontrakt");
    }
  }

  expect(failures, "no seed produced a failed haggle").toBe(1);
});

test("a sale from an over-full position needs no confirmation", () => {
  const squad = descendingSquad(capacity);
  const before = stateWithSquad(squad, {
    ...kupnoCard("ignored"),
    typ: "SPRZEDAZ",
    cena: 5,
    zawodnik: squad[0]!,
    buyer: { clubId: "lech-poznan", name: "Lech", origin: "domestic" },
  });
  const after = gameReducer(before, { type: "DECIDE", choice: "take" });

  expect(after).not.toBe(before);
  expect(after.kadra.map((z) => z.id)).not.toContain("existing-0");
  expect(after.kasa).toBeGreaterThan(before.kasa);
});

test("an extension in an equally full squad needs no confirmation", () => {
  const squad = descendingSquad(capacity);
  const before = stateWithSquad(squad, {
    ...kupnoCard("ignored"),
    typ: "PRZEDLUZENIE",
    cena: 1,
    zawodnik: squad[0]!,
  });
  const after = gameReducer(before, { type: "DECIDE", choice: "take" });

  expect(after).not.toBe(before);
  expect(after.kadra).toHaveLength(before.kadra.length);
  // The extension went through: the wage multiplier was rewritten from the
  // agreed fee, which a blocked card would have left untouched.
  expect(after.kadra.find((z) => z.id === "existing-0")!.mnoznikPlacy).not.toBe(
    before.kadra.find((z) => z.id === "existing-0")!.mnoznikPlacy
  );
});

/**
 * The rejection path returns the very same state object, and `finishDecision`
 * in the reducer relies on that identity to decide whether to write the rng
 * position back. Both halves are asserted here, because the second one is
 * invisible: a wrapped return would still look correct in every gameplay
 * assertion while silently advancing the draw tally the golden diff reads.
 */
test("a card the newcomer could not survive changes nothing at all", () => {
  const before = stateWithSquad(descendingSquad(capacity), kupnoCard("najslabszy", { ovr: 1 }));
  expect(
    acquisitionCapacityOutcome(before.kadra, before.karta!.zawodnik, formationOf(before)).kind
  ).toBe("rejectsIncoming");

  const after = gameReducer(before, { type: "DECIDE", choice: "take" });

  expect(after).toBe(before);
  expect(after.rngDrawCount).toBe(before.rngDrawCount);
  expect(after.rngState).toBe(before.rngState);
});
