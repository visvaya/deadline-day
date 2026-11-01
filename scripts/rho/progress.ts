/**
 * Progress reporting for the rho study's long runs.
 *
 * Exists because a ten-hour run that prints nothing until it finishes cannot
 * be told apart from a ten-hour run that stopped after ninety seconds. The
 * only signal available was the operating system's CPU counter, which says a
 * process is busy and nothing about whether it is making progress.
 *
 * Goes to stderr, so `--md` reports and `> file` redirections stay clean.
 */

/** What a long loop calls after each unit of work. */
export type ProgressSink = (_done: number, _total: number) => void;

const duration = (seconds: number): string => {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
};

/**
 * A sink that prints at most every `intervalMs`, plus once when the loop ends.
 *
 * The remaining time is extrapolated from this loop's own measured rate rather
 * than from a constant in a document - the constant in the document has been
 * wrong twice, by 46% and by two orders of magnitude, both times because it
 * was measured before something changed underneath it.
 */
export const stderrProgress = (label: string, intervalMs = 20_000): ProgressSink => {
  const started = Date.now();
  let lastPrinted = started;
  return (done, total) => {
    const now = Date.now();
    const finished = done >= total;
    if (!finished && now - lastPrinted < intervalMs) return;
    lastPrinted = now;
    const elapsed = (now - started) / 1000;
    const share = total === 0 ? 1 : done / total;
    const remaining = done === 0 ? Number.NaN : (elapsed / done) * (total - done);
    const eta = Number.isFinite(remaining) ? `, zostało ~${duration(remaining)}` : "";
    process.stderr.write(
      `  ${label}: ${done}/${total} (${(share * 100).toFixed(1)}%), minęło ${duration(elapsed)}${eta}\n`
    );
  };
};

/** Announces a step that is one long operation rather than a countable loop. */
export const stderrStep = (label: string): (() => void) => {
  const started = Date.now();
  process.stderr.write(`  ${label}...\n`);
  return () => {
    process.stderr.write(`  ${label}: ${duration((Date.now() - started) / 1000)}\n`);
  };
};
