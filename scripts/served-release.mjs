// What a deployed release is, and whether an address serves it whole. Node built-ins only, so the deploy,
// rollback and monitor jobs run it without the game's dependencies.
//
//   node scripts/served-release.mjs write [dist]        after the build: dist/release.json with the version,
//                                                      the commit and an id of the content
//   node scripts/served-release.mjs compare <url> [dist] before a deploy: "same" (nothing to publish) or
//                                                      "different"; refuses (exit 1) other content under a
//                                                      version that is not above the served one
//   node scripts/served-release.mjs check <url> [--source-sha <commit>] [--wait-s <seconds>]
//                                                      after a deploy, a rollback or on a schedule: the
//                                                      served release.json (from that commit, when given) and
//                                                      every file the served sw.js lists, with its bytes;
//                                                      retried until the deadline, since a CDN can mix old and
//                                                      new files for a while
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { sha256Hex } from "./write-service-worker.mjs";

export const RELEASE_FILE = "release.json";
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
// How the host answers for the files: a change here changes what players get from the same files.
const HOST_CONFIGURATION = path.join(PROJECT_ROOT, "deploy", "wrangler.jsonc");
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_PAUSE_MS = 5_000;

const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * The id of what a release serves: every built file but release.json itself (the commit in it changes with
 * every build), and the host's configuration. A commit that changes neither keeps the id.
 *
 * @param {{ path: string, sha256: string }[]} files
 * @param {string} hostConfiguration
 */
export const contentIdOf = (files, hostConfiguration) =>
  sha256Hex(
    [
      ...files
        .filter((file) => file.path !== RELEASE_FILE)
        .sort(byPath)
        .map((file) => `${file.sha256}  ${file.path}\n`),
      `${sha256Hex(hostConfiguration)}  <host configuration>\n`,
    ].join("")
  );

/** @param {string} a @param {string} b */
export const compareVersions = (a, b) => {
  const [x, y] = [VERSION.exec(a), VERSION.exec(b)];
  if (!x || !y) throw new Error(`not a version: ${x ? b : a}`);
  for (const index of [1, 2, 3]) {
    const difference = Number(x[index]) - Number(y[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
};

/** The release an address answered with, or undefined for no answer, another file or a broken one. */
const parseRelease = (text) => {
  try {
    const release = JSON.parse(text);
    return typeof release?.contentId === "string" && typeof release?.version === "string"
      ? release
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether to publish the local release over the served one. The same content is not published again: every
 * player's browser would fetch the game once more for nothing. Other content needs a version above the
 * served one, or players would read an old number on a new game. Nothing served (the first deploy, or a
 * release from before release.json) puts no limit.
 *
 * @param {{ version: string, contentId: string }} local
 * @param {string} servedText
 */
export const comparisonWithServed = (local, servedText) => {
  const served = parseRelease(servedText);
  if (served === undefined) return { same: false, problems: [] };
  if (served.contentId === local.contentId) return { same: true, problems: [] };
  return compareVersions(local.version, served.version) > 0
    ? { same: false, problems: [] }
    : {
        same: false,
        problems: [
          `the content changed but version ${local.version} is not above the served ${served.version}; nothing is published`,
        ],
      };
};

/** The files a served worker keeps, read from the release written into it (write-service-worker.mjs). */
export const precacheOfWorker = (workerText) => {
  const match = /const RELEASE = (\{[\s\S]*?\n\});/u.exec(workerText);
  if (!match?.[1]) throw new Error("the served sw.js carries no release");
  const { precache } = JSON.parse(match[1]);
  if (!Array.isArray(precache)) throw new Error("the served sw.js lists no files");
  return precache;
};

const listFiles = (dir, prefix = "") =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), relative) : [relative];
  });

const sourceSha = () =>
  process.env.GITHUB_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();

const write = (distDir) => {
  if (!existsSync(path.join(distDir, "sw.js")))
    throw new Error(`no sw.js in ${distDir}; build first`);
  const files = listFiles(distDir).map((file) => ({
    path: file,
    sha256: sha256Hex(readFileSync(path.join(distDir, file))),
  }));
  const { version } = JSON.parse(readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
  const release = {
    name: "deadline-day",
    version,
    sourceSha: sourceSha(),
    contentId: contentIdOf(files, readFileSync(HOST_CONFIGURATION, "utf8")),
  };
  writeFileSync(path.join(distDir, RELEASE_FILE), `${JSON.stringify(release, null, 2)}\n`);
  console.log(`served-release: ${version}, content ${release.contentId.slice(0, 16)}`);
};

const fetchText = async (url) => {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
};

const compare = async (address, distDir) => {
  const local = JSON.parse(readFileSync(path.join(distDir, RELEASE_FILE), "utf8"));
  const servedText = await fetchText(`${address}/${RELEASE_FILE}`).catch(() => "");
  const { same, problems } = comparisonWithServed(local, servedText);
  console.log(same ? "same" : "different");
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `same_content=${same}\n`);
  for (const problem of problems) console.error(`served-release: ${problem}`);
  return problems.length === 0;
};

/** Everything wrong with what the address serves now; empty when the release is whole. */
const servedProblems = async (address, expectedSha) => {
  const release = parseRelease(await fetchText(`${address}/${RELEASE_FILE}`));
  if (release === undefined) return [`${RELEASE_FILE}: not a release`];
  if (expectedSha && release.sourceSha !== expectedSha) {
    return [`${RELEASE_FILE}: built from ${release.sourceSha}, not ${expectedSha}`];
  }
  const precache = precacheOfWorker(await fetchText(`${address}/sw.js`));
  const checks = await Promise.all(
    precache.map(async (entry) => {
      const response = await fetch(`${address}${entry.url}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return `${entry.url}: HTTP ${response.status}`;
      const hash = sha256Hex(Buffer.from(await response.arrayBuffer()));
      return hash === entry.sha256 ? null : `${entry.url}: not the bytes the worker lists`;
    })
  );
  return checks.filter((problem) => problem !== null);
};

const check = async (address, expectedSha, waitSeconds) => {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- one attempt after another, until the deadline
    const problems = await servedProblems(address, expectedSha).catch((error) => [String(error)]);
    if (problems.length === 0) {
      console.log(`served-release: ${address} serves its release whole`);
      return true;
    }
    if (Date.now() >= deadline) {
      for (const problem of problems) console.error(`served-release: ${problem}`);
      return false;
    }
    // oxlint-disable-next-line no-await-in-loop -- see above
    await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
  }
};

const main = async () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { "source-sha": { type: "string" }, "wait-s": { type: "string", default: "0" } },
  });
  const [command, target, dist = "dist"] = positionals;
  if (command === "write") {
    write(path.resolve(target ?? "dist"));
    return true;
  }
  if (
    (command === "compare" || command === "check") &&
    target &&
    /^https?:\/\/[^/]+\/?$/u.test(target)
  ) {
    const address = target.replace(/\/$/u, "");
    return command === "compare"
      ? compare(address, path.resolve(dist))
      : check(address, values["source-sha"], Number(values["wait-s"]));
  }
  console.error(
    "usage: served-release.mjs write [dist] | compare <url> [dist] | check <url> [--source-sha <commit>] [--wait-s <seconds>]"
  );
  return false;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = (await main()) ? 0 : 1;
}
