// Shared Git hook logic. Invoked by .githooks/*.
//
// Usage: node scripts/git-hooks.mjs pre-commit
//        node scripts/git-hooks.mjs commit-msg <message-file>
//
// Commit format itself stays with commitlint (commitlint.config.mjs); this
// file adds what commitlint cannot express: the commit identity, co-author
// and generated-by lines, forbidden characters, absolute paths and the
// repository conventions.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { findFileProblems, findTextProblems } from "./check-text.mjs";

/** E-mail addresses allowed as commit author and committer (matched case-insensitively). */
export const ALLOWED_COMMIT_EMAILS = ["84781703+visvaya@users.noreply.github.com"];

const FORBIDDEN_MESSAGE_LINES = [/^co-authored-by:/im, /^\W*generated (?:with|by)\s/im];

// Only source files: documentation may legitimately cite a path.
const CODE_FILE = /\.(?:mjs|js|jsx|ts|tsx)$/;
const ABSOLUTE_PATH = /["']([A-Za-z]:\\|\/home\/|\/Users\/)/;

const fail = (message) => {
  process.stderr.write(`\n[git hook] ${message}\n\n`);
  process.exit(1);
};

const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();

/** Strips the trailing "<timestamp> <tz>" that `git var` appends. */
const identityName = (ident) => ident.replace(/\s+\d+\s+[+-]\d{4}$/, "");

const identityEmail = (ident) => /<([^>]*)>/.exec(ident)?.[1]?.toLowerCase() ?? "";

export const isAllowedIdentity = (ident) =>
  ALLOWED_COMMIT_EMAILS.some((email) => email.toLowerCase() === identityEmail(ident));

export const commitMessageProblems = (raw) => {
  const message = raw
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();
  return [
    ...(FORBIDDEN_MESSAGE_LINES.some((pattern) => pattern.test(message))
      ? ["co-author or generated-by attribution line; remove it"]
      : []),
    ...findTextProblems(message, { label: "commit message", emDash: true }),
  ];
};

const checkIdentity = () => {
  for (const role of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
    const ident = git(["var", role]);
    if (!isAllowedIdentity(ident)) {
      fail(`${role} is "${identityName(ident)}". Commits must use the owner's identity.`);
    }
  }
};

const stagedContent = (file) =>
  execFileSync("git", ["show", `:${file}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const checkAbsolutePaths = (staged) => {
  const leaked = staged
    .filter((file) => CODE_FILE.test(file))
    .filter((file) => ABSOLUTE_PATH.test(stagedContent(file)));
  if (leaked.length > 0) {
    fail(
      `Absolute local paths found in:\n  ${leaked.join("\n  ")}\n` +
        "Use process.cwd(), import.meta.url, or a path relative to the repo root."
    );
  }
};

const runNode = (script) => spawnSync(process.execPath, [script], { stdio: "inherit" });

// pnpm is a .cmd shim on Windows, which Node only starts through a shell.
// The command goes in as one string: passing an args array together with
// `shell: true` is deprecated (DEP0190) because the args are not escaped.
const runPnpm = (command) => spawnSync(`pnpm ${command}`, { stdio: "inherit", shell: true });

const preCommit = () => {
  checkIdentity();
  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
    .split("\0")
    .filter(Boolean);
  if (staged.length === 0) return;

  checkAbsolutePaths(staged);

  const textProblems = staged.flatMap(findFileProblems);
  if (textProblems.length > 0) fail(`Forbidden characters found:\n${textProblems.join("\n")}`);

  if (runNode("scripts/check-conventions.mjs").status !== 0) {
    fail("Repository conventions are violated.");
  }
  if (runPnpm("verify:fast").status !== 0) fail("pnpm verify:fast failed.");
};

const commitMsg = (file) => {
  // Git passes a path inside .git; quoted in case the checkout path has spaces.
  if (runPnpm(`exec commitlint --edit "${file}"`).status !== 0) {
    fail("commitlint rejected the message.");
  }
  const problems = commitMessageProblems(readFileSync(file, "utf8"));
  if (problems.length > 0) fail(problems.join("\n"));
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [hook, argument] = process.argv.slice(2);
  if (hook === "pre-commit") preCommit();
  else if (hook === "commit-msg" && argument) commitMsg(argument);
  else fail(`Unknown hook invocation: ${process.argv.slice(2).join(" ")}`);
}
