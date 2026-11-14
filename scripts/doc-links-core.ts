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

/** An inline Markdown link or image: [text](target) or ![alt](target). */
const LINK = /!?\[[^\]]*\]\(([^)\s]+)\)/g;
/** A backticked token without white space. */
const BACKTICKED = /`([^`\s]+)`/g;
/** A scheme (https:, mailto:) marks an address, not a file of the repository. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Globs and placeholders name a family of files, not one path. */
const PATTERN_CHARACTERS = /[*?<>{}[\]$]/;
const FENCE = /^\s*(```|~~~)/;

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
  return posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(withoutSuffix)));
};

type Line = { readonly line: number; readonly content: string };

/** The lines of a document outside fenced code blocks, with their numbers. */
const proseLines = (text: string): Line[] =>
  text
    .split("\n")
    .reduce<{ fenced: boolean; lines: Line[] }>(
      ({ fenced, lines }, content, index) =>
        FENCE.test(content)
          ? { fenced: !fenced, lines }
          : { fenced, lines: fenced ? lines : [...lines, { line: index + 1, content }] },
      { fenced: false, lines: [] }
    ).lines;

const lineProblems = (
  file: string,
  { line, content }: Line,
  { exists, roots }: DocFacts
): string[] => {
  const links = [...content.matchAll(LINK)].flatMap(([, target = ""]) => {
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
