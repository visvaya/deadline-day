import { describe, expect, test } from "vitest";

import {
  extractLeagueSection,
  parseLeagueSection,
  verifySeasonAgainstTable,
} from "../../scripts/rsssf-parse-core";

const section = (...lines: readonly string[]): string => lines.join("\n");

describe("RSSSF league section parsing", () => {
  test("reads a club name that fills the column and leaves one space", () => {
    // The bug this whole plan exists for. "Podbeskidzie" is twelve characters
    // and eats the padding exactly; a parser requiring two spaces drops every
    // home match it ever played - all 34 of them, across 2015/16 and 2020/21.
    const parsed = parseLeagueSection(
      section(
        "Round 1",
        "[Jul 17]",
        "Podbeskidzie 2-2 Cracovia     ",
        "Legia        1-0 Pogoń        "
      )
    );

    expect(parsed.matches).toHaveLength(2);
    expect(parsed.matches[0]).toEqual({
      round: 1,
      home: "Podbeskidzie",
      away: "Cracovia",
      homeGoals: 2,
      awayGoals: 2,
    });
  });

  test("reads an awarded walkover as its awarded score", () => {
    const parsed = parseLeagueSection(
      section(
        "Round 24",
        "Piast        awd Górnik Z     [awarded 0-3; abandoned at 1-0 in 84' due to crowd trouble]"
      )
    );

    expect(parsed.matches[0]).toMatchObject({
      home: "Piast",
      away: "Górnik Z",
      homeGoals: 0,
      awayGoals: 3,
    });
  });

  test("does not let a footnote spilling onto the next line corrupt that match", () => {
    // Real 2022/23 shape: the Piast-Lechia footnote breaks after "due" and its
    // tail lands glued to the Pogoń-Radomiak line, which is a different match.
    // The one-off parser had a hard-coded patch for the literal string
    // "to crowd trouble"; this must be handled as a continuation state.
    const parsed = parseLeagueSection(
      section(
        "Round 30",
        "Piast        awd Lechia       [awarded 3-0; abandoned at 0-1 in 80' due",
        "Pogoń        4-0 Radomiak      to crowd trouble]",
        "Raków        1-1 Zagłębie L   "
      )
    );

    expect(parsed.matches).toHaveLength(3);
    expect(parsed.matches[0]).toMatchObject({
      home: "Piast",
      away: "Lechia",
      homeGoals: 3,
      awayGoals: 0,
    });
    expect(parsed.matches[1]).toMatchObject({ home: "Pogoń", away: "Radomiak", homeGoals: 4 });
  });

  test("counts a resumed match once, not twice", () => {
    // Real 2023/24 shape: the `abd` line is not a result, the `[remaining 75']`
    // line is. Counting both would give 307 matches in a 306-match season.
    const parsed = parseLeagueSection(
      section(
        "Round 19",
        "Piast        abd Puszcza      [abandoned at 0-0 in 15' due to unplayable pitch]",
        "Piast        1-0 Puszcza      [remaining 75']"
      )
    );

    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0]).toMatchObject({ home: "Piast", homeGoals: 1, awayGoals: 0 });
  });

  test("keeps the championship and relegation rounds inside the season", () => {
    // Rounds 31-37 in 2015/16-2019/20 are Ekstraklasa, not a separate cup.
    const parsed = parseLeagueSection(
      section(
        "Round 30",
        "Legia        1-0 Pogoń        ",
        "Round 31",
        "Legia        2-2 Lech         "
      )
    );

    expect(parsed.matches.map((match) => match.round)).toEqual([30, 31]);
  });

  test("throws on a line it cannot classify, naming the round", () => {
    // Silent skipping is what produced a false claim about the source being
    // incomplete. A parser that cannot read a row must say so.
    const run = () => parseLeagueSection(section("Round 3", "Legia ~~ Pogoń"));

    expect(run).toThrow(/round 3/i);
    expect(run).toThrow(/Legia ~~ Pogoń/);
  });

  test("reads the table the file itself publishes", () => {
    const parsed = parseLeagueSection(
      section(
        "Round 1",
        "Legia        2-1 Pogoń        ",
        "Final Table:",
        " 1.Legia                    30  20  5  5  60-30  65",
        " 2.Pogoń                    30  18  6  6  55-33  60"
      )
    );

    expect(parsed.table).toEqual([
      { club: "Legia", played: 30, goalsFor: 60, goalsAgainst: 30, points: 65 },
      { club: "Pogoń", played: 30, goalsFor: 55, goalsAgainst: 33, points: 60 },
    ]);
  });

  test("keeps only the tables that cover the whole season", () => {
    // Split seasons publish a 30-round table, a halfway table AND the two
    // 37-match playoff tables, each of the latter twice. The check has to run
    // against the deepest tables, merged, with every club exactly once.
    const parsed = parseLeagueSection(
      section(
        "Halfway Table:",
        " 1.Legia                    15  10  3  2  30-15  33",
        "Final Table:",
        " 1.Legia                    37  21 10  6  70-32  43  [-30]  Champions",
        " 8.Ruch                     37  11  8 18  40-60  21  [-19]  [-1]",
        "Final Table:",
        " 1.Legia                    37  21 10  6  70-32  43  [-30]  Champions",
        " 9.Wisła K                  37  12 15 10  61-45  32  [-18]  [-1]"
      )
    );

    expect(parsed.table.map((row) => row.club)).toEqual(["Legia", "Ruch", "Wisła K"]);
    expect(parsed.table.every((row) => row.played === 37)).toBe(true);
  });

  test("throws when the same club is published twice with different figures", () => {
    const run = () =>
      parseLeagueSection(
        section(
          "Final Table:",
          " 1.Legia                    37  21 10  6  70-32  43",
          "Final Table:",
          " 1.Legia                    37  21 10  6  71-32  43"
        )
      );

    expect(run).toThrow(/Legia/);
  });

  test("extracts the league section by its anchor, not by a heading name", () => {
    // ISO-8859-2 bytes, numeric entities and navigation links all at once -
    // the three things that stand between the file and a readable line.
    const html = Buffer.from(
      '<h4><a name="ekstra">Ekstraklasa</a></h4>\n<pre>\n' +
        '<b><a name="play">Playoff Stage</a></b>\n' +
        "Round 1\nRak\xf3w        1-0 Pogo&#324;        \n" +
        '</pre>\n<h4><a name="iliga">I Liga</a></h4>\n<pre>\nRound 1\nGKS 2-0 Odra\n</pre>\n',
      "latin1"
    );

    const parsed = parseLeagueSection(extractLeagueSection(html));

    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0]).toMatchObject({ home: "Raków", away: "Pogoń" });
  });
});

describe("season agreement with its own final table", () => {
  test("rejects a season whose matches disagree with its own table", () => {
    // The exact shape of the real bug: the table says Podbeskidzie played two,
    // the list holds one. League goals still look plausible, which is why nobody
    // noticed for weeks.
    const run = () =>
      verifySeasonAgainstTable(
        parseLeagueSection(
          section(
            "Round 1",
            "Legia        2-1 Podbeskidzie ",
            "Final Table:",
            " 1.Legia                     2   1  0  0   2-1   3",
            " 2.Podbeskidzie              2   0  0  2   1-4   0"
          )
        )
      );

    expect(run).toThrow(/Podbeskidzie/);
    expect(run).toThrow(/1.*2|2.*1/);
  });

  test("accepts a season whose matches reproduce its table", () => {
    expect(() =>
      verifySeasonAgainstTable(
        parseLeagueSection(
          section(
            "Round 1",
            "Legia        2-1 Podbeskidzie ",
            "Final Table:",
            " 1.Legia                     1   1  0  0   2-1   3",
            " 2.Podbeskidzie              1   0  0  1   1-2   0"
          )
        )
      )
    ).not.toThrow();
  });

  test("resolves the short match-list name against the full table name", () => {
    // Match lines print "Zagłębie L", the table prints "Zagłębie Lubin". The
    // check is worthless unless the two are the same club, and guessing by
    // substring would happily fold Górnik Zabrze into Górnik Łęczna.
    expect(() =>
      verifySeasonAgainstTable(
        parseLeagueSection(
          section(
            "Round 1",
            "Zagłębie L   1-0 Górnik Z     ",
            "Górnik Ł     0-2 Zagłębie L   ",
            "Górnik Z     1-1 Górnik Ł     ",
            "Final Table:",
            " 1.Zagłębie Lubin            2   2  0  0   3-0   6",
            " 2.Górnik Zabrze             2   0  1  1   1-2   1",
            " 3.Górnik Łęczna             2   0  1  1   1-3   1"
          )
        )
      )
    ).not.toThrow();
  });

  test("throws when a match-list name matches no club in the table", () => {
    const run = () =>
      verifySeasonAgainstTable(
        parseLeagueSection(
          section(
            "Round 1",
            "Arka         1-0 Legia        ",
            "Final Table:",
            " 1.Legia Warszawa            1   0  0  1   0-1   0"
          )
        )
      );

    expect(run).toThrow(/Arka/);
  });

  test("throws when a short name could be either of two clubs", () => {
    const run = () =>
      verifySeasonAgainstTable(
        parseLeagueSection(
          section(
            "Round 1",
            "Górnik       1-0 Legia        ",
            "Final Table:",
            " 1.Górnik Zabrze             1   1  0  0   1-0   3",
            " 2.Górnik Łęczna             1   0  0  1   0-1   0",
            " 3.Legia Warszawa            1   0  0  1   0-1   0"
          )
        )
      );

    expect(run).toThrow(/Górnik/);
  });
});
