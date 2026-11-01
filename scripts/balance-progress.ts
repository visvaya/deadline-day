/**
 * Progress reporting for `pnpm balance`'s long runs. Pure formatting only -
 * `balance.ts` owns the stderr write, `Date.now()` calls, and the running
 * average that feeds `cellMs`/`elapsedMs` here. Kept out of `balance.ts` so
 * the format itself is unit-testable without running a career.
 */

/** Formats a duration in milliseconds as Polish "Xh Ym Zs"-style text,
 * dropping leading zero units (a duration under a minute prints only
 * seconds, one under an hour only minutes and seconds). Zero itself prints
 * as "0 s" rather than an empty string. */
export const formatDurationPl = (ms: number): string => {
  const totalSeconds = Math.round(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (hours > 0 || minutes > 0) parts.push(`${minutes} min`);
  parts.push(`${seconds} s`);
  return parts.join(" ");
};

/**
 * One progress line for a just-finished cell.
 *
 * `done` is 1-based (cells finished so far, including the one that just
 * finished), `total` is the cell count for the whole run, `cellMs` is that
 * cell's own duration, and `elapsedMs` is wall time since the run started.
 * ETA is derived from the running average cell time (`elapsedMs / done`),
 * not from `cellMs` alone - a single slow or fast cell should not swing the
 * estimate. On the last cell (`done === total`) the ETA is always 0.
 */
export const formatProgress = (
  done: number,
  total: number,
  clubId: string,
  policyName: string,
  cellMs: number,
  elapsedMs: number
): string => {
  const remaining = done >= total ? 0 : Math.max(0, (elapsedMs / done) * (total - done));
  const dot = "·";
  return [
    `[${done}/${total}]`,
    clubId,
    dot,
    policyName,
    dot,
    `${(cellMs / 1000).toFixed(1)} s`.replace(".", ","),
    dot,
    `minęło ${formatDurationPl(elapsedMs)}`,
    dot,
    `zostało ~${formatDurationPl(remaining)}`,
  ].join(" ");
};
