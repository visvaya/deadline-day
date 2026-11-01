/**
 * Shared flag-parsing loop for the scripts/*.ts CLIs (balance.ts,
 * legacy-scan.ts). Extracted once both CLIs grew slightly different flag
 * sets but the same `--flag value` walking loop - jscpd flagged the
 * duplication under the repository's zero-duplication threshold (jscpd).
 */

import { at } from "../src/logic/invariant";
export const parseFlags = (
  argv: string[],
  knownFlags: readonly string[],
  /** Flags that stand alone, like --help. Without this the loop below demands
   * a value for every flag and `--help` dies with "Flag --help requires a
   * value" - which is how two CLIs shipped with an unusable help screen. */
  valuelessFlags: readonly string[] = []
): Map<string, string> => {
  const result = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = at(argv, i, "command-line argument");
    // `pnpm <script> -- --foo bar` forwards a literal "--" on some pnpm
    // versions instead of stripping it as the args separator. Treat it as a
    // no-op rather than reject a standard invocation.
    if (flag === "--") continue;
    if (!knownFlags.includes(flag)) {
      throw new Error(`Unknown flag "${flag}". Known flags: ${knownFlags.join(", ")}`);
    }
    if (valuelessFlags.includes(flag)) {
      result.set(flag, "");
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Flag ${flag} requires a value`);
    i += 1;
    result.set(flag, value);
  }
  return result;
};
