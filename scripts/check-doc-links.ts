/**
 * Guards the documentation: every relative Markdown link and every backticked
 * path that starts with a directory of the repository must still exist. The
 * rules live in doc-links-core.ts.
 * Usage: pnpm check:doc-links (from the repository root; reads the Markdown files git tracks)
 *
 * A path exists when git tracks it (a file, or a directory that holds tracked
 * files) or ignores it (output of a build or a test run, which a fresh checkout
 * does not have yet). Files on disk that git neither tracks nor ignores do not
 * count, so the answer is the same locally and in CI.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

import { findDocLinkProblems } from "./doc-links-core";

/**
 * Paths a document names on purpose although they are not in git. The list
 * only shrinks: a new entry needs a reason as strong as these.
 */
const KNOWN_ABSENT: ReadonlySet<string> = new Set(
  // Measurement dumps of the spec 4 control run: too large for git, so the
  // reports pin each one by row count and sha256 instead.
  [
    "control-seasons.csv",
    "control-raw.csv",
    "active-signings.csv",
    "active-original-13-raw.csv",
    "active-original-13-seasons.csv",
  ].map((name) => `scripts/data/spec4-control-2026-09-25/${name}`)
);

const trackedFiles = (...patterns: string[]): string[] =>
  execFileSync("git", ["ls-files", "-z", "--", ...patterns], { encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "");

/** The directories above a file, nearest first. */
const directoriesOf = (file: string): string[] => {
  const parent = posix.dirname(file);
  return parent === "." ? [] : [parent, ...directoriesOf(parent)];
};

/**
 * Exit status 0 of `git check-ignore` means the path is ignored. A pattern with
 * a trailing slash matches only a directory, and git can tell a missing path is
 * one only from that slash, so both forms are asked.
 */
const ignoredAsGiven = (path: string): boolean =>
  spawnSync("git", ["check-ignore", "-q", "--no-index", "--", path]).status === 0;
const isIgnored = (path: string): boolean => ignoredAsGiven(path) || ignoredAsGiven(`${path}/`);

const main = (): number => {
  const tracked = trackedFiles();
  const known = new Set(tracked.flatMap((file) => [file, ...directoriesOf(file)]));
  const roots = [
    ...new Set(
      tracked.filter((path) => path.includes("/")).map((path) => path.split("/")[0] ?? "")
    ),
  ];
  const exists = (path: string): boolean =>
    known.has(path) || KNOWN_ABSENT.has(path) || isIgnored(path);
  const docs = trackedFiles("*.md").map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const problems = findDocLinkProblems(docs, { exists, roots });
  for (const problem of problems) console.error(`check:doc-links: ${problem}`);
  if (problems.length > 0) return 1;
  console.log(`check:doc-links: ${docs.length} documents, no dead links or paths`);
  return 0;
};

process.exitCode = main();
