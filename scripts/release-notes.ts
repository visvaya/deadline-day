import { readFileSync } from "node:fs";

import { CHANGELOG, CURRENT_VERSION } from "../src/data/changelog";
import { releaseNotes, releaseTagProblems } from "./release-version";

/**
 * `pnpm release:notes <tag>` - used by .github/workflows/release.yml.
 *
 * Refuses a tag that disagrees with package.json or with CURRENT_VERSION, and
 * otherwise prints the release notes for that version to stdout. Exit 1 on any
 * mismatch, so the workflow stops before a release exists.
 */
const main = (): void => {
  const tag = process.argv[2] ?? "";
  if (!tag) throw new Error("usage: pnpm release:notes <tag>");
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  const problems = releaseTagProblems(tag, {
    packageVersion: version,
    currentVersion: CURRENT_VERSION,
  });
  if (problems.length > 0) throw new Error(problems.join("\n"));
  process.stdout.write(releaseNotes(CURRENT_VERSION, CHANGELOG));
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
