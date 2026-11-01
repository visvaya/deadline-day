import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "vitest";

/**
 * Reads declarations from src/ui/styles.css. Where a rule is declared, not how
 * it renders: jsdom has no layout, so anything about real sizes is measured
 * in tests/e2e instead.
 */

/** selectors { declarations } - flat, which this stylesheet is. */
const RULE_PATTERN = /([^{}]+)\{([^{}]*)\}/g;

/** Comments are stripped first: they sit between a rule and its selector and
 * would otherwise be read as part of it. */
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

export const styles = (): string =>
  readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

/**
 * Every declaration that reaches this exact selector, from all of its rules.
 *
 * Not the first rule whose text starts with it: a selector shares its rules
 * with others (".dd-player-row-role, .dd-player-row-age { ... }") and takes
 * declarations from several of them, so reading a single block answered a
 * different question than the one being asked - and answered it wrongly the
 * moment a rule was split or merged.
 */
export const ruleBody = (css: string, selector: string): string => {
  let found = "";
  for (const [, selectors, body] of withoutComments(css).matchAll(RULE_PATTERN)) {
    if (selectors!.split(",").some((one) => one.trim() === selector)) found += body;
  }
  expect(found, `no rule for "${selector}"`).not.toBe("");
  return found;
};
