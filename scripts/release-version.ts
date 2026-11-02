import type { ChangelogEntry } from "../src/data/changelog";

/**
 * The player-facing version lives in `CURRENT_VERSION` (src/data/changelog.ts)
 * as `major.minor`, or `major.minor.patch` for a fix release. Git tags and
 * package.json need semver, so this module is the single mapping between the
 * two, and holds the rules for how a pull request moves the number.
 *
 * The minor always has two digits. Until 2026-09-27 the changelog also wrote
 * `0.1`, `0.2` and `0.3` for 0.10, 0.20 and 0.30, which made `0.3` sort before
 * `0.29`; a one-digit minor is rejected so that ambiguity cannot return. A
 * patch of 0 is never written (`0.35`, not `0.35.0`), so each version has one
 * spelling.
 */
const CHANGELOG_VERSION = /^(\d+)\.(\d{2})(?:\.([1-9]\d*))?$/u;
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const PR_TITLE = /^([a-z]+)(\([^)]+\))?(!)?: /u;

export const toReleaseVersion = (changelogVersion: string): string => {
  const match = CHANGELOG_VERSION.exec(changelogVersion);
  if (!match) {
    throw new Error(
      `not a major.minor[.patch] changelog version with a two-digit minor: ${changelogVersion}`
    );
  }
  const [, major = "", minor = "", patch = "0"] = match;
  return `${Number(major)}.${Number(minor)}.${Number(patch)}`;
};

const parseRelease = (version: string): [number, number, number] => {
  const match = RELEASE_VERSION.exec(version);
  if (!match) throw new Error(`not a major.minor.patch version: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

export const toChangelogVersion = (releaseVersion: string): string => {
  const [major, minor, patch] = parseRelease(releaseVersion);
  const base = `${major}.${String(minor).padStart(2, "0")}`;
  return patch === 0 ? base : `${base}.${patch}`;
};

type Bump = "major" | "minor" | "patch";

/** The step a squashed pull request's title asks for: `!` a breaking change, `feat` a new capability. */
export const bumpOfTitle = (title: string): Bump => {
  const match = PR_TITLE.exec(title);
  if (!match) throw new Error(`the title is not a Conventional Commit: "${title}"`);
  if (match[3] === "!") return "major";
  return match[1] === "feat" ? "minor" : "patch";
};

/**
 * Whether a change needs notes written for the player: a new capability, a fix
 * or a breaking change does; anything else (a dependency update, a refactor)
 * gets the stock note of a technical release.
 */
export const needsWrittenNotes = (title: string): boolean => {
  const match = PR_TITLE.exec(title);
  if (!match) throw new Error(`the title is not a Conventional Commit: "${title}"`);
  return match[3] === "!" || match[1] === "feat" || match[1] === "fix";
};

/** Before 1.0 the first number stays at 0: a breaking change moves the middle one. */
export const nextReleaseVersion = (version: string, bump: Bump): string => {
  const [major, minor, patch] = parseRelease(version);
  if (bump === "major" && major > 0) return `${major + 1}.0.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  return `${major}.${minor + 1}.0`;
};

/**
 * The files the deployed game is built from; tests, notes, CI and the balance
 * tooling do not ship. scripts/static-headers.ts does not either: vite.config.ts
 * reads it for `vite preview` only. Nor does .nvmrc: CI builds with the newest
 * patch of its line either way.
 */
const SHIPPED_PREFIXES = ["src/", "public/"];
const SHIPPED_FILES = new Set([
  "index.html",
  "vite.config.ts",
  "tsconfig.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "deploy/wrangler.jsonc",
  "scripts/write-service-worker.mjs",
  "scripts/service-worker-template.js",
  "scripts/served-release.mjs",
]);

type PackageJson = { version: string; scripts?: Record<string, string> } & Record<string, unknown>;

/** package.json as far as the build reads it: everything but the version and the scripts other than `build`. */
const buildInputs = (pkg: PackageJson): string =>
  JSON.stringify({ ...pkg, version: undefined, scripts: pkg.scripts?.["build"] });

/** Whether these changed files change the game. */
export const shipsTheGame = (
  changedPaths: readonly string[],
  basePackage: PackageJson,
  headPackage: PackageJson
): boolean =>
  changedPaths.some((path) =>
    path === "package.json"
      ? buildInputs(basePackage) !== buildInputs(headPackage)
      : SHIPPED_FILES.has(path) || SHIPPED_PREFIXES.some((prefix) => path.startsWith(prefix))
  );

/** The version a pull request must carry: the next one when it changes the game, the base one otherwise. */
export const expectedVersion = (pr: {
  title: string;
  changedPaths: readonly string[];
  basePackage: PackageJson;
  headPackage: PackageJson;
}): string =>
  shipsTheGame(pr.changedPaths, pr.basePackage, pr.headPackage)
    ? nextReleaseVersion(pr.basePackage.version, bumpOfTitle(pr.title))
    : pr.basePackage.version;

/** What is wrong with a pull request's version; empty when it is right. */
export const versionProblems = (pr: {
  title: string;
  changedPaths: readonly string[];
  basePackage: PackageJson;
  headPackage: PackageJson;
}): string[] => {
  const expected = expectedVersion(pr);
  if (pr.headPackage.version === expected) return [];
  const why = shipsTheGame(pr.changedPaths, pr.basePackage, pr.headPackage)
    ? "the pull request changes the game"
    : "the pull request does not change the game";
  return [
    `${why}, so package.json must say ${expected}, not ${pr.headPackage.version}: run \`pnpm version:bump "<title>"\``,
  ];
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
