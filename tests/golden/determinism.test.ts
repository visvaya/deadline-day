import { expect, test } from "vitest";

import { playHeadless } from "./headless";
import { cycle } from "../../src/logic/simulate-policies";

const policy = cycle(["bierz", "pas", "targ"]);

const clubId = "wisla-plock";

test("the same seed produces the same game twice", () => {
  const first = playHeadless({ seed: 0x2222_2222, clubId, policy });
  const second = playHeadless({ seed: 0x2222_2222, clubId, policy });
  expect(second.state).toEqual(first.state);
  expect(second.akcje).toEqual(first.akcje);
});

test("different seeds produce different games", () => {
  const first = playHeadless({ seed: 0x3333_3333, clubId, policy });
  const second = playHeadless({ seed: 0x4444_4444, clubId, policy });
  expect(second.state).not.toEqual(first.state);
});
