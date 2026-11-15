/**
 * Rules of the documentation link check: every relative Markdown link and every
 * backticked path that starts with a directory of the repository must name
 * something that exists. Pure functions; scripts/check-doc-links.ts lists the
 * documents and answers whether a path exists.
 *
 * A document has a repository-relative path with forward slashes. A problem is
 * a string "file:line: message".
 */
import { posix } from "node:path";

export type Doc = { readonly file: string; readonly text: string };
export type DocFacts = {
  readonly exists: (path: string) => boolean;
  /** Top-level directories: a backticked token is a path only when it starts with one. */
  readonly roots: readonly string[];
};

/**
 * An inline Markdown link or image, with an optional title in "", '' or (),
 * where a backslash escapes the closing character.
 */
const LINK =
  /!?\[[^\]]*\]\(([^)\s]+)(?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?\)/g;
/** A backticked token without white space. */
const BACKTICKED = /`([^`\s]+)`/g;
const BACKSLASH = String.fromCharCode(92);
const BACKTICK_RUN = /`+/y;

/** Where the next run of exactly `length` backticks starts at or after `from`, or -1. */
const closingRunAt = (content: string, from: number, length: number): number => {
  const runs = /`+/g;
  runs.lastIndex = from;
  for (let run = runs.exec(content); run !== null; run = runs.exec(content)) {
    if (run[0].length === length) return run.index;
  }
  return -1;
};

/**
 * The line with its code spans blanked out, read left to right as CommonMark
 * reads it: outside a span a backslash escapes the next character; a run of
 * backticks opens a span only when a run of the same length follows, and
 * inside the span a backslash is text. A link written in a span is an
 * example, not a link.
 */
const withoutCodeSpans = (content: string): string => {
  const kept: string[] = [];
  let index = 0;
  while (index < content.length) {
    const char = content.charAt(index);
    if (char === BACKSLASH) {
      kept.push(content.slice(index, index + 2));
      index += 2;
    } else if (char === "`") {
      BACKTICK_RUN.lastIndex = index;
      const run = BACKTICK_RUN.exec(content)?.[0] ?? "`";
      const close = closingRunAt(content, index + run.length, run.length);
      kept.push(close === -1 ? run : " ");
      index = close === -1 ? index + run.length : close + run.length;
    } else {
      kept.push(char);
      index += 1;
    }
  }
  return kept.join("");
};
/** A scheme (https:, mailto:) marks an address, not a file of the repository. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Globs and placeholders name a family of files, not one path. */
const PATTERN_CHARACTERS = /[*?<>{}[\]$]/;
/** A line that opens or closes a fenced code block: the fence and what follows it. */
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;

/** The path inside a backticked token: without a line number or the punctuation of the sentence around it. */
const pathOfToken = (token: string): string =>
  token
    .replace(/[,;.)]+$/, "")
    .replace(/:\d+(-\d+)?$/, "")
    .replace(/\/+$/, "");

/** The repository path a relative link points to, or null for an address or an anchor in the same document. */
const pathOfLink = (file: string, target: string): string | null => {
  if (SCHEME.test(target) || target.startsWith("#")) return null;
  const withoutSuffix = target.replace(/[?#].*$/, "");
  return posix
    .normalize(posix.join(posix.dirname(file), decodeURIComponent(withoutSuffix)))
    .replace(/\/+$/, "");
};

type Line = { readonly line: number; readonly content: string };

/** A fence closes a block opened by `opening` when it uses the same character, is no shorter and has no text after it. */
const closesFence = (opening: string, fence: string, rest: string): boolean =>
  fence[0] === opening[0] && fence.length >= opening.length && rest.trim() === "";

type Scan = { readonly opening: string | null; readonly lines: Line[] };

/** The lines of a document outside fenced code blocks, with their numbers. */
const proseLines = (text: string): Line[] =>
  text.split("\n").reduce<Scan>(
    ({ opening, lines }, content, index): Scan => {
      const match = FENCE.exec(content);
      if (match === null)
        return {
          opening,
          lines: opening === null ? [...lines, { line: index + 1, content }] : lines,
        };
      const [, fence = "", rest = ""] = match;
      if (opening === null) return { opening: fence, lines };
      return { opening: closesFence(opening, fence, rest) ? null : opening, lines };
    },
    { opening: null, lines: [] }
  ).lines;

const lineProblems = (
  file: string,
  { line, content }: Line,
  { exists, roots }: DocFacts
): string[] => {
  const links = [...withoutCodeSpans(content).matchAll(LINK)].flatMap(([, target = ""]) => {
    const path = pathOfLink(file, target);
    return path === null || exists(path)
      ? []
      : [`${file}:${line}: link \`${target}\` does not exist`];
  });
  const paths = [...content.matchAll(BACKTICKED)].flatMap(([, token = ""]) => {
    const path = pathOfToken(token);
    const isRepositoryPath =
      roots.includes(path.split("/")[0] ?? "") && !PATTERN_CHARACTERS.test(path);
    return !isRepositoryPath || exists(path) ? [] : [`${file}:${line}: \`${path}\` does not exist`];
  });
  return [...links, ...paths];
};

/** The dead references of the documents, in document and line order. */
export const findDocLinkProblems = (docs: readonly Doc[], facts: DocFacts): string[] =>
  docs.flatMap(({ file, text }) =>
    proseLines(text).flatMap((line) => lineProblems(file, line, facts))
  );

/**
 * Paths a document names on purpose although they are not in git. The list
 * only shrinks: a new entry needs a reason as strong as these.
 */
export const KNOWN_ABSENT: ReadonlySet<string> = new Set(
  // Measurement dumps of the spec 4 control run: too large for git, so the
  // reports pin each one by row count and sha256 instead.
  [
    "control-seasons.csv",
    "control-raw.csv",
    "active-signings.csv",
    "active-original-13-raw.csv",
    "active-original-13-seasons.csv",
  ].map((name) => `scripts/data/spec4-control-2026-09-25/${name}`)
);
