import type { EuropeanCup } from "../src/data/types";
import { simulateGame, type Policy } from "../src/logic/simulate";
import {
  alwaysPass,
  alwaysTake,
  cycle,
  veteranOnlyBuy,
  youngOnlyBuy,
} from "../src/logic/simulate-policies";
import { ANCHOR_CLUB_IDS } from "./balance-cli";
import { seedSeries } from "./seed-series";
import { mean, median, quantile } from "./stats";
import { at } from "../src/logic/invariant";

/**
 * Who actually plays in Europe, measured on whole headless careers.
 *
 * The first version of this audit asked which club has the fourth-strongest
 * squad and called it the Conference League entrant. That is not the same
 * question: the table is played by the match engine, which has its own
 * randomness, so strength rank is not finishing position - and the squad it
 * measured was a season-one squad, weighted as a club playing no european
 * football at all, while the game weights the bench by the cup being played
 * and sends a squad that has had up to five seasons of transfers and
 * development.
 *
 * This module answers it properly: it plays careers and reads the strength
 * the engine itself recorded (`sila` on the season trace line), which is the
 * exact value symulujRunde passed to resolveSeasonalEuropeanOutcome. No
 * mapping, no proxy.
 */

export const CAREER_POLICIES: Record<string, Policy> = {
  /** This policy is an outlier, not a baseline - on
   * `trudny` it is relegated in 94.2% of games, so it contributes few late
   * seasons and almost no european campaigns. Kept because it brackets the
   * range of squads the game can send. */
  alwaysPass,
  mixed: cycle(["bierz", "pas", "targ"]),
  alwaysTake,
  youngOnlyBuy,
  veteranOnlyBuy,
};

/** The four-club anchor set shared with the balance CLI's default `--clubs`,
 * reused here so a career sweep sees the same spread of club strengths
 * without a second list to keep in sync. */
export const CAREER_CLUBS: readonly string[] = ANCHOR_CLUB_IDS;

export type CampaignObservation = {
  clubId: string;
  policy: string;
  seed: number;
  sezon: number;
  /** The competition the campaign STARTED in - the club's berth, before any
   * cascade drop. */
  cup: EuropeanCup;
  /** squadStrength exactly as the engine computed it for that season, bench
   * weighted for the cup actually being played. */
  strength: number;
  legs: number;
  /** Did the first leg get past qualifying? Read off the campaign shape the
   * engine recorded, so it is an observed outcome, not a re-simulation. */
  qualified: boolean;
  /** Did the campaign end in a league phase anywhere in the cascade? */
  reachedLeague: boolean;
  reachedKnockout: boolean;
};

export type CareerError = { clubId: string; policy: string; seed: number; message: string };

const CUP_CODES: readonly string[] = ["LM", "LE", "LK"];

const parseCampaign = (kampania: string): { cup: EuropeanCup; legs: string[] } | null => {
  if (kampania === "brak") return null;
  const legs = kampania.split(">");
  const cup = at(at(legs, 0, "first campaign leg").split("/"), 0, "cup code");
  if (!CUP_CODES.includes(cup)) throw new Error(`Unreadable campaign trace: "${kampania}"`);
  return { cup: cup as EuropeanCup, legs };
};

/** One career, reduced to its european campaigns. */
export const careerCampaigns = (
  clubId: string,
  policyName: string,
  policy: Policy,
  seed: number
): CampaignObservation[] => {
  const { events } = simulateGame({ seed, clubId, policy });
  const observations: CampaignObservation[] = [];
  for (const event of events) {
    if (event.type !== "season") continue;
    const campaign = parseCampaign(event.kampania);
    if (!campaign) continue;
    const last = at(campaign.legs, campaign.legs.length - 1, "last campaign leg");
    const firstStage = at(campaign.legs, 0, "first campaign leg").split("/")[1];
    observations.push({
      clubId,
      policy: policyName,
      seed,
      sezon: event.sezon,
      cup: campaign.cup,
      strength: event.sila,
      legs: campaign.legs.length,
      qualified: firstStage !== "qualifying",
      reachedLeague: !last.endsWith("/qualifying"),
      reachedKnockout: last.endsWith("/knockout"),
    });
  }
  return observations;
};

export type CareerRun = {
  observations: readonly CampaignObservation[];
  errors: readonly CareerError[];
  careers: number;
};

export const collectCampaigns = (
  baseSeed: number,
  careersPerCell: number,
  clubs: readonly string[] = CAREER_CLUBS,
  policies: Record<string, Policy> = CAREER_POLICIES
): CareerRun => {
  const seeds = seedSeries(baseSeed, careersPerCell);
  const observations: CampaignObservation[] = [];
  const errors: CareerError[] = [];
  let careers = 0;

  for (const clubId of clubs) {
    for (const [policyName, policy] of Object.entries(policies)) {
      for (const seed of seeds) {
        careers += 1;
        try {
          observations.push(...careerCampaigns(clubId, policyName, policy, seed));
        } catch (error) {
          // A career that throws is reported, never silently dropped: a
          // missing career biases the distribution in a direction nobody can
          // see from the aggregate.
          errors.push({
            clubId,
            policy: policyName,
            seed,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  return { observations, errors, careers };
};

export type StrengthDistribution = {
  label: string;
  n: number;
  p25: number;
  median: number;
  p75: number;
  mean: number;
  /** Observed share of campaigns that got past qualifying in the first
   * competition - what the careers actually produced. */
  qualifiedShare: number;
};

export const distributionOf = (
  label: string,
  observations: readonly CampaignObservation[]
): StrengthDistribution | null => {
  if (observations.length === 0) return null;
  const strengths = observations.map((o) => o.strength);
  return {
    label,
    n: observations.length,
    p25: quantile(strengths, 0.25),
    median: median(strengths),
    p75: quantile(strengths, 0.75),
    mean: mean(strengths),
    qualifiedShare: observations.filter((o) => o.qualified).length / observations.length,
  };
};

/** Groups the observations by an arbitrary key, preserving the given order of
 * keys so a report reads seasons 1..5 rather than whatever order they were
 * first seen in. */
export const groupBy = <T extends string | number>(
  observations: readonly CampaignObservation[],
  key: (_observation: CampaignObservation) => T,
  order: readonly T[]
): { key: T; observations: CampaignObservation[] }[] =>
  order.map((value) => ({
    key: value,
    observations: observations.filter((o) => key(o) === value),
  }));

/**
 * The first campaign each career played in a given competition, one per
 * career.
 *
 * Why it matters: how MANY campaigns a career contributes is not independent
 * of how they went. Passing the Champions League qualifiers pays, a richer
 * club stays in the top two, and it plays there again; failing pays less and
 * often ends the club's run of that berth. Averaging over all campaigns -
 * pooled or per career - therefore samples failures and successes at
 * different rates, a stopping rule dressed up as a sample. Whether a career's
 * FIRST campaign in a competition exists cannot depend on that campaign's own
 * outcome, so this subset is free of that effect, at the price of a smaller n.
 */
export const firstCampaignPerCareer = (
  observations: readonly CampaignObservation[]
): CampaignObservation[] => {
  const seen = new Set<string>();
  const first: CampaignObservation[] = [];
  for (const o of [...observations].sort((a, b) => a.sezon - b.sezon)) {
    const key = `${o.clubId}|${o.policy}|${o.seed}|${o.cup}`;
    if (seen.has(key)) continue;
    seen.add(key);
    first.push(o);
  }
  return first;
};

export type ModelResidual = {
  observations: number;
  /** Independent clusters behind the estimate - seeds, not careers. */
  clusters: number;
  /** Mean of (observed qualified - model pQualify at the observed strength),
   * averaged within a career first and over careers second. */
  mean: number;
  se: number;
};

/**
 * Does what the careers actually produced agree with what the model promises
 * at the strengths those careers actually had?
 *
 * THE CLUSTER IS THE SEED, not the career. Every seed is replayed in every
 * club x policy cell and draws the same formation and market there, so
 * careers sharing a seed are not independent either - and
 * clustering one level too fine is not a detail: on the Champions League it
 * reported -2.8 +- 1.2 pp, which reads as a real discrepancy, where the seed
 * cluster gives -1.9 +- 1.5 pp, which is noise. Pooling campaigns as if each
 * were independent is tighter still and wronger still.
 *
 * A residual far from zero would mean the strength recorded on the season
 * line is not the strength the draw used. It is a consistency check on the
 * measurement, never evidence about the constants.
 */
export const qualifyResidual = (
  observations: readonly CampaignObservation[],
  modelQualify: (_observation: CampaignObservation) => number
): ModelResidual | null => {
  if (observations.length === 0) return null;
  const bySeed = new Map<number, number[]>();
  for (const o of observations) {
    const residual = (o.qualified ? 1 : 0) - modelQualify(o);
    bySeed.set(o.seed, [...(bySeed.get(o.seed) ?? []), residual]);
  }
  const careerMeans = [...bySeed.values()].map((values) => mean(values));
  const average = mean(careerMeans);
  const se =
    careerMeans.length < 2
      ? 0
      : Math.sqrt(
          careerMeans.reduce((sum, value) => sum + (value - average) ** 2, 0) /
            (careerMeans.length - 1) /
            careerMeans.length
        );
  return { observations: observations.length, clusters: careerMeans.length, mean: average, se };
};
