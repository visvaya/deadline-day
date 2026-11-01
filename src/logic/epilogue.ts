import type {
  ClubRecord,
  EpiloguePage,
  EuropeanCup,
  Formation,
  Headline,
  Legacy,
  LeagueMembership,
  PassedOnOffer,
  Player,
  SeasonHistoryEntry,
  TransferRumour,
} from "../data/types";
import {
  SEZONY_GRY,
  SEZONY_EPILOGU,
  KOSZTY_STALE,
  LEGACY_KASA,
  LEGACY_MISTRZOSTWO,
  LEGACY_PUCHAR,
  LEGACY_SPADEK,
  LEGACY_WARTOSC_KADRY,
  PROGI_DZIEDZICTWA,
  PUCHAR_POLSKI_PREMIA,
  SUPERPUCHAR_PREMIA,
  RELEGATED_COUNT,
} from "../data/balance";
import { FOREIGN_CLUB_NAMES } from "../data/foreign-clubs";
import { calculateSeasonRevenue, transferBudgetChange } from "./finance";
import { campaignMoney, resolveSeasonalEuropeanOutcome } from "./european-cups";
import { resolveSuperCup } from "./super-cup";
import { money, pl, zaokr } from "./format";
import { creditedIncome, type IncomeMode } from "./income-mode";
import { marketValue } from "./player";
import { totalPayroll } from "./wages";
import { ageSquad } from "./development";
import { fillEmptyPositions, squadStrength } from "./squad";
import { resolveSeasonOutcome } from "./season";
import { expectedSeasonPoints } from "./expected-points";
import { clubOvr, clubRating, leagueRatings } from "./league-ratings";
import { buildFixtures, emptyStandings, playRounds } from "./league";
import { leagueFixtureOrder, swapTiers } from "./league-membership";
import { createRng, pick, rand, shuffle, type Rng } from "./rng";
import { deriveSeed } from "./stable-seed";
import { at, defined, mapAt } from "./invariant";
import { playerFacts } from "./decision-messages";

export type EpilogueInput = {
  kadra: readonly Player[];
  kasa: number;
  europeanCup: EuropeanCup | null;
  club: ClubRecord;
  formacja: Formation;
  historia: readonly SeasonHistoryEntry[];
  odrzuceni: readonly PassedOnOffer[];
  legacyHandicap: number;
  /** The league as the tenure left it - promotions and relegations
   * included. Rebuilding it from the snapshot would quietly restore every
   * club the player watched go down. */
  membership: LeagueMembership;
  /** Measurement only; defaults to the normal game. See src/logic/income-mode.ts. */
  incomeMode?: IncomeMode;
};

type SecondChance = { text: string; ceiling: number };

export type EpilogueResult = {
  pages: EpiloguePage[];
  /** The league as the epilogue leaves it. Returned rather than discarded so
   * a test can prove the epilogue played the one it inherited. */
  membership: LeagueMembership;
  legacy: Legacy;
  secondChance: SecondChance | null;
  transferRumour: TransferRumour | null;
};

/** Hard ceiling on the rumoured fee, in mln EUR. Sized to the real scale of
 * transfers out of the Ekstraklasa - the old automatic sale had no cap and
 * could quote a number the league has never seen. */
const RUMOUR_MAX_FEE = 11;
const RUMOUR_FEE_MIN_MULTIPLIER = 1.1;
const RUMOUR_FEE_MAX_MULTIPLIER = 1.4;

/**
 * At most one closing story about a player the user developed, drawn after
 * the last epilogue season from the squad as it finally stands.
 *
 * Seeded from the player's own id, never from `rng`: the main stream must
 * produce an identical career whether or not a rumour happens to qualify.
 * Reads only the visible ovr and age - never sufit, marketEdge or any report.
 *
 * Exported so the fee band can be asserted directly. runEpilogue's own squad
 * has been through three seasons of random development by the time this runs,
 * so from the outside the multiplier is unrecoverable.
 */
export const rollTransferRumour = (squad: readonly Player[]): TransferRumour | null => {
  const candidate = squad
    .filter((z) => z.moj && z.wiek <= 26 && marketValue(z.ovr, z.wiek, z.poz) > 3.5)
    .sort((a, b) => marketValue(b.ovr, b.wiek, b.poz) - marketValue(a.ovr, a.wiek, a.poz))[0];
  if (!candidate) return null;

  const rumourRng = createRng(deriveSeed(candidate.id, "epilogue-rumour-v1"));
  const club = pick(rumourRng, FOREIGN_CLUB_NAMES);
  const amount = Math.min(
    RUMOUR_MAX_FEE,
    zaokr(
      marketValue(candidate.ovr, candidate.wiek, candidate.poz) *
        rand(rumourRng, RUMOUR_FEE_MIN_MULTIPLIER, RUMOUR_FEE_MAX_MULTIPLIER),
      1
    )
  );

  return {
    text: `${candidate.nazwa} znalazł się na liście życzeń klubu „${club}”. Według mediów na stole leży oferta w wysokości ${pl(amount, 1)}\u00a0mln\u00a0€.`,
    club,
    amount,
  };
};

/** Exported for scripts/balance.ts, which needs a fixed column order for legacy-tier distributions. */
export const TYTULY = [
  "CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB",
  "ZAPOMNIANY",
  "UCZCIWY WYROBNIK",
  "SOLIDNA ROBOTA",
  "ARCHITEKT",
  "LEGENDA GABINETU",
];

/** Re-exported under the name scripts/legacy-scan-core.ts already imports.
 * The values themselves live in src/data/balance.ts with every other tuning
 * constant, where balance constants live. */
export const PROGI_BAZOWE = PROGI_DZIEDZICTWA;

/** Mirrors prototype's uruchomEpilog :513-651 (pure part). Draw order is part of the golden contract. */
export const runEpilogue = (rng: Rng, input: EpilogueInput): EpilogueResult => {
  const incomeMode: IncomeMode = input.incomeMode ?? "normal";
  let k = [...input.kadra];
  let kk = input.kasa;
  let cup = input.europeanCup;
  let membership = input.membership;
  const strony: EpiloguePage[] = [];
  /** `spadek` is recorded here rather than recomputed later: the table size is
   * in scope at push time and is not once the seasons have been tallied. */
  const dodatkowe: {
    pkt: number;
    miejsce: number;
    puchar: boolean;
    mistrz: boolean;
    spadek: boolean;
  }[] = [];

  for (let i = 0; i < SEZONY_EPILOGU; i++) {
    const s = squadStrength(k, cup, input.formacja);
    const ratings = leagueRatings(k, cup, input.club.shortName, input.formacja, membership);
    const order = shuffle(rng, leagueFixtureOrder(membership));
    const standings = playRounds(rng, buildFixtures(order), ratings, emptyStandings(order));
    const {
      tabela: tab,
      miejsce,
      puchar,
      mistrz,
    } = resolveSeasonOutcome(rng, standings, input.club.shortName, s);
    const pkt = defined(
      standings.find((row) => row.club === input.club.shortName),
      "own standings row"
    ).points;
    // Same draw order as game-reducer's symulujRunde: the cup winner and this
    // season's campaign come right after the player's own cup draw.
    const { europeanRun, nextCup, polishCupWinner } = resolveSeasonalEuropeanOutcome(
      rng,
      tab,
      puchar,
      input.club.shortName,
      cup,
      s
    );
    // Same draw order as game-reducer's symulujRunde: the european campaign
    // first, the Super Cup after it.
    const superCup = resolveSuperCup(rng, tab, polishCupWinner, input.club.shortName, ratings);
    // Age the squad based on this season's performance
    const ownRating = mapAt(ratings, input.club.shortName, "own rating");
    const opponents = [...ratings.entries()]
      .filter(([club]) => club !== input.club.shortName)
      .map(([, rating]) => rating);
    const overperformed = pkt > expectedSeasonPoints(ownRating, opponents);
    // Same relative place as in the reducer - after the season and the cups,
    // before ageSquad - so the epilogue's draw stream moves in step with the
    // tenure's rather than diverging for a reason nobody could read off a
    // golden diff.
    membership = swapTiers(
      rng,
      membership,
      tab.slice(-RELEGATED_COUNT).map((row) => row.club)
    );
    k = fillEmptyPositions(
      rng,
      ageSquad(rng, k, { overperformed }, input.formacja).kadra,
      clubOvr(clubRating(input.club)),
      input.formacja
    ).kadra;
    cup = nextCup;
    dodatkowe.push({
      pkt,
      miejsce,
      puchar,
      mistrz,
      spadek: miejsce > tab.length - RELEGATED_COUNT,
    });

    // Controlled before it reaches `kk`, so the verdict, the final legacy
    // and the breakdown are all computed from the same cash the seasons
    // actually banked. Subtracting after the loop would leave the pages,
    // the headline thresholds and the totals disagreeing.
    // The board's share applies here too, decided 2026-09-12. `kasa` is one
    // quantity across the whole career - the sporting project's available
    // funds, never the club's full books - so leaving the epilogue at a rate
    // of one would make VERDICT_KASA and LEGACY_KASA describe two different
    // things under a single field name. The epilogue signs nobody and
    // receives no new funding; it settles the inherited squad by the tenure's
    // own rule.
    kk = zaokr(
      kk +
        transferBudgetChange(
          calculateSeasonRevenue({
            clubId: input.club.clubId,
            place: miejsce,
            europeanPrize: creditedIncome(campaignMoney(europeanRun), incomeMode),
            polishCupPrize: creditedIncome(puchar ? PUCHAR_POLSKI_PREMIA : 0, incomeMode),
            superCupPrize: creditedIncome(superCup?.won ? SUPERPUCHAR_PREMIA : 0, incomeMode),
          }) -
            (totalPayroll(k) + KOSZTY_STALE)
        ),
      2
    );

    const n: Headline[] = [];
    const przelom = k.filter((z) => z.moj && z.wiek <= 25 && z.ovr >= 77)[0];
    if (przelom)
      n.push({
        kind: "PRZELOM",
        text: `${przelom.nazwa} (${przelom.wiek} l.) najlepszym zawodnikiem ligi. Ocena ${przelom.ovr}.`,
      });
    const flop = k.filter(
      (z) => z.moj && z.wiek >= 24 && z.ovr < 66 && (z.cenaZakupu ?? 0) > 1.5
    )[0];
    if (flop)
      n.push({
        kind: "FLOP",
        text: `${flop.nazwa} znów poza kadrą meczową. Kosztował ${pl(flop.cenaZakupu ?? 0, 1)}\u00a0mln\u00a0€.`,
      });
    // `-4` is deliberately NOT reconverted for the 2026-09-12 activation,
    // and that is a decision rather than an oversight. `kk` now moves at
    // `BOARD_REINVESTMENT_RATE`, so a club reaches this depth more rarely and
    // the headline fires less often - a narrative effect, not a scoring one.
    // The plan that activated the rate said in as many words to keep every
    // headline threshold, because moving one is tuning and tuning belongs to
    // the joint calibration after spec 5. `VERDICT_KASA` and `LEGACY_KASA`
    // WERE reconverted in the same commit; they are scoring constants and
    // this is not.
    if (kk < -4)
      n.push({
        kind: "CIECIA_PLAC",
        text: `Klub tnie płace. Zarząd mówi o „porządkowaniu finansów".`,
      });
    if (mistrz)
      n.push({
        kind: "MISTRZOSTWO",
        text: `Mistrzostwo dla ${input.club.name}. Nowy dyrektor chwalony za pracę przy budowie kadry.`,
      });
    else if (puchar) n.push({ kind: "PUCHAR", text: `Puchar Polski dla ${input.club.name}.` });
    if (miejsce > tab.length - RELEGATED_COUNT)
      n.push({ kind: "SPADEK", text: `Spadek. Klub tłumaczy się długami sprzed lat.` });
    if (!n.length)
      n.push({
        kind: "SEZON_BEZ_HISTORII",
        text: "Sezon bez historii.",
      });

    const naglowki = n.slice(0, 3);
    strony.push({ nr: SEZONY_GRY + i + 1, miejsce, pkt, naglowki });

    // swapTiers has no exception for the player's club, so finishing in the
    // bottom RELEGATED_COUNT places drops it out of the top flight. The game has no model of the
    // division below and next season's leagueRatings would throw, so the
    // epilogue simply ends here - the same answer relegation gets during the
    // tenure. Frozen decision 5 of the pyramid plan.
    const stillUp = membership.clubs.some(
      (c) => c.clubId === input.club.clubId && c.tier === "league"
    );
    if (!stillUp) break;
  }
  return finishEpilogue(input, {
    squad: k,
    cash: kk,
    seasons: dodatkowe,
    pages: strony,
    membership,
  });
};

/**
 * What every ending has in common once the seasons - if any - are over: the
 * "one you turned down" line, the legacy sum and its breakdown.
 *
 * Extracted rather than copied so runFinale can reuse it: a relegated tenure
 * gets no seasons but the same reckoning, and jscpd in `pnpm verify` would
 * catch the copy anyway.
 */
type EpilogueTally = {
  squad: Player[];
  cash: number;
  seasons: { pkt: number; miejsce: number; puchar: boolean; mistrz: boolean; spadek: boolean }[];
  pages: EpiloguePage[];
  membership: LeagueMembership;
};

const finishEpilogue = (input: EpilogueInput, tally: EpilogueTally): EpilogueResult => {
  const k = tally.squad;
  const kk = tally.cash;
  const dodatkowe = tally.seasons;
  const strony = tally.pages;
  const membership = tally.membership;

  let secondChance: SecondChance | null = null;
  if (input.odrzuceni.length) {
    const sorted = [...input.odrzuceni].sort((a, b) => b.player.sufit - a.player.sufit);
    const { player: kand, fee } = at(sorted, 0, "epilogue second chance candidate");
    if (kand.sufit >= 76) {
      secondChance = {
        text: `${playerFacts(kand)}, któremu powiedziałeś „pas” przy kwocie ${money(fee)}, kończy tę historię z oceną ${kand.sufit}.`,
        ceiling: kand.sufit,
      };
    }
  }

  const pktA = input.historia.reduce((a, h) => a + h.pkt, 0);
  const pktB = dodatkowe.reduce((a, h) => a + h.pkt, 0);
  const trofea =
    (input.historia.filter((h) => h.puchar).length + dodatkowe.filter((h) => h.puchar).length) *
      LEGACY_PUCHAR +
    (input.historia.filter((h) => h.mistrz).length + dodatkowe.filter((h) => h.mistrz).length) *
      LEGACY_MISTRZOSTWO;
  const spadkiKadencja = input.historia.filter((h) => h.spadek).length;
  /** Season number of the player's first relegation, 0 when there was none.
   * Diagnostic only - decides whether "relegation ends the contract" leaves
   * enough game to be worth playing. */
  const pierwszySpadekSezon = input.historia.find((h) => h.spadek)?.sezon ?? 0;
  const spadki = spadkiKadencja + dodatkowe.filter((h) => h.spadek).length;
  const wartoscKadry = k.reduce((a, z) => a + marketValue(z.ovr, z.wiek, z.poz), 0);
  const wartoscKadryMoj = k.reduce(
    (a, z) => (z.moj ? a + marketValue(z.ovr, z.wiek, z.poz) : a),
    0
  );
  /** The same signings valued at handover - the moment the club changed
   * hands - instead of after the epilogue. Named for the moment rather than
   * for season five, because relegation can end a tenure earlier and the old
   * name then described the wrong season. Diagnostic only, never enters
   * `dziedzictwo`; read by the balance scan. */
  const wartoscKadryMojAtHandover = input.kadra.reduce(
    (a, z) => (z.moj ? a + marketValue(z.ovr, z.wiek, z.poz) : a),
    0
  );
  const dziedzictwo = Math.round(
    pktA +
      pktB +
      trofea +
      kk * LEGACY_KASA +
      wartoscKadryMoj * LEGACY_WARTOSC_KADRY -
      spadki * LEGACY_SPADEK
  );
  const hd = input.legacyHandicap;
  const progi = PROGI_BAZOWE.map((p) => p - hd);

  const tytulFinalny = at(
    TYTULY,
    progi.filter((p) => dziedzictwo >= p).length,
    "legacy title for threshold count"
  );
  const nastepny = progi.find((p) => p > dziedzictwo);

  return {
    pages: strony,
    membership,
    legacy: {
      dziedzictwo,
      kasa: kk,
      tytul: tytulFinalny,
      nastepny: nastepny ?? null,
      breakdown: {
        pktA,
        pktB,
        trofea,
        kasa: kk,
        wartoscKadry,
        wartoscKadryMoj,
        wartoscKadryMojAtHandover,
        spadki,
        spadkiKadencja,
        pierwszySpadekSezon,
        squadSizeAtHandover: input.kadra.length,
        handoverSeason: input.historia.at(-1)?.sezon ?? SEZONY_GRY,
        squadSizeEnd: k.length,
      },
    },
    secondChance,
    transferRumour: rollTransferRumour(k),
  };
};

/**
 * The ending a relegated tenure gets: no seasons, because the game has no
 * model of the division below and pretending the club still plays in the top
 * flight is the lie this change removes.
 *
 * Keeps what section 12 forbids economising on - the ceiling reveal and the
 * "one you turned down" line - and drops only the results. Legacy is computed
 * from a shorter history, which is the intent: relegation hurts by taking the
 * future away.
 *
 * Takes no Rng: nothing here is drawn.
 */
export const runFinale = (input: EpilogueInput): EpilogueResult =>
  finishEpilogue(input, {
    squad: [...input.kadra],
    cash: input.kasa,
    seasons: [],
    pages: [],
    membership: input.membership,
  });
