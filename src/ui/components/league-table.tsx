import type { EuropeanCup, EuropeanSpot, LeagueStanding } from "../../data/types";
import { RELEGATED_COUNT } from "../../data/balance";

const PREVIEW_SIZE = 5;
/** First position in the drop zone, counted from the bottom of whatever
 * table is being rendered rather than assumed - the league is eighteen clubs
 * today, and hardcoding 17 was how "two go down" survived in the UI after the
 * engine moved to three. */
const relegationFrom = (tableSize: number): number => tableSize - RELEGATED_COUNT + 1;

const previewRows = (rows: readonly LeagueStanding[]): Array<[LeagueStanding, number]> => {
  const playerIndex = rows.findIndex((row) => row.isPlayer);
  const centeredStart = playerIndex < 0 ? 0 : playerIndex - Math.floor(PREVIEW_SIZE / 2);
  const start = Math.max(0, Math.min(centeredStart, rows.length - PREVIEW_SIZE));
  return rows.slice(start, start + PREVIEW_SIZE).map((row, offset) => [row, start + offset]);
};

/** design-system.md: the only place a color means competition membership,
 * not a value - so it only ever shows as a small badge in the table, never
 * in a sentence. */
const CupBadge = ({ cup }: { cup: EuropeanCup }) => (
  <span className={`dd-cup-badge dd-cup-badge--${cup.toLowerCase()}`}>{cup}</span>
);

const RelegationBadge = () => <span className="dd-cup-badge dd-cup-badge--spadek">spadek</span>;

const TableRows = ({
  rows,
  spots,
  final,
  tableSize,
}: {
  rows: readonly [LeagueStanding, number][];
  spots?: readonly EuropeanSpot[];
  final: boolean;
  /** Size of the WHOLE table, not of the slice being rendered: the preview
   * shows five rows around the player, so counting the drop zone off the
   * slice would put it in the wrong place. */
  tableSize: number;
}) => (
  <tbody>
    {rows.map(([row, index]) => {
      const position = index + 1;
      const spot = spots?.find((s) => s.klub === row.club);
      return (
        <tr key={row.club} className={row.isPlayer ? "ja" : undefined}>
          <td className="dd-league-position">{position}.</td>
          <td className="dd-league-club">
            <span className="dd-league-club-name">{row.club}</span>
            {spot && <CupBadge cup={spot.puchar} />}
            {final && !spot && position >= relegationFrom(tableSize) && <RelegationBadge />}
          </td>
          <td className="dd-league-goals">
            {row.goalsFor}:{row.goalsAgainst}
          </td>
          <td className="dd-league-points">{row.points}</td>
        </tr>
      );
    })}
  </tbody>
);

const LeagueTableMarkup = ({
  rows,
  caption,
  className,
  spots,
  final,
  tableSize,
}: {
  rows: readonly [LeagueStanding, number][];
  caption: string;
  className: string;
  spots?: readonly EuropeanSpot[];
  final: boolean;
  tableSize: number;
}) => (
  <table className={className} aria-label={caption}>
    <thead>
      <tr>
        <th scope="col" className="dd-league-position">
          #
        </th>
        <th scope="col" className="dd-league-club">
          Klub
        </th>
        <th scope="col" className="dd-league-goals">
          Bramki
        </th>
        <th scope="col" className="dd-league-points">
          Pkt
        </th>
      </tr>
    </thead>
    <TableRows rows={rows} spots={spots} final={final} tableSize={tableSize} />
  </table>
);

export const LeagueTable = ({
  rows,
  caption,
  spots,
  final,
}: {
  rows: readonly LeagueStanding[];
  caption: string;
  /** European-cup assignment for this table's season, shown as a small
   * badge next to the club name. Only the season-end screen has this data -
   * the half-season table has no assignment yet, so it renders unbadged. */
  spots?: readonly EuropeanSpot[];
  /** Whether these standings are the ones that decide anything.
   *
   * The relegation badge used to render off the position alone, so the
   * half-season table told four clubs they were going down - and measured
   * over 400 seasons, 44% of the clubs sitting there in December finish
   * outside the zone. A badge that is wrong nearly half the time is worse
   * than no badge: it reads as a verdict rather than a standing. */
  final?: boolean;
}) => {
  const indexedRows = rows.map((row, index): [LeagueStanding, number] => [row, index]);
  return (
    <div className="dd-league-table">
      <details>
        <summary>
          <span className="when-closed">Pokaż całą tabelę</span>
          <span className="when-open">Zwiń tabelę</span>
        </summary>
        <LeagueTableMarkup
          rows={indexedRows}
          caption={caption}
          className="dd-league-table-full"
          spots={spots}
          final={final ?? false}
          tableSize={rows.length}
        />
      </details>
      <LeagueTableMarkup
        rows={previewRows(rows)}
        caption={caption}
        className="dd-league-table-preview"
        spots={spots}
        final={final ?? false}
        tableSize={rows.length}
      />
    </div>
  );
};
