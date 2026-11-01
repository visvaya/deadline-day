import type { Player } from "../../data/types";
import { pl, znak } from "../../logic/format";
import { averageWage } from "../../logic/wages";
import { annualForecastBreakdown, type SeasonForecast } from "../../logic/finance";
import { InfoPopover } from "./info-popover";
import { boardSharePercent } from "../board-share";

/**
 * What the forecast number IS, said on the number itself.
 *
 * It opens with the definition rather than with the rule, and that ordering
 * is the whole point. "Zarząd przekazuje 30% wyniku" states a fact about the
 * club; on its own it leaves a reader free to assume the figure beside it is
 * the result and the board takes its share later - which is the exact
 * misreading this note exists to prevent. The term next to the number stays
 * "prognoza", because `design-system.md` names the HUD's four labels and the
 * two-word version overflowed its cell at 360 px, so this sentence is the
 * only place the quantity gets named. It is never hidden: the popover panel
 * is a `role="note"` that sits in the `dl`'s reading order whether or not it
 * is open, so a screen reader hears it right after the term.
 *
 * The second clause is the older warning, still needed: the prize money was
 * estimated before the summer window, so after selling a star the figure
 * still assumes the same European receipts even though the campaign just got
 * weaker.
 */
export const FORECAST_NOTE = `Ta liczba to zmiana budżetu na transfery – zarząd przekazuje na nie ${boardSharePercent()} wyniku operacyjnego. Premie oszacowane na początku sezonu, a transfery aktualizują płace.`;

export const Hud = ({
  squad,
  cash,
  clubId,
  forecast: frozen,
  currentOffer,
  totalOffers,
}: {
  squad: readonly Player[];
  cash: number;
  clubId: string;
  /** Null once the club is out of the top flight: there is no league season
   * left to forecast, and the season-end screen still renders behind that -
   * the only place it can happen, because the tenure ends there. */
  forecast: SeasonForecast | null;
  currentOffer?: number;
  totalOffers?: number;
}) => {
  // The HUD shows the BUDGET change, because that is the player's tool of
  // work - the club's full operating result is on the market screen, where
  // there is room to show both. Still four numbers, not five.
  //
  // The TERM stays "prognoza". "prognoza budżetu" was tried and reverted on
  // 2026-09-12: at the 360 px reference width it overflowed its cell and
  // covered the offer counter beside it, and design-system.md names these
  // four labels. What the number is stays on the number, in FORECAST_NOTE,
  // and both halves are spelled out on the market and season-end screens.
  const forecast =
    frozen === null
      ? null
      : annualForecastBreakdown({ clubId, squad, forecast: frozen }).transferBudgetChange;
  // A <dl> cannot itself carry role="region" - it is outside the set of
  // roles HTML permits an element to override to, and forcing it strips the
  // dt/dd pairing an assistive technology infers from the list role, which
  // axe's "best-practice" ruleset flags as its own violations (aria-allowed-
  // role, then dlitem cascading from the broken pairing). The landmark lives
  // on the wrapper, which keeps the flex layout; the <dl> is
  // `display: contents` in styles.css, so its own children (the four number
  // cells) still become the wrapper's direct flex items.
  return (
    <div role="region" aria-label="Sytuacja klubu" className="dd-hud">
      <dl className="dd-hud-list">
        <div>
          <dt>kasa mln&nbsp;€</dt>
          <dd>{pl(cash)}</dd>
        </div>
        <div>
          <dt>śr. płaca/rok</dt>
          <dd>{pl(averageWage(squad))}</dd>
        </div>
        <div className="dd-hud-forecast">
          <dt>
            <span className="dd-hud-label">prognoza</span>
            <InfoPopover
              text={FORECAST_NOTE}
              label="Co oznacza prognoza budżetu"
              action="forecast-help"
              align="right"
            />
          </dt>
          <dd className={forecast !== null && forecast < 0 ? "is-negative" : "is-positive"}>
            {forecast === null ? (
              "–"
            ) : (
              <>
                {znak(forecast)}
                {pl(forecast)}
              </>
            )}
          </dd>
        </div>
        {currentOffer !== undefined && totalOffers !== undefined && (
          <div>
            <dt>oferta</dt>
            <dd>
              {currentOffer}/{totalOffers}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
};
