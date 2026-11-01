import type { Formation, Market } from "../../data/types";
import { DragScroller } from "./drag-scroller";

const LABELS = {
  obfity: { label: "nadpodaż", className: "is-positive" },
  pusty: { label: "niedobór", className: "is-negative" },
} as const;

export const MarketPanel = ({ rynek, formation }: { rynek: Market; formation: Formation }) => {
  const anomalies = formation.pozycje.filter((position) => rynek[position.kod] !== "spokoj");

  return (
    // Scrolling, edge fades, mouse dragging and arrow keys all come from
    // DragScroller, shared with the squad's formation lines. This panel used
    // to move a translated list behind an overflow:hidden window, which drove
    // fine with a mouse but replaced touch momentum and rubber-band bounce
    // with a rigid drag - the two strips felt like different apps.
    <DragScroller
      label="Anomalie rynkowe, przewijana lista"
      className="dd-market-scroll"
      shellClassName="dd-market-scroll-shell"
    >
      <ul className="dd-market-anomalies" aria-label="Anomalie rynkowe">
        {anomalies.length ? (
          anomalies.map((position) => {
            const state = rynek[position.kod];
            const detail = LABELS[state as keyof typeof LABELS];
            return (
              <li key={position.kod}>
                {position.kod} <strong className={detail.className}>{detail.label}</strong>
              </li>
            );
          })
        ) : (
          <li>Rynek spokojny na wszystkich pozycjach</li>
        )}
      </ul>
    </DragScroller>
  );
};
