// Fails when a text file contains an emoji anywhere, or an em dash (U+2014)
// in the code layer.
//
// Usage: node scripts/check-text.mjs [file ...]
// Without arguments it scans every file Git would commit (tracked and
// untracked, not ignored). The same rules are applied to commit messages by
// scripts/git-hooks.mjs through `findTextProblems`.
//
// Scope of the em dash rule: the linter already bans it in player-facing strings
// under src/** (oxlint.config.ts), but AST selectors cannot see comments, CSS or Markdown.
// This check covers every line of src/ and tests/, the code layer.
// docs/ and scripts/ stay outside it on purpose: the em dash is the house
// style there, and scripts/ writes reports into docs/.
//
// Characters are built with String.fromCodePoint so this file passes its own
// check and no editor can silently turn an escape into the literal character.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const chars = (...codes) => codes.map((code) => String.fromCodePoint(code)).join("");

const EM_DASH = new RegExp(chars(0x2014), "u");

// Text symbols that Unicode also lists as pictographic: (c), (R), TM and the
// plain arrows U+2194-U+2199 used in documentation tables. Everything else
// pictographic counts as an emoji.
const TEXT_SYMBOLS = chars(0xa9, 0xae, 0x2122, 0x2194, 0x2195, 0x2196, 0x2197, 0x2198, 0x2199);
const EMOJI = new RegExp(
  `\\p{Emoji_Presentation}|(?![${TEXT_SYMBOLS}])\\p{Extended_Pictographic}`,
  "u"
);

const EM_DASH_SCOPE = /^(?:src|tests)\//;

/** Whether the em dash rule applies to a repository-relative path. */
export const emDashApplies = (normalizedPath) => EM_DASH_SCOPE.test(normalizedPath);
const SKIPPED_FILES = new Set(["pnpm-lock.yaml"]);
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".zip",
  ".gz",
  ".pdf",
]);

const EM_DASH_MESSAGE = "em dash (U+2014); use an en dash (U+2013) or a middle dot (U+00B7)";

/**
 * Problems in one text. `emDash` switches the em dash rule on, because it
 * applies to some files and to every commit message, but not to docs/.
 */
export const findTextProblems = (text, { label, emDash }) =>
  text
    .split("\n")
    .flatMap((line, index) => [
      ...(emDash && EM_DASH.test(line) ? [`${label}:${index + 1}: ${EM_DASH_MESSAGE}`] : []),
      ...(EMOJI.test(line) ? [`${label}:${index + 1}: emoji`] : []),
    ]);

const listFiles = (args) => {
  if (args.length > 0) return args;
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
};

export const findFileProblems = (file) => {
  const normalized = file.replaceAll("\\", "/");
  if (
    SKIPPED_FILES.has(normalized) ||
    BINARY_EXTENSIONS.has(path.extname(normalized).toLowerCase()) ||
    !existsSync(file)
  ) {
    return [];
  }
  return findTextProblems(readFileSync(file, "utf8"), {
    label: normalized,
    emDash: emDashApplies(normalized),
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = listFiles(process.argv.slice(2)).flatMap(findFileProblems);
  if (problems.length > 0) {
    process.stderr.write(`Forbidden characters found:\n${problems.join("\n")}\n`);
    process.exit(1);
  }
}
