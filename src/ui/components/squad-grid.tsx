import { type ReactNode, useEffect, useRef } from "react";

import type { Formation, OvrChange, Player, PositionCode, PositionGroup } from "../../data/types";
import { grupaPoz } from "../../data/positions";
import { xiInOrder, substitutes } from "../../logic/squad";
import { DragScroller } from "./drag-scroller";
import { Tile } from "./tile";
import type { SeasonChangePeriod } from "./player-tile-utils";

const LINE_LABEL: Record<PositionGroup, string> = {
  BR: "Bramka",
  OBR: "Obrona",
  POM: "Pomoc",
  ATK: "Atak",
};

const LINE_ORDER: readonly PositionGroup[] = ["BR", "OBR", "POM", "ATK"];

/** One line of the pitch. Scrolling, edge fades and mouse dragging all come
 * from DragScroller, shared with the market anomaly chips so both strips
 * behave identically. */
const FormationLine = ({ label, children }: { label: string; children: ReactNode }) => {
  const line = useRef<HTMLDivElement>(null);

  // Bring the highlighted position into the middle when the line opens. The
  // squad drawer exists to answer "where would this offer play", and on a
  // five-man midfield the answer was as likely as not to be off-screen.
  // Runs once per mount: the drawer is mounted fresh for each offer, and
  // re-centring on every render would fight the player's own scrolling.
  useEffect(() => {
    const target = line.current?.querySelector<HTMLElement>(".dd-player-tile.is-highlighted");
    const el = target?.parentElement;
    if (!el || !target) return;
    el.scrollLeft = target.offsetLeft - (el.clientWidth - target.clientWidth) / 2;
  }, []);

  return (
    <div ref={line}>
      <DragScroller label={label} className="dd-formation-line" shellClassName="dd-formation-shell">
        {children}
      </DragScroller>
    </div>
  );
};

export const SquadGrid = ({
  squad,
  formation,
  highlightedPosition,
  seasonalChanges,
  changePeriod,
  onOpenPosition,
}: {
  squad: readonly Player[];
  formation: Formation;
  highlightedPosition: PositionCode | null;
  seasonalChanges: OvrChange;
  changePeriod: SeasonChangePeriod;
  /** Omitted only where there is nowhere to open reports into. Passing it is
   * what turns the tiles into buttons - see Tile. */
  onOpenPosition?: (_position: PositionCode) => void;
}) => {
  const starters = xiInOrder(squad, formation);
  const bench = substitutes(squad, formation);
  const firstTileByPosition = new Map<PositionCode, number>();
  starters.forEach((player, index) => {
    if (!firstTileByPosition.has(player.poz)) firstTileByPosition.set(player.poz, index);
  });
  const lines = LINE_ORDER.map((line) => ({
    label: LINE_LABEL[line],
    players: starters.filter((player) => grupaPoz(player.poz) === line),
  })).filter((line) => line.players.length > 0);

  return (
    <section className="dd-formation" aria-label={`Ustawienie 1-${formation.id}`}>
      {lines.map((line) => (
        <div className="dd-formation-group" key={line.label}>
          <div className="dd-formation-heading">
            <span>{line.label}</span>
          </div>
          <FormationLine label={`${line.label}, przewijana linia`}>
            {line.players.map((player) => {
              const index = starters.indexOf(player);
              const positionBench =
                firstTileByPosition.get(player.poz) === index
                  ? bench.filter((substitute) => substitute.poz === player.poz)
                  : [];
              return (
                <Tile
                  key={player.id}
                  player={player}
                  substitutes={positionBench}
                  highlighted={highlightedPosition === player.poz}
                  seasonalChanges={seasonalChanges}
                  changePeriod={changePeriod}
                  onOpenPosition={onOpenPosition}
                />
              );
            })}
          </FormationLine>
        </div>
      ))}
    </section>
  );
};
