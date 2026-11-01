import { HAGGLE_FEE_DISCOUNT, PURCHASE_PRICE_CAP } from "../src/data/balance";
import type { Formation, Offer, Player } from "../src/data/types";
import { acquisitionCapacityOutcome, startingXi, substitutes } from "../src/logic/squad";
import { isExternalSigningType } from "../src/logic/offers";
import { zaokr } from "../src/logic/format";

/**
 * The visible slice of GameState a card classification needs: cash, the
 * squad it would be signed into, and the formation that shapes it. Never the
 * whole GameState, so a caller cannot accidentally hand in fields the
 * classifier has no business reading.
 */
export type CardView = {
  readonly kasa: number;
  readonly squad: readonly Player[];
  readonly formation: Formation;
};

export type ExternalCardClass = {
  affordable: boolean;
  affordableWithHaggle: boolean;
  atPriceCap: boolean;
  entersXi: boolean;
  improvesBench: boolean;
  strengthens: boolean;
};

/**
 * Classifies an external-signing card (KUPNO, PANIC, WOLNY) against the squad
 * it would join. Read-only measurement helper for the dilemma-card audit -
 * throws on any other card type, because the generator never shows this kind
 * of dilemma for SPRZEDAZ or PRZEDLUZENIE.
 */
export const classifyExternalCard = (view: CardView, card: Offer): ExternalCardClass => {
  if (!isExternalSigningType(card.typ)) {
    throw new Error(`classifyExternalCard: card type ${card.typ} is not an external signing`);
  }
  const { kasa, squad, formation } = view;
  const player = card.zawodnik;

  // Same condition as canAfford in policies and the UI's own purchase gate.
  const affordable = card.cena <= kasa;

  // Lower bound on the price after haggling, hence an upper bound on
  // reachability: haggling can still fail. Rounded exactly like
  // game-reducer.ts rounds a successful haggle.
  const affordableWithHaggle = zaokr(card.cena * (1 - HAGGLE_FEE_DISCOUNT), 2) <= kasa;

  // An observable marker that the price sits at the cap, not proof that the
  // generator actually clipped a higher price - the original price is not
  // recorded on the card.
  const atPriceCap =
    (card.typ === "KUPNO" || card.typ === "PANIC") &&
    kasa > 0 &&
    card.cena === zaokr(kasa * PURCHASE_PRICE_CAP, 2);

  const outcome = acquisitionCapacityOutcome(squad, player, formation);
  if (outcome.kind === "rejectsIncoming") {
    throw new Error("classifyExternalCard: the generator must never show a rejected signing");
  }
  const squadAfter =
    outcome.kind === "evictsExisting"
      ? [...squad.filter((candidate) => candidate.id !== outcome.player.id), player]
      : [...squad, player];

  const entersXi = startingXi(squadAfter, formation).some(
    (candidate) => candidate.id === player.id
  );

  const benchBefore = substitutes(squad, formation).filter(
    (candidate) => candidate.poz === player.poz
  );
  const improvesBench =
    !entersXi &&
    (benchBefore.length === 0 || player.ovr > Math.min(...benchBefore.map((c) => c.ovr)));

  const strengthens = entersXi || improvesBench;

  return { affordable, affordableWithHaggle, atPriceCap, entersXi, improvesBench, strengthens };
};
