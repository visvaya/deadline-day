// Fails when the gzip size of the production bundle exceeds a fixed budget,
// summed separately for JavaScript and CSS.
//
// Usage: node scripts/check-bundle-size.mjs
// Requires a build to exist already (`pnpm build`); this script never builds
// the project itself, so it stays fast and side-effect free.
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Budgets are about 15 percent above the measured gzip sizes on 2026-09-24
// (JS 114.74 kB, CSS 10.17 kB, after `pnpm build`). They are an assumption,
// not a derived limit, and may be tightened as the bundle is understood
// better - never raised just to make a failing build pass.
//
// The one deliberate exception so far: the owner raised the JS budget from
// 130 to 140 KiB on 2026-09-30 to take React 19, which alone added about
// 22.7 kB gzip (JS 113 694 -> 136 425 bytes). Lazy-loading the late screens
// is the noted way to win it back.
export const BUNDLE_SIZE_BUDGETS = {
  jsGzipBytesBudget: 140 * 1024,
  cssGzipBytesBudget: 12 * 1024,
};

const DIST_ASSETS_DIR = path.join("dist", "assets");

// Fonts (.woff2) are excluded: they are loaded separately from the JS/CSS
// bundle and are already compressed, so gzipping them again is meaningless
// and they play no part in the budget this script enforces.
const KIND_BY_EXTENSION = {
  ".js": "js",
  ".css": "css",
};

/**
 * Pure comparison: gzip byte sums in, list of budget problems out.
 *
 * @param {{ jsGzipBytes: number, cssGzipBytes: number }} sizes
 * @param {{ jsGzipBytesBudget: number, cssGzipBytesBudget: number }} budgets
 * @returns {string[]}
 */
export const findBundleSizeProblems = (sizes, budgets) => {
  const problems = [];
  if (sizes.jsGzipBytes > budgets.jsGzipBytesBudget) {
    problems.push(
      `JS bundle gzip size ${sizes.jsGzipBytes} bytes exceeds budget ${budgets.jsGzipBytesBudget} bytes`
    );
  }
  if (sizes.cssGzipBytes > budgets.cssGzipBytesBudget) {
    problems.push(
      `CSS bundle gzip size ${sizes.cssGzipBytes} bytes exceeds budget ${budgets.cssGzipBytesBudget} bytes`
    );
  }
  return problems;
};

const gzipBytesOf = (filePath) => gzipSync(readFileSync(filePath)).length;

const measureDistAssets = (assetsDir) =>
  readdirSync(assetsDir).reduce(
    (sums, fileName) => {
      const kind = KIND_BY_EXTENSION[path.extname(fileName).toLowerCase()];
      if (!kind) return sums;
      const bytes = gzipBytesOf(path.join(assetsDir, fileName));
      return kind === "js"
        ? { ...sums, jsGzipBytes: sums.jsGzipBytes + bytes }
        : { ...sums, cssGzipBytes: sums.cssGzipBytes + bytes };
    },
    { jsGzipBytes: 0, cssGzipBytes: 0 }
  );

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(DIST_ASSETS_DIR)) {
    process.stderr.write(`${DIST_ASSETS_DIR} not found. Run \`pnpm build\` first.\n`);
    process.exit(1);
  }

  const sizes = measureDistAssets(DIST_ASSETS_DIR);
  const problems = findBundleSizeProblems(sizes, BUNDLE_SIZE_BUDGETS);

  process.stdout.write(
    `JS gzip: ${sizes.jsGzipBytes} bytes (budget ${BUNDLE_SIZE_BUDGETS.jsGzipBytesBudget})\n` +
      `CSS gzip: ${sizes.cssGzipBytes} bytes (budget ${BUNDLE_SIZE_BUDGETS.cssGzipBytesBudget})\n`
  );

  if (problems.length > 0) {
    process.stderr.write(`Bundle size budget exceeded:\n${problems.join("\n")}\n`);
    process.exit(1);
  }
}
