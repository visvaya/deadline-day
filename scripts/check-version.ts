import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

import { versionProblems } from "./release-version";

/**
 * `pnpm check:version --base <commit> --title "<pull request title>"`
 *
 * A pull request that changes the game moves the version by the step its title
 * names; any other keeps it (rules in scripts/release-version.ts). CI runs it on
 * the merge commit of a pull request with `--base HEAD^1`, the head of main it
 * merges into, so the comparison is exactly what the pull request brings.
 */
const git = (...args: string[]): string => execFileSync("git", args, { encoding: "utf8" });

const main = (): void => {
  const { values } = parseArgs({
    options: { base: { type: "string" }, title: { type: "string" } },
  });
  if (values.base === undefined || values.title === undefined) {
    throw new Error('usage: pnpm check:version --base <commit> --title "<pull request title>"');
  }
  const problems = versionProblems({
    title: values.title,
    changedPaths: git("diff", "--name-only", values.base, "HEAD").split("\n").filter(Boolean),
    basePackage: JSON.parse(git("show", `${values.base}:package.json`)) as { version: string },
    headPackage: JSON.parse(git("show", "HEAD:package.json")) as { version: string },
  });
  if (problems.length > 0) throw new Error(problems.join("\n"));
  process.stdout.write("check:version: the version is as the title and the changes require\n");
};

try {
  main();
} catch (error) {
  process.stderr.write(
    `check:version: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
}
