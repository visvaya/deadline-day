import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { allPathHeaders } from "../../scripts/static-headers.ts";

describe("allPathHeaders", () => {
  test("reads the headers every response of the deployed game carries", () => {
    const headers = allPathHeaders(readFileSync("public/_headers", "utf8"));
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers).not.toHaveProperty("Cache-Control");
  });

  test("keeps only the /* rule and skips comments", () => {
    const text = "# c\n/assets/*\n  A: 1\n/*\n  # c\n  B: x: y\n/\n  C: 3\n";
    expect(allPathHeaders(text)).toEqual({ B: "x: y" });
  });

  test("rejects a header line without a colon", () => {
    expect(() => allPathHeaders("/*\n  broken\n")).toThrow(/no colon/);
  });
});
