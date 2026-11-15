import type { ChangelogEntry } from "../data/changelog";

/** One row of the changelog the player sees: a single version, or a run of
 * consecutive versions that carry nothing but the technical-changes note. */
export type ChangelogGroup = {
  readonly newest: string;
  readonly oldest: string;
  readonly newestDate: string;
  readonly oldestDate: string;
  readonly notes: readonly string[];
};

const onlyTechnical = (entry: ChangelogEntry, technicalNote: string): boolean =>
  entry.notes.length === 1 && entry.notes[0] === technicalNote;

const single = (entry: ChangelogEntry): ChangelogGroup => ({
  newest: entry.version,
  oldest: entry.version,
  newestDate: entry.date,
  oldestDate: entry.date,
  notes: entry.notes,
});

/**
 * Merges each run of technical-only entries into one group, keeping the
 * newest-first order. The data stays one entry per version; only the view
 * groups, so a run of dependency updates reads as one line, not eleven.
 */
export const groupChangelog = (
  entries: readonly ChangelogEntry[],
  technicalNote: string
): ChangelogGroup[] =>
  entries.reduce<ChangelogGroup[]>((groups, entry) => {
    const last = groups.at(-1);
    const extendsRun =
      last !== undefined &&
      onlyTechnical(entry, technicalNote) &&
      last.notes.length === 1 &&
      last.notes[0] === technicalNote;
    if (!extendsRun) return [...groups, single(entry)];
    return [...groups.slice(0, -1), { ...last, oldest: entry.version, oldestDate: entry.date }];
  }, []);

/** "v0.37.2" for one version, "v0.37.3–0.37.13" (oldest first) for a run. */
export const groupVersionLabel = (group: ChangelogGroup): string =>
  group.newest === group.oldest ? `v${group.newest}` : `v${group.oldest}–${group.newest}`;

/** One date as is; a run within one month as "2026-11-14–15"; otherwise both dates. */
export const groupDateLabel = (group: ChangelogGroup): string => {
  if (group.newestDate === group.oldestDate) return group.newestDate;
  const sameMonth = group.newestDate.slice(0, 8) === group.oldestDate.slice(0, 8);
  return sameMonth
    ? `${group.oldestDate}–${group.newestDate.slice(8)}`
    : `${group.oldestDate} – ${group.newestDate}`;
};
