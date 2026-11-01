import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { parseTeamRatings } from "../../scripts/sync-ratings-core";

const fixture = (): string =>
  readFileSync(
    join(process.cwd(), "tests", "scripts", "fixtures", "ekstraklasa-weights-table.html"),
    "utf8"
  );

describe("parseTeamRatings", () => {
  test("reads rank, both names and all three numbers from every row", () => {
    expect(parseTeamRatings(fixture())).toEqual([
      {
        rank: 1,
        krotko: "Lech",
        nazwa: "Lech Poznań",
        strength: 1.44,
        attack: 1.24,
        defence: 1.16,
      },
      {
        rank: 2,
        krotko: "Widzew",
        nazwa: "Widzew Łódź",
        strength: 1.2,
        attack: 1.07,
        defence: 1.13,
      },
      { rank: 3, krotko: "Raków", nazwa: "Raków", strength: 1.19, attack: 1.16, defence: 1.03 },
    ]);
  });

  test("throws when the weights table is missing instead of returning an empty list", () => {
    expect(() => parseTeamRatings("<html><body>nic tu nie ma</body></html>")).toThrow(
      /weights-table/
    );
  });

  test("throws when a row is missing one of the three numbers", () => {
    const broken = fixture().replace('<td class="number detail">1.16</td>', "");
    expect(() => parseTeamRatings(broken)).toThrow(/row/i);
  });
});
