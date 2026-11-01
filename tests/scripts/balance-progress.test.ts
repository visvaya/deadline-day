import { describe, expect, test } from "vitest";

import { formatDurationPl, formatProgress } from "../../scripts/balance-progress";

describe("formatDurationPl", () => {
  test("under a minute prints seconds only", () => {
    expect(formatDurationPl(4_100)).toBe("4 s");
  });

  test("under an hour prints minutes and seconds", () => {
    expect(formatDurationPl(4 * 60_000 + 10_000)).toBe("4 min 10 s");
  });

  test("an hour or more prints hours, minutes and seconds", () => {
    expect(formatDurationPl(2 * 3_600_000 + 5 * 60_000 + 1_000)).toBe("2 h 5 min 1 s");
  });

  test("zero prints as 0 s, not an empty string", () => {
    expect(formatDurationPl(0)).toBe("0 s");
  });
});

describe("formatProgress", () => {
  test("first cell of a run", () => {
    // average so far = 12,4 s/cell (only one sample) -> 251 cells left ->
    // 251 * 12,4 s = 3 112,4 s = 51 min 52 s.
    const line = formatProgress(1, 252, "legia-warszawa", "mixed", 12_400, 12_400);
    expect(line).toBe(
      "[1/252] legia-warszawa · mixed · 12,4 s · minęło 12 s · zostało ~51 min 52 s"
    );
  });

  test("a middle cell derives ETA from the running average, not the last cell alone", () => {
    // 37 cells done in 4 min 10 s (250 000 ms) elapsed -> average
    // 250 000 / 37 = 6 756,7568 ms/cell -> 215 cells left ->
    // 215 * 6 756,7568 ms = 1 452 702,7 ms = 1 453 s = 24 min 13 s,
    // independent of this cell's own 12,4 s.
    const elapsedMs = 4 * 60_000 + 10_000;
    const line = formatProgress(37, 252, "legia-warszawa", "mixed", 12_400, elapsedMs);
    expect(line).toBe(
      "[37/252] legia-warszawa · mixed · 12,4 s · minęło 4 min 10 s · zostało ~24 min 13 s"
    );
  });

  test("the last cell always reports zero ETA", () => {
    const line = formatProgress(252, 252, "wieczysta-krakow", "alwaysPass", 8_000, 3_600_000);
    expect(line).toBe(
      "[252/252] wieczysta-krakow · alwaysPass · 8,0 s · minęło 1 h 0 min 0 s · zostało ~0 s"
    );
  });

  test("minutes and seconds formatting rounds to the nearest second", () => {
    const line = formatProgress(2, 4, "wisla-krakow", "buyOnly", 599, 1_499);
    expect(line).toBe("[2/4] wisla-krakow · buyOnly · 0,6 s · minęło 1 s · zostało ~1 s");
  });
});
