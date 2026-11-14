import { describe, expect, test } from "vitest";

import { type Doc, findDocLinkProblems } from "../../scripts/doc-links-core";

const TREE = new Set([
  "README.md",
  "docs/testing.md",
  "docs/screenshot.png",
  "src/logic",
  "src/logic/rng.ts",
  "tests",
]);
const ROOTS = ["docs", "scripts", "src", "tests"];
const exists = (path: string): boolean => TREE.has(path);
const check = (file: string, text: string): string[] =>
  findDocLinkProblems([{ file, text }], { exists, roots: ROOTS });

describe("documentation link check", () => {
  test("paths and links that exist pass", () => {
    const text = [
      "The generator is `src/logic/rng.ts`, tested in `tests` and used across `src/logic`.",
      "See [testing](docs/testing.md) and ![screenshot](docs/screenshot.png).",
    ].join("\n");
    expect(check("README.md", text)).toEqual([]);
  });

  test("a missing backticked path is named with its file and line", () => {
    expect(check("docs/testing.md", "intro\nThe draw lives in `src/logic/draw.ts`.")).toEqual([
      "docs/testing.md:2: `src/logic/draw.ts` does not exist",
    ]);
  });

  test("a link resolves from the directory of the document", () => {
    expect(check("docs/testing.md", "[shot](screenshot.png) and [readme](../README.md)")).toEqual(
      []
    );
    expect(check("docs/testing.md", "[spec](engine-spec.md)")).toEqual([
      "docs/testing.md:1: link `engine-spec.md` does not exist",
    ]);
  });

  test("addresses, anchors, queries and encoded names are handled", () => {
    const text =
      "[site](https://example.com/x) [mail](mailto:a@b.c) [top](#status) [part](testing.md#lokalnie)";
    expect(check("docs/testing.md", text)).toEqual([]);
    expect(check("README.md", "[gone](docs/old%20name.md?raw=1#top)")).toEqual([
      "README.md:1: link `docs/old%20name.md?raw=1#top` does not exist",
    ]);
  });

  test("a link with a title is still checked", () => {
    expect(
      check("README.md", '[guide](docs/missing.md "Guide") [ok](docs/testing.md "Testing")')
    ).toEqual(["README.md:1: link `docs/missing.md` does not exist"]);
    expect(check("README.md", "[a](docs/a.md 'A') [b](docs/b.md (B))")).toEqual([
      "README.md:1: link `docs/a.md` does not exist",
      "README.md:1: link `docs/b.md` does not exist",
    ]);
    expect(
      check("README.md", String.raw`[x](docs/gone.md "say \"hi\"") [y](docs/gone.md (a \) b))`)
    ).toEqual([
      "README.md:1: link `docs/gone.md` does not exist",
      "README.md:1: link `docs/gone.md` does not exist",
    ]);
  });

  test("a link to a directory may end with a slash", () => {
    expect(check("README.md", "[logic](src/logic/)")).toEqual([]);
  });

  test("a link written inside inline code is an example, not a link", () => {
    expect(check("README.md", "Write `[x](missing.md)` to link a file.")).toEqual([]);
    expect(check("README.md", "[x]`example`(docs/missing.md)")).toEqual([]);
    expect(check("README.md", "``a ` [x](missing.md)``")).toEqual([]);
  });

  test("backticks without a closing run of the same length are text, and a link after them is checked", () => {
    expect(check("README.md", "` note [x](missing.md) ``")).toEqual([
      "README.md:1: link `missing.md` does not exist",
    ]);
  });

  test("an escaped backtick opens no code span, a backtick after an escaped backslash does", () => {
    const backslash = String.fromCharCode(92);
    expect(check("README.md", `${backslash}\` [x](missing.md) ${backslash}\``)).toEqual([
      "README.md:1: link `missing.md` does not exist",
    ]);
    expect(check("README.md", `${backslash}${backslash}\`[x](missing.md)\``)).toEqual([]);
    // The escape takes one backtick; the next one still opens a span.
    expect(check("README.md", `${backslash}\`\`example\` [x](missing.md) \`tail\``)).toEqual([
      "README.md:1: link `missing.md` does not exist",
    ]);
  });

  test("a fence closes only on a fence of the same character at least as long as the opening one", () => {
    const text = ["````md", "```", "[x](gone.md)", "~~~", "```", "````", "[y](gone.md)"].join("\n");
    expect(check("README.md", text)).toEqual(["README.md:7: link `gone.md` does not exist"]);
  });

  test("a line number or trailing punctuation after a path is not part of it", () => {
    expect(
      check("README.md", "`src/logic/rng.ts:12`, `src/logic/rng.ts:3-9`; (`src/logic`).")
    ).toEqual([]);
  });

  test("tokens outside the repository directories, with spaces or placeholders are not paths", () => {
    const text = [
      "`pnpm build` `dist/` `node_modules/x` `index.html` `src/**/*.test.ts` `tests/<name>.test.ts`",
      "`deadline-day-${sha}` `src/{a,b}.ts` `docs/[id].md`",
    ].join("\n");
    expect(check("README.md", text)).toEqual([]);
  });

  test("fenced code blocks are skipped", () => {
    const text = [
      "```sh",
      "node scripts/missing.ts `src/missing.ts`",
      "```",
      "~~~",
      "[x](gone.md)",
      "~~~",
    ].join("\n");
    expect(check("README.md", text)).toEqual([]);
  });

  test("problems of several documents keep their order", () => {
    const docs: Doc[] = [
      { file: "README.md", text: "`src/a.ts`" },
      { file: "docs/testing.md", text: "[b](b.md)" },
    ];
    expect(findDocLinkProblems(docs, { exists, roots: ROOTS })).toEqual([
      "README.md:1: `src/a.ts` does not exist",
      "docs/testing.md:1: link `b.md` does not exist",
    ]);
  });
});
