import type { ClubRecord, EuropeanCup } from "../../data/types";
import { ClubHeading } from "./club-heading";

export const TopBar = ({
  prawa,
  club,
  cup,
}: {
  prawa: string;
  club?: ClubRecord;
  cup?: EuropeanCup | null;
}) =>
  club ? (
    <header className="dd-club-bar">
      <ClubHeading club={club} details={prawa} cup={cup} />
    </header>
  ) : (
    <header className="dd-pasek">
      <span>DEADLINE DAY</span>
      <span>{prawa}</span>
    </header>
  );
