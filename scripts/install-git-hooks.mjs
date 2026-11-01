// Points Git at the versioned hooks in .githooks/. Runs from `pnpm install` (prepare).
// Skips silently outside a Git work tree (a source archive, some CI images)
// and under CI, where nobody commits and `git config` has nothing to protect.
import { execFileSync } from "node:child_process";

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const insideWorkTree = () => {
  try {
    return git(["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return false;
  }
};

if (!process.env.CI && insideWorkTree()) {
  git(["config", "core.hooksPath", ".githooks"]);
}
