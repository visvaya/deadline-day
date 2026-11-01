// Enforces repository conventions that the linter cannot express:
// - file names in kebab-case under src/, tests/ and scripts/,
// - inline React styles in src/ only for data-driven CSS custom properties.
//
// Deliberately NOT here, because something else already owns it:
// - classes in src/: the restricted-syntax guard in oxlint.config.ts, which
//   reads the AST and so is not fooled by a comment mentioning a CSS class;
// - CSS colours only in :root: tests/ui/raw-colours.test.ts;
// - absolute local paths: scripts/git-hooks.mjs checks staged code files.
//
// docs/ is outside the file name rule: its `_`-prefixed measurement notes and
// the downloaded reference screenshots follow their own naming.
//
// Usage: node scripts/check-conventions.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Names fixed by a tool or a licence, not chosen by this repository.
const MANDATED_NAMES = new Set(["OFL.txt"]);
const KEBAB_CASE = /^\.?[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const NAMED_TREES = /^(?:src|tests|scripts)\//;
const INLINE_STYLE = /style=\{\{([^}]*)\}\}/g;

export const fileNameProblems = (file) => {
  if (!NAMED_TREES.test(file)) return [];
  const name = path.posix.basename(file);
  return MANDATED_NAMES.has(name) || KEBAB_CASE.test(name)
    ? []
    : [`${file}: file name is not kebab-case`];
};

export const inlineStyleProblems = (file, content) => {
  if (!/^src\/.*\.tsx$/.test(file)) return [];
  return [...content.matchAll(INLINE_STYLE)].flatMap((match) => {
    const keys = [...match[1].matchAll(/(["']?)([\w-]+)\1\s*:/g)].map((key) => key[2]);
    const line = content.slice(0, match.index).split("\n").length;
    return keys.every((key) => key.startsWith("--"))
      ? []
      : [
          `${file}:${line}: inline styles may only set CSS custom properties; move the rest to styles.css`,
        ];
  });
};

const listFiles = () =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file && existsSync(file));

const fileProblems = (file) => {
  const normalized = file.replaceAll("\\", "/");
  const content = /^src\/.*\.tsx$/.test(normalized) ? readFileSync(file, "utf8") : "";
  return [...fileNameProblems(normalized), ...inlineStyleProblems(normalized, content)];
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = listFiles().flatMap(fileProblems);
  if (problems.length > 0) {
    process.stderr.write(`Convention violations:\n${problems.join("\n")}\n`);
    process.exit(1);
  }
}
