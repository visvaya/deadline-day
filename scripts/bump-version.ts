import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { TECHNICAL_CHANGES_NOTE } from "../src/data/changelog";
import { expectedVersion, needsWrittenNotes, toChangelogVersion } from "./release-version";

/**
 * `pnpm version:bump "<pull request title>" [--base <ref>]` (default base: origin/main).
 *
 * Sets the version of a pull request about to be opened, by the rules CI checks
 * (scripts/check-version.ts): the next version after the base's when the change
 * touches the game, the base's otherwise. Writes it to package.json and to
 * CURRENT_VERSION, and starts a changelog entry for it: with no notes for a
 * feat or a fix, which a test refuses until the player-facing notes are
 * written; with the stock TECHNICAL_CHANGES_NOTE for anything else.
 * Uncommitted changes count.
 */
const PACKAGE_FILE = "package.json";
const CHANGELOG_FILE = "src/data/changelog.ts";
const CHANGELOG_START = "export const CHANGELOG: readonly ChangelogEntry[] = [\n";

const git = (...args: string[]): string => execFileSync("git", args, { encoding: "utf8" });

const main = (): void => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { base: { type: "string", default: "origin/main" } },
  });
  const title = positionals[0];
  if (title === undefined) throw new Error('usage: pnpm version:bump "<pull request title>"');

  const fork = git("merge-base", values.base, "HEAD").trim();
  const basePackage = JSON.parse(git("show", `${fork}:${PACKAGE_FILE}`)) as { version: string };
  const headPackage = JSON.parse(readFileSync(PACKAGE_FILE, "utf8")) as { version: string };
  const changedPaths = git("diff", "--name-only", fork).split("\n").filter(Boolean);
  const version = expectedVersion({ title, changedPaths, basePackage, headPackage });
  writeFileSync(PACKAGE_FILE, `${JSON.stringify({ ...headPackage, version }, null, 2)}\n`);

  const changelogVersion = toChangelogVersion(version);
  const baseChangelogVersion = toChangelogVersion(basePackage.version);
  const text = readFileSync(CHANGELOG_FILE, "utf8").replace(
    /export const CURRENT_VERSION = "[^"]*";/u,
    `export const CURRENT_VERSION = "${changelogVersion}";`
  );
  const top = /version: "([^"]+)",/u.exec(text.slice(text.indexOf(CHANGELOG_START)))?.[1];
  const date = new Date().toISOString().slice(0, 10);
  const notes = needsWrittenNotes(title) ? "" : JSON.stringify(TECHNICAL_CHANGES_NOTE);
  const entry = `  {\n    version: "${changelogVersion}",\n    date: "${date}",\n    notes: [${notes}],\n  },\n`;
  // The newest entry is this branch's own when it is not the base's: bumped again for another title
  // (fix to feat), it takes the new number and keeps its notes.
  const ownEntry = top !== undefined && top !== baseChangelogVersion;
  const changelog =
    version === basePackage.version || top === changelogVersion
      ? text
      : ownEntry
        ? text.replace(`version: "${top}",`, `version: "${changelogVersion}",`)
        : text.replace(CHANGELOG_START, `${CHANGELOG_START}${entry}`);
  writeFileSync(CHANGELOG_FILE, changelog);

  const reminder =
    version === basePackage.version || ownEntry || !needsWrittenNotes(title)
      ? ""
      : `; write the player-facing notes of ${changelogVersion} in ${CHANGELOG_FILE}`;
  process.stdout.write(
    `version:bump: ${basePackage.version} on ${values.base}, ${version} here${reminder}\n`
  );
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
