import { expect, test } from "vitest";

import { ruleBody, styles } from "./css-rules";

const fontSize = (css: string, selector: string): string | undefined =>
  /font-size:\s*([^;]+);/.exec(ruleBody(css, selector))?.[1];

test("the closing lines of the legacy screen read at the size of the seasons above them", () => {
  // "Ten, któremu odmówiłeś" and the transfer rumour sat at 13.5 px between
  // sections of 11-13 px and read as a different, louder kind of text.
  const css = styles();
  expect(fontSize(css, ".dd-second-chance-text")).toBe(fontSize(css, ".dd-legacy-season > p"));
});
