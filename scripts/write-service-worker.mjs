// Writes dist/sw.js: the service worker that keeps this release of the game for offline play. Its source is
// scripts/service-worker-template.js; this step writes the list of the release's files, each with its
// SHA-256, into the template's placeholder.
//
// Usage: node scripts/write-service-worker.mjs [dist directory]
// Runs after `vite build` (`pnpm build` does both). Nothing here depends on the time of the run, so the same
// build gives the same worker, and a build that changes no file keeps the worker the players already have.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVICE_WORKER_FILE = "sw.js";
const START_PAGE_FILE = "index.html";
// The host reads `_headers` and never serves it, a worker does not keep itself, and release.json names the
// commit, which changes with every build (scripts/served-release.mjs).
const NOT_PRECACHED_FILES = new Set(["_headers", SERVICE_WORKER_FILE, "release.json"]);
const RELEASE_PLACEHOLDER = "self.DEADLINE_DAY_RELEASE_PLACEHOLDER";
export const CACHE_PREFIX = "deadline-day-release-";
const CACHE_ID_LENGTH_CHARS = 16;
const TEMPLATE_FILE = fileURLToPath(new URL("service-worker-template.js", import.meta.url));

export const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");

/**
 * What the worker keeps: every file the browser can ask for, sorted by path. The start page is fetched at
 * the root, because the host redirects its file name there.
 *
 * @param {{ path: string, sha256: string }[]} files paths relative to dist/, with forward slashes
 * @returns {{ url: string, sha256: string }[]}
 */
export const precacheOf = (files) =>
  files
    .filter((file) => !NOT_PRECACHED_FILES.has(file.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) => ({
      url: file.path === START_PAGE_FILE ? "/" : `/${file.path}`,
      sha256: file.sha256,
    }));

/**
 * The release's cache, named after the kept files, so two releases never share one.
 *
 * @param {{ url: string, sha256: string }[]} precache
 */
export const cacheIdOf = (precache) =>
  sha256Hex(JSON.stringify(precache)).slice(0, CACHE_ID_LENGTH_CHARS);

/**
 * The worker of one release: the template with the release written into its placeholder.
 *
 * @param {string} template
 * @param {{ url: string, sha256: string }[]} precache
 */
export const renderServiceWorker = (template, precache) => {
  const parts = template.split(RELEASE_PLACEHOLDER);
  if (parts.length !== 2) {
    throw new Error(
      `the worker's source must name ${RELEASE_PLACEHOLDER} exactly once, found ${parts.length - 1}`
    );
  }
  const release = {
    cachePrefix: CACHE_PREFIX,
    cacheId: cacheIdOf(precache),
    precache,
  };
  return parts.join(JSON.stringify(release, null, 2));
};

const listFiles = (dir, prefix = "") =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), relative) : [relative];
  });

const main = (distDir) => {
  if (!existsSync(path.join(distDir, START_PAGE_FILE))) {
    console.error(
      `write-service-worker: no ${START_PAGE_FILE} in ${distDir}; run \`vite build\` first.`
    );
    return 1;
  }
  // Left over from an earlier run on the same directory.
  rmSync(path.join(distDir, SERVICE_WORKER_FILE), { force: true });
  const files = listFiles(distDir).map((file) => ({
    path: file,
    sha256: sha256Hex(readFileSync(path.join(distDir, file))),
  }));
  const precache = precacheOf(files);
  const worker = renderServiceWorker(readFileSync(TEMPLATE_FILE, "utf8"), precache);
  writeFileSync(path.join(distDir, SERVICE_WORKER_FILE), worker);
  console.log(`write-service-worker: ${precache.length} files kept for offline play`);
  return 0;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(path.resolve(process.argv[2] ?? "dist"));
}
