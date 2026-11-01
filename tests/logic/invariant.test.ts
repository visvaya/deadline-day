import { describe, expect, it } from "vitest";
import { at, defined, mapAt, recordAt } from "../../src/logic/invariant.ts";

describe("at", () => {
  it("returns the element when the index exists", () => {
    expect(at(["a", "b", "c"], 1, "letter")).toBe("b");
  });

  it("throws a descriptive error when the index is missing", () => {
    expect(() => at(["a", "b"], 5, "letter")).toThrow(/letter/);
    expect(() => at(["a", "b"], 5, "letter")).toThrow(/index 5/);
  });
});

describe("mapAt", () => {
  it("returns the value when the key exists", () => {
    const map = new Map([["x", 1]]);
    expect(mapAt(map, "x", "entry")).toBe(1);
  });

  it("throws a descriptive error when the key is missing", () => {
    const map = new Map<string, number>();
    expect(() => mapAt(map, "missing", "entry")).toThrow(/entry/);
    expect(() => mapAt(map, "missing", "entry")).toThrow(/missing/);
  });
});

describe("defined", () => {
  it("returns a present value, including falsy ones", () => {
    expect(defined(0, "zero")).toBe(0);
    expect(defined("", "empty string")).toBe("");
    expect(defined(false, "false")).toBe(false);
  });

  it("throws a readable error for null and undefined", () => {
    expect(() => defined(null, "the club")).toThrow("invariant violated: the club is missing");
    expect(() => defined(undefined, "the card")).toThrow("invariant violated: the card is missing");
  });
});

describe("recordAt", () => {
  it("returns the value when the key exists", () => {
    expect(recordAt({ x: "1" }, "x", "column")).toBe("1");
  });

  it("returns a present empty string instead of treating it as missing", () => {
    expect(recordAt({ x: "" }, "x", "column")).toBe("");
  });

  it("throws a descriptive error when the key is missing", () => {
    const record: Record<string, string> = {};
    expect(() => recordAt(record, "absent", "column")).toThrow(/column/);
    expect(() => recordAt(record, "absent", "column")).toThrow(/absent/);
  });
});
