import type { ChangelogEntry } from "../src/data/changelog";

/**
 * The player-facing version lives in `CURRENT_VERSION` (src/data/changelog.ts)
 * as `major.minor`. Git tags and package.json need semver, so this module is
 * the single mapping between the two.
 *
 * The minor always has two digits. Until 2026-09-27 the changelog also wrote
 * `0.1`, `0.2` and `0.3` for 0.10, 0.20 and 0.30, which made `0.3` sort before
 * `0.29`; a one-digit minor is rejected so that ambiguity cannot return.
 */
const CHANGELOG_VERSION = /^(\d+)\.(\d{2})$/u;

export const toReleaseVersion = (changelogVersion: string): string => {
  const match = CHANGELOG_VERSION.exec(changelogVersion);
  if (!match) {
    throw new Error(
      `not a major.minor changelog version with a two-digit minor: ${changelogVersion}`
    );
  }
  const [, major = "", minor = ""] = match;
  return `${Number(major)}.${Number(minor)}.0`;
};

/** Every source a release tag disagrees with; empty when the tag is sound. */
export const releaseTagProblems = (
  tag: string,
  sources: { packageVersion: string; currentVersion: string }
): string[] => {
  const expectedFromChangelog = `v${toReleaseVersion(sources.currentVersion)}`;
  return [
    ...(tag === `v${sources.packageVersion}`
      ? []
      : [`tag ${tag} does not match package.json version ${sources.packageVersion}`]),
    ...(tag === expectedFromChangelog
      ? []
      : [
          `tag ${tag} does not match CURRENT_VERSION ${sources.currentVersion} (${expectedFromChangelog})`,
        ]),
  ];
};

/** Markdown body of a GitHub release, taken from the changelog entry. */
export const releaseNotes = (
  changelogVersion: string,
  changelog: readonly ChangelogEntry[]
): string => {
  const entry = changelog.find((candidate) => candidate.version === changelogVersion);
  if (!entry) throw new Error(`no changelog entry for version ${changelogVersion}`);
  return [
    `Wersja ${entry.version} · ${entry.date}`,
    "",
    ...entry.notes.map((note) => `- ${note}`),
    "",
  ].join("\n");
};
