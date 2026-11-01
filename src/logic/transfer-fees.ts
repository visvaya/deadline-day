import {
  FOREIGN_FEE_SOFT_KNEE,
  MAX_DOMESTIC_FEE,
  MAX_UNHAGGLED_FOREIGN_FEE,
} from "../data/balance";

/**
 * Soft saturation of a foreign transfer fee (spec 4, chapter 5.1).
 *
 * Below the knee the raw fee passes through untouched. Above it the curve
 * bends towards `MAX_UNHAGGLED_FOREIGN_FEE` without ever reaching it, so a
 * successful haggle can add its full 20% and the result still comes out under
 * `MAX_FOREIGN_FEE`. Continuous in value AND in first derivative at the knee,
 * so there is no visible step where the saturation starts.
 *
 * The compression at the top is deliberate: the cash reward for developing a
 * star is bounded, while the uncompressed `marketValue` still counts towards
 * `wartoscKadryMoj` and the legacy if the player is kept. That is the dilemma,
 * not a defect of the curve.
 *
 * NOT WIRED UP YET, and deliberately so. There is no foreign buyer in the
 * game today - every SPRZEDAZ card draws its buyer from the current
 * Ekstraklasa - and applying this to a domestic card would cap a price that
 * has no reason to be capped. Its single application to a foreign
 * `Offer.cena` belongs to step 7 of the spec, together with `buyerClub`,
 * `buyerFactor`, `buyerCapacity` and the tiers.
 */
export const softCapForeignOfferWithParams = (
  rawFee: number,
  knee: number,
  cap: number
): number => {
  if (!Number.isFinite(rawFee) || rawFee < 0) {
    throw new Error(`raw fee must be finite and non-negative, got ${rawFee}`);
  }
  if (!Number.isFinite(knee) || knee < MAX_DOMESTIC_FEE) {
    throw new Error(`knee must be finite and at least the domestic limit, got ${knee}`);
  }
  if (!Number.isFinite(cap) || knee >= cap) {
    throw new Error(`cap must be finite and above the knee, got ${cap}`);
  }
  if (rawFee <= knee) return rawFee;
  const d = cap - knee;
  return cap - d / (1 + (rawFee - knee) / d);
};

/**
 * The production wrapper, with the fitted constants pinned.
 *
 * A thin wrapper rather than a second implementation: the fitting tool has to
 * be able to scan the knee, and a copy of the arithmetic on either side is
 * how the two would come to disagree about the curve the fit chose.
 */
export const softCapForeignOffer = (rawFee: number): number =>
  softCapForeignOfferWithParams(rawFee, FOREIGN_FEE_SOFT_KNEE, MAX_UNHAGGLED_FOREIGN_FEE);
