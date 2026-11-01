import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every colour in src/ui/styles.css comes from a token defined in `:root`.
 * A literal anywhere else (`#fff`, `rgb(...)`, a copied `oklch(...)`) is a
 * colour that will not follow the palette when it changes - most concretely
 * when a dark theme arrives. Shadows,
 * scrims and outlines mix `--shadow-base` with `color-mix(...)` instead.
 *
 * Deliberately no stylelint or other dependency: like palette-contrast.test.ts,
 * this reads the stylesheet and checks it with a regex.
 */

const RAW_COLOUR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|:\s*(?:white|black)\b/gi;

/** Raw colour literals outside the `:root` block, comments ignored. */
const rawColoursOutsideRoot = (css: string): string[] => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutRoot = withoutComments.replace(/:root\s*\{[^}]*\}/, "");
  return [...withoutRoot.matchAll(RAW_COLOUR)].map((match) => match[0]);
};

describe("raw colours", () => {
  it("finds literals outside :root and ignores tokens, comments and :root itself", () => {
    const css = `
      :root { --a: oklch(50% 0.1 200); --b: #fff; }
      /* a comment may say #fff or rgb(0 0 0) */
      .x { color: #FFF; }
      .y { box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
      .z { background: oklch(10% 0 0 / 50%); }
      .w { color: white; }
      .ok { color: var(--a); background: color-mix(in srgb, var(--b) 5%, transparent); }
      .ok2 { white-space: nowrap; fill: currentcolor; }
    `;
    expect(rawColoursOutsideRoot(css)).toEqual(["#FFF", "rgb(", "oklch(", ": white"]);
  });

  it("src/ui/styles.css has no colour literal outside :root", () => {
    const css = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");
    expect(rawColoursOutsideRoot(css)).toEqual([]);
  });
});

/**
 * Colours in .ts/.tsx code under src/ui must also come from CSS tokens, not
 * hex/rgb/hsl/oklch literals hardcoded in TypeScript - see
 * accentOutlineTone (club-select-screen.tsx), which picks a TONE and leaves
 * the actual colour to styles.css.
 *
 * One explicit, commented allowlist entry: PROVISIONAL_CLUB_ACCENT in
 * screens/club-select-screen.tsx is club DATA (RSSSF-sourced club colours),
 * not a design-system colour - it is scheduled to move to club-visuals.ts
 * once club colours arrive after step 7 of spec 4. The same
 * line shape is therefore allowlisted only in that one file - elsewhere it
 * is reported like any other literal, never silently allowlisted.
 */
const TS_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;

/** Matches a `PROVISIONAL_CLUB_ACCENT`-shaped entry: `"<id>": "#xxxxxx",`. */
const CLUB_ACCENT_TABLE_ENTRY = /^\s*(?:"[^"]+"|[\w-]+)\s*:\s*"#[0-9a-fA-F]{3,8}"\s*,?\s*$/;

/** Path (relative to `src/ui`, forward slashes) of the one file allowed to
 * hold the club accent data table. */
const CLUB_ACCENT_TABLE_FILE = "screens/club-select-screen.tsx";

const isCommentLine = (line: string): boolean => {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
};

const listTsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  });

/** Raw colour literals in a .ts/.tsx file's non-comment lines. `relativePath`
 * is the file's path relative to `src/ui` with forward slashes; the club
 * accent data table shape is allowlisted only when it equals
 * `CLUB_ACCENT_TABLE_FILE`. */
const rawColoursInFile = (source: string, relativePath: string): string[] =>
  source
    .split("\n")
    .filter((line) => {
      if (isCommentLine(line)) return false;
      const isAllowlistedTableLine =
        relativePath === CLUB_ACCENT_TABLE_FILE && CLUB_ACCENT_TABLE_ENTRY.test(line);
      return !isAllowlistedTableLine;
    })
    .flatMap((line) => [...line.matchAll(TS_COLOUR)].map((match) => match[0]));

describe("rawColoursInFile", () => {
  it("reports hex, rgb( and oklch( literals outside the club accent table", () => {
    const source = `
      const a = "#ff00aa";
      const b = "rgb(0 0 0)";
      const c = "oklch(50% 0.1 200)";
    `;
    expect(rawColoursInFile(source, "components/foo.tsx")).toEqual(["#ff00aa", "rgb(", "oklch("]);
  });

  it("ignores comment lines", () => {
    const source = `
      // a comment with #fff and rgb(0 0 0)
      /* another one with oklch(10% 0 0) */
      * still inside a block comment with #000
      const real = "#123456";
    `;
    expect(rawColoursInFile(source, "components/foo.tsx")).toEqual(["#123456"]);
  });

  it("allows the club accent table shape only in club-select-screen.tsx", () => {
    const source = `
      "lech-poznan": "#1b4f9c",
      cracovia: "#c8102e",
    `;
    expect(rawColoursInFile(source, CLUB_ACCENT_TABLE_FILE)).toEqual([]);
    expect(rawColoursInFile(source, "screens/other-screen.tsx")).toEqual(["#1b4f9c", "#c8102e"]);
  });
});

describe("raw colours in src/ui TypeScript", () => {
  it("has no colour literal outside the allowlisted club accent data table", () => {
    const root = resolve(process.cwd(), "src/ui");
    const offenders = listTsFiles(root).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const relativePath = relative(root, path).split(sep).join("/");
      return rawColoursInFile(source, relativePath).map((literal) => `${relativePath}: ${literal}`);
    });
    expect(offenders).toEqual([]);
  });
});
