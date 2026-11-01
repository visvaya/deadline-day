import type { ClubRecord, EuropeanCup, LeagueMembership, Player } from "../../data/types";
import type { SeasonForecast } from "../../logic/finance";
import { Hud } from "./hud";
import { TopBar } from "./top-bar";

/** The TopBar+Hud pair every gameplay screen opens with. Pulled out once
 * both needed the same `cup` prop, which would otherwise duplicate the same
 * two-component block across four screens. */
export const ScreenHeader = ({
  prawa,
  club,
  cup,
  squad,
  cash,
  forecast,
  membership,
  currentOffer,
  totalOffers,
}: {
  prawa: string;
  club: ClubRecord;
  cup: EuropeanCup | null;
  squad: readonly Player[];
  cash: number;
  /** The season's frozen income forecast, straight out of the state. */
  forecast: SeasonForecast;
  membership: LeagueMembership;
  currentOffer?: number;
  totalOffers?: number;
}) => {
  // A relegated club is no longer in the top flight, so there is no league
  // season left to forecast income from.
  const inTopFlight = membership.clubs.some(
    (member) => member.clubId === club.clubId && member.tier === "league"
  );
  return (
    <>
      <TopBar prawa={prawa} club={club} cup={cup} />
      <Hud
        squad={squad}
        cash={cash}
        clubId={club.clubId}
        forecast={inTopFlight ? forecast : null}
        currentOffer={currentOffer}
        totalOffers={totalOffers}
      />
    </>
  );
};
