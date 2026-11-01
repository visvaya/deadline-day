import { clubIdForShortName } from "../src/data/clubs";

/**
 * What a `pnpm balance --dump-raw` file is, and which files may be paired
 * with which.
 *
 * Two dumps are only comparable when their rows mean the same thing. A
 * schema-1 dump (a cell is a difficulty; each seed drew its own club) and a
 * club dump (a cell is one club, whether keyed by short name in schema 2-4 or
 * by id in schema 5) share seeds and policy names but not careers, so pairing
 * them would silently compare a Legia career against whatever the draw
 * produced. A normal run and a finance-control run share everything except
 * the economy the numbers came out of, which is precisely the thing under
 * measurement. Both are refused here rather than averaged.
 *
 * A schema-2-through-4 dump and a schema-5 dump ARE comparable, deliberately:
 * both pin one club per cell, schema 5 only renamed the join column from a
 * short name to an id. Pairing them resolves the short name to an id so the
 * two sides land on the same cell key.
 */

export type DumpIdentity = {
  /** "level" for the pre-club shape (a cell was a difficulty, the club was
   * drawn); "club" for schema 2-4 (a cell pins a club, keyed by its short
   * display name); "clubId" for schema 5 (keyed by the canonical id). "club"
   * and "clubId" dumps may be paired with each other; "level" may be paired
   * with neither. */
  mode: "level" | "club" | "clubId";
  /** "normal" or "finance-control". Absent in schema-1 dumps, which predate
   * the control and were therefore all normal. */
  incomeMode: string;
};

export type DumpKeyFields = {
  poziom: string;
  polityka: string;
  /** Short display name, schema 2-4. Empty in a level-mode or schema-5 row. */
  klub: string;
  /** Canonical id, schema 5 only. Empty otherwise. */
  clubId: string;
  incomeMode: string;
};

const CLUB_MODES: ReadonlySet<DumpIdentity["mode"]> = new Set(["club", "clubId"]);

/**
 * Reads the identity off the header and the first data row.
 *
 * A dump with the `clubId` column present and non-empty is schema 5; one
 * with `clubShortName` present and non-empty is schema 2-4's club mode; a
 * dump with neither, or with the column present but empty, is the old level
 * mode - the column exists, the cell simply pinned nothing, so the mode is
 * decided by the value, not by the column's presence.
 */
export const dumpIdentityOf = (
  header: readonly string[],
  firstRow: DumpKeyFields | null
): DumpIdentity => {
  const incomeMode = firstRow?.incomeMode || "normal";
  if (header.includes("clubId") && firstRow !== null && firstRow.clubId !== "") {
    return { mode: "clubId", incomeMode };
  }
  if (header.includes("clubShortName") && firstRow !== null && firstRow.klub !== "") {
    return { mode: "club", incomeMode };
  }
  return { mode: "level", incomeMode };
};

/** The row's club, normalised to its canonical id regardless of which
 * column the dump carried it in. Empty in a level-mode row, which pinned no
 * club at all. */
const clubIdOf = (row: DumpKeyFields): string => {
  if (row.clubId) return row.clubId;
  if (row.klub) return clubIdForShortName(row.klub);
  return "";
};

/**
 * The identity of one cell within a dump. In either club mode the level is
 * deliberately left out and the row's club is normalised to an id: a club
 * already names its level, and keying on the raw column would fail to pair a
 * schema-4 short-name dump against a schema-5 id dump of the same career.
 */
export const cellKeyOf = (row: DumpKeyFields, identity: DumpIdentity): string =>
  CLUB_MODES.has(identity.mode)
    ? `${row.incomeMode}\0${clubIdOf(row)}\0${row.polityka}`
    : `${row.poziom}\0${row.polityka}`;

/** The full row identity, used to catch a dump that contains one career
 * twice - which would quietly weight it double in every aggregate. */
export const rowKeyOf = (row: DumpKeyFields & { seed: number }, identity: DumpIdentity): string =>
  `${cellKeyOf(row, identity)}\0${row.seed}`;

export const assertComparable = (before: DumpIdentity, after: DumpIdentity): void => {
  const beforeIsClub = CLUB_MODES.has(before.mode);
  const afterIsClub = CLUB_MODES.has(after.mode);
  if (beforeIsClub !== afterIsClub) {
    throw new Error(
      `Cannot pair a ${before.mode}-mode dump with a ${after.mode}-mode one: their rows are not the same careers`
    );
  }
  if (before.incomeMode !== after.incomeMode) {
    throw new Error(
      `Cannot pair a "${before.incomeMode}" dump with a "${after.incomeMode}" one: they were run under different economies`
    );
  }
};
