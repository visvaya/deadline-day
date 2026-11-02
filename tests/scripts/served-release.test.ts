import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  compareVersions,
  comparisonWithServed,
  contentIdOf,
  precacheOfWorker,
} from "../../scripts/served-release.mjs";
import { precacheOf, renderServiceWorker } from "../../scripts/write-service-worker.mjs";

const files = [
  { path: "index.html", sha256: "a" },
  { path: "assets/index-1.js", sha256: "b" },
  { path: "sw.js", sha256: "c" },
];

describe("contentIdOf", () => {
  test("does not depend on release.json or on the order of the files", () => {
    const id = contentIdOf(files, "host");
    expect(contentIdOf([...files].reverse(), "host")).toBe(id);
    expect(contentIdOf([...files, { path: "release.json", sha256: "commit" }], "host")).toBe(id);
  });

  test("changes with any file or with the host's configuration", () => {
    const id = contentIdOf(files, "host");
    expect(contentIdOf([...files, { path: "favicon.png", sha256: "d" }], "host")).not.toBe(id);
    expect(contentIdOf(files, "other host")).not.toBe(id);
  });
});

describe("comparisonWithServed", () => {
  const local = { version: "0.35.3", contentId: "new" };
  const served = (version: string, contentId: string) => JSON.stringify({ version, contentId });

  test("the same content is not published again", () => {
    expect(comparisonWithServed({ ...local, contentId: "old" }, served("0.35.2", "old"))).toEqual({
      same: true,
      problems: [],
    });
  });

  test("other content needs a version above the served one", () => {
    expect(comparisonWithServed(local, served("0.35.2", "old"))).toEqual({
      same: false,
      problems: [],
    });
    expect(comparisonWithServed(local, served("0.35.3", "old")).problems).toEqual([
      expect.stringContaining("not above the served 0.35.3"),
    ]);
    expect(comparisonWithServed(local, served("0.36.0", "old")).problems).toHaveLength(1);
  });

  test("nothing served, or something else, puts no limit", () => {
    for (const text of ["", "<html>not found</html>", "{}"]) {
      expect(comparisonWithServed(local, text)).toEqual({ same: false, problems: [] });
    }
  });
});

test("compareVersions orders by number, not by text", () => {
  expect(compareVersions("0.35.10", "0.35.9")).toBe(1);
  expect(compareVersions("0.36.0", "0.35.12")).toBe(1);
  expect(compareVersions("0.35.1", "0.35.1")).toBe(0);
  expect(() => compareVersions("0.35", "0.35.1")).toThrow();
});

test("precacheOfWorker reads the list the build writes into the worker", () => {
  const precache = precacheOf([
    { path: "index.html", sha256: "a" },
    { path: "assets/index-1.js", sha256: "b" },
  ]);
  const worker = renderServiceWorker(
    readFileSync("scripts/service-worker-template.js", "utf8"),
    precache
  );
  expect(precacheOfWorker(worker)).toEqual(precache);
  expect(() => precacheOfWorker("self.addEventListener('fetch', () => {});")).toThrow(/no release/);
});
