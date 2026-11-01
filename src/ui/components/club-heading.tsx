import type { ClubRecord, EuropeanCup } from "../../data/types";
import { EUROPEAN_CUP_NAMES } from "../european-cup-names";

const clubMonogram = (club: ClubRecord): string =>
  club.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const ClubHeading = ({
  club,
  details,
  cup,
}: {
  club: ClubRecord;
  details?: string;
  /** Shown as a plain word, not a color - design-system.md reserves the
   * colored badge for the league table only. */
  cup?: EuropeanCup | null;
}) => (
  <div className="dd-club-heading">
    <span className="dd-club-crest" aria-hidden="true">
      <svg viewBox="0 0 24 28" focusable="false">
        <path d="M12 1 22 4.2v9.3c0 6.2-4.1 10.6-10 13.4C6.1 23.1 2 18.7 2 12.5V4.2z" />
        <text x="12" y="15" textAnchor="middle">
          {clubMonogram(club)}
        </text>
      </svg>
    </span>
    <div>
      <h1 tabIndex={-1}>{club.name}</h1>
      {(details || cup) && (
        <p>{[details, cup ? EUROPEAN_CUP_NAMES[cup] : null].filter(Boolean).join(" · ")}</p>
      )}
    </div>
  </div>
);
