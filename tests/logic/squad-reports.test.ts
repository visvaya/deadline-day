/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";

import { clubById } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import type { GameState, Player, ReportPeriod } from "../../src/data/types";
import { analystContextTier } from "../../src/logic/analyst-context";
import { createAnalystReport } from "../../src/logic/analyst-report";
import { createStaffAssessment } from "../../src/logic/staff-assessment";
import { selectAnalystProfile } from "../../src/logic/analyst-profile";
import { gameReducer, reportPeriod } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { clubRating } from "../../src/logic/league-ratings";
import { createRng } from "../../src/logic/rng";
import {
  createSquadFromFormation,
  baseSquadStrength,
  squadStrength,
  startingXi,
  substitutes,
} from "../../src/logic/squad";
import {
  createSquadReports,
  squadPlayingTime,
  squadReportContextOvr,
} from "../../src/logic/squad-reports";
import { FORM_ROTATION_SLOTS } from "../../src/data/balance";
import { testManager } from "./fixtures";

/**
 * Reports for a player who is already ours.
 *
 * Until now both generators were reachable only through rollOffer, so a squad
 * player had no report and no way to get the inputs for one. This module
 * supplies exactly those inputs; the generators are untouched and shared.
 */

const FORMATION = FORMACJE["4-3-3"];
const CLUB = clubById("gornik-zabrze");

const squad = (seed = 0x5011): Player[] =>
  createSquadFromFormation(createRng(seed), FORMATION, clubRating(CLUB));

const SUMMER: ReportPeriod = { season: 2, window: "summer" };
const WINTER: ReportPeriod = { season: 2, window: "winter" };

describe("createSquadReports", () => {
  test("the staff assessment comes from the coach, never a scout", () => {
    // A scout watches players elsewhere. This one trains here every day.
    for (const player of squad()) {
      expect(createSquadReports(player, SUMMER, 66, "starter", null).staffAssessment.source).toBe(
        "coach"
      );
    }
  });

  test("returns a complete analyst report for any player in the squad", () => {
    for (const player of squad()) {
      const { analystReport } = createSquadReports(player, SUMMER, 66, "starter", null);
      expect(analystReport.metrics).toHaveLength(2);
      expect(analystReport.metrics[0].metricId).not.toBe(analystReport.metrics[1].metricId);
      expect(analystReport.metrics.every((metric) => metric.percentile >= 0)).toBe(true);
    }
  });

  test("the club context is free of the market edge", () => {
    // The report reveals a player's edge. If the context that shapes it were
    // computed from squadStrength, the squad's own hidden edges would feed
    // back into the reports that disclose them.
    const kadra = squad();

    expect(squadReportContextOvr(kadra, FORMATION)).toBe(baseSquadStrength(kadra, null, FORMATION));
    expect(squadReportContextOvr(kadra, FORMATION)).not.toBe(squadStrength(kadra, null, FORMATION));
  });

  test("matches the report a SPRZEDAZ offer for the same player would carry", () => {
    // offers.ts builds the own-club branch as createAnalystReport(player,
    // period, analystContextTier(context.currentClubOvr)) with a coach
    // assessment, and currentClubOvr comes from baseSquadStrength. Reproduce
    // that composition here: the squad review must agree with it exactly, or
    // the same player would read differently on two screens in one window.
    const kadra = squad();
    const contextOvr = squadReportContextOvr(kadra, FORMATION);
    const player = kadra[0]!;

    const viaSquad = createSquadReports(player, SUMMER, contextOvr, "starter", null);
    const viaOfferPath = {
      staffAssessment: createStaffAssessment(player, SUMMER, "coach", null),
      analystReport: createAnalystReport(player, SUMMER, analystContextTier(contextOvr)),
    };

    expect(viaSquad).toEqual(viaOfferPath);
  });

  test("two calls for the same player and period are identical", () => {
    // Opening, closing and reopening a report must not reroll it.
    for (const player of squad()) {
      expect(createSquadReports(player, SUMMER, 66, "starter", null)).toEqual(
        createSquadReports(player, SUMMER, 66, "starter", null)
      );
    }
  });

  test("a different window changes the observation but not the player's identity", () => {
    let differed = 0;

    for (const player of squad()) {
      const summer = createSquadReports(player, SUMMER, 66, "starter", null);
      const winter = createSquadReports(player, WINTER, 66, "starter", null);
      const profile = selectAnalystProfile(player);

      // Same metric bundle and same edge - those belong to the player.
      expect(winter.analystReport.metrics.map((m) => m.metricId)).toEqual(
        summer.analystReport.metrics.map((m) => m.metricId)
      );
      expect(selectAnalystProfile(player).marketEdge).toBe(profile.marketEdge);

      if (
        JSON.stringify(winter.analystReport.metrics) !==
        JSON.stringify(summer.analystReport.metrics)
      ) {
        differed += 1;
      }
    }

    // A fresh observation each window, not a cached one.
    expect(differed).toBeGreaterThan(0);
  });

  test("building reports never touches the main RNG", () => {
    // The strongest form: run the reducer to a real in-progress career, note
    // rngState, build reports for the whole squad many times over, and check
    // the state has not moved a single step.
    const started = gameReducer(initialState(), {
      type: "START_CAREER",
      clubId: "gornik-zabrze",
      manager: testManager,
      seed: 0x1234_5678,
    });
    const before = started.rngState;
    const contextOvr = squadReportContextOvr(started.kadra, FORMACJE[started.formacja]);

    for (let i = 0; i < 5; i += 1) {
      for (const player of started.kadra) {
        createSquadReports(player, reportPeriod(started), contextOvr, "starter", null);
      }
    }

    expect(started.rngState).toBe(before);
  });
});

describe("reportPeriod", () => {
  test("maps lato and zima onto the report windows", () => {
    const state = (tura: "lato" | "zima"): Pick<GameState, "kroki" | "krok"> => ({
      kroki: [{ typ: "okno", sezon: 3, tura, ruchy: 4 }],
      krok: 0,
    });

    expect(reportPeriod(state("lato"))).toEqual({ season: 3, window: "summer" });
    expect(reportPeriod(state("zima"))).toEqual({ season: 3, window: "winter" });
  });

  test("the squad review really is inside an okno step", () => {
    // The assumption the whole feature rests on. Outside an okno step
    // reportPeriod falls back to season 0, and a squad review held there
    // would hand out reports from a season that never happened - silently,
    // because season 0 is a perfectly valid seed.
    const started = gameReducer(initialState(), {
      type: "START_CAREER",
      clubId: "gornik-zabrze",
      manager: testManager,
      seed: 0x1234_5678,
    });

    expect(started.faza).toBe("przeglad");
    expect(started.kroki[started.krok]!.typ).toBe("okno");
    expect(reportPeriod(started).season).toBeGreaterThan(0);
  });
});

describe("minutes follow the place in the squad", () => {
  test("the reserve keeper does not get the starter's season", () => {
    // The reported anomaly: two keepers, 52 and 72 OVR, both showing a nearly
    // complete season, because minutes came from age alone.
    const weak = { ...squad()[0]!, id: "keeper-weak", poz: "BR" as const, ovr: 52, wiek: 24 };
    const strong = { ...squad()[0]!, id: "keeper-strong", poz: "BR" as const, ovr: 72, wiek: 24 };
    const kadra = [...squad().filter((player) => player.poz !== "BR"), weak, strong];

    const playingTime = squadPlayingTime(kadra, FORMATION);
    expect(playingTime.get(strong.id)).toBe("starter");
    expect(playingTime.get(weak.id)).not.toBe("starter");

    const starterMinutes = createSquadReports(strong, SUMMER, 66, playingTime.get(strong.id)!, null)
      .analystReport.minutes;
    const reserveMinutes = createSquadReports(weak, SUMMER, 66, playingTime.get(weak.id)!, null)
      .analystReport.minutes;

    expect(reserveMinutes).toBeLessThan(starterMinutes);
  });

  test("the three tiers stay ordered for the same player", () => {
    // Same identity, same seed, same draw - only the share differs, so this
    // isolates the scaling from the draw.
    const player = squad()[0]!;
    const minutesFor = (time: Parameters<typeof createSquadReports>[3]): number =>
      createSquadReports(player, SUMMER, 66, time, null).analystReport.minutes;

    expect(minutesFor("starter")).toBeGreaterThan(minutesFor("rotation"));
    expect(minutesFor("rotation")).toBeGreaterThan(minutesFor("reserve"));
  });

  test("a player who barely plays is a player the analyst knows less about", () => {
    // The knock-on effect on sampleTier is the point, not a side effect.
    const player = { ...squad()[0]!, wiek: 26 };

    expect(createSquadReports(player, SUMMER, 66, "starter", null).analystReport.sampleTier).toBe(
      "large"
    );
    expect(createSquadReports(player, SUMMER, 66, "reserve", null).analystReport.sampleTier).toBe(
      "small"
    );
  });

  test("playing time uses the same tiers the engine uses for season form", () => {
    // Shared on purpose: the minutes a player reads and the minutes that move
    // his development have to mean the same thing.
    const kadra = squad();
    const playingTime = squadPlayingTime(kadra, FORMATION);
    const xi = new Set(startingXi(kadra, FORMATION).map((player) => player.id));
    const bench = substitutes(kadra, FORMATION);

    for (const player of kadra) {
      const expected = xi.has(player.id)
        ? "starter"
        : bench.findIndex((other) => other.id === player.id) < FORM_ROTATION_SLOTS
          ? "rotation"
          : "reserve";
      expect(playingTime.get(player.id), player.id).toBe(expected);
    }
  });

  test("status is a function of visible ovr, so it cannot leak the ceiling", () => {
    // startingXi sorts by ovr. Change only the ceiling and the tiers must not
    // move a single player.
    const kadra = squad();
    const raised = kadra.map((player) => ({ ...player, sufit: 99 }));

    expect([...squadPlayingTime(raised, FORMATION).entries()]).toEqual([
      ...squadPlayingTime(kadra, FORMATION).entries(),
    ]);
  });
});
