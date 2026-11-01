import { describe, expect, test } from "vitest";

import { pluralFormPl, pluralPl, POINT_FORMS, YEAR_FORMS } from "../../src/logic/format";

describe("pluralPl", () => {
  // The "few" form covers 2-4 in the last digit, except the teens: "12 lat",
  // but "22 lata". A bare `${n} lat` was wrong for every 2-4 ending.
  test.each([
    [1, "1 rok"],
    [2, "2 lata"],
    [4, "4 lata"],
    [5, "5 lat"],
    [12, "12 lat"],
    [14, "14 lat"],
    [21, "21 lat"],
    [22, "22 lata"],
    [24, "24 lata"],
    [25, "25 lat"],
    [34, "34 lata"],
    [112, "112 lat"],
  ])("age %i reads as %s", (age, expected) => {
    expect(pluralPl(age, YEAR_FORMS)).toBe(expected);
  });

  test.each([
    [0, "0 punktów"],
    [1, "1 punkt"],
    [3, "3 punkty"],
    [13, "13 punktów"],
    [52, "52 punkty"],
    [624, "624 punkty"],
    [700, "700 punktów"],
  ])("%i points read as %s", (points, expected) => {
    expect(pluralPl(points, POINT_FORMS)).toBe(expected);
  });

  test("pluralFormPl returns the same noun without the number", () => {
    for (const count of [1, 2, 5, 12, 22, 25]) {
      expect(`${count} ${pluralFormPl(count, YEAR_FORMS)}`).toBe(pluralPl(count, YEAR_FORMS));
    }
  });
});
