import type { OfferType } from "../../data/types";
import { CZAS_DODATKOWY, MAX_PRZECIAGNIEC } from "../../data/balance";
import { money } from "../../logic/format";
import { StickyActionBar } from "./sticky-action-bar";

export const ActionBar = ({
  offerType,
  price,
  wage,
  stalls,
  timerEnabled,
  canTake,
  onTake,
  onHaggle,
  onStall,
  onPass,
}: {
  offerType: OfferType;
  price: number;
  wage: number;
  stalls: number;
  timerEnabled: boolean;
  canTake: boolean;
  onTake: () => void;
  onHaggle: () => void;
  onStall: () => void;
  onPass: () => void;
}) => {
  const isSale = offerType === "SPRZEDAZ";
  const isFreeAgent = offerType === "WOLNY";
  const isExtension = offerType === "PRZEDLUZENIE";
  const takeLabel = isSale
    ? "Sprzedaj"
    : isFreeAgent
      ? "Podpisz kontrakt"
      : isExtension
        ? "Przedłuż kontrakt"
        : "Bierz";
  const takeDetail = isSale
    ? `Wpływ ${money(price)}. Z płac zejdzie ${money(wage)}/rok`
    : isExtension
      ? `Płaca ${money(price)}/rok do końca gry`
      : `${price === 0 ? "Bez odstępnego" : `Odstępne ${money(price)}`}. Płaca ${money(wage)}/rok`;
  const haggleDetail = isSale
    ? "Losowo: wyższa kwota transferu albo oferta przepada"
    : isFreeAgent
      ? "Losowo: niższa płaca albo wybiera inny klub"
      : isExtension
        ? "Losowo: niższa płaca albo odchodzi od razu"
        : "Losowo: niższa kwota transferu, niższa płaca albo oferta przepada";
  const stallDetail = isSale
    ? `+${CZAS_DODATKOWY} s, ale kwota spada · ${stalls} z ${MAX_PRZECIAGNIEC}`
    : isExtension
      ? `+${CZAS_DODATKOWY} s, ale żądanie rośnie · ${stalls} z ${MAX_PRZECIAGNIEC}`
      : `+${CZAS_DODATKOWY} s, ale drożej na stałe · ${stalls} z ${MAX_PRZECIAGNIEC}`;
  const passLabel = isSale ? "Zatrzymaj zawodnika" : isExtension ? "Nie przedłużaj" : "Pas";

  return (
    <StickyActionBar label="Decyzja w sprawie oferty">
      <button
        type="button"
        className="dd-action-primary"
        data-dd-action="bierz"
        disabled={!canTake}
        onClick={onTake}
      >
        {takeLabel}
        <small>{takeDetail}</small>
      </button>
      <div className="dd-action-secondary-row">
        <button
          type="button"
          className="dd-action-secondary"
          data-dd-action="targ"
          onClick={onHaggle}
        >
          Targuj się
          <small>{haggleDetail}</small>
        </button>
        {timerEnabled && (
          <button
            type="button"
            className="dd-action-secondary"
            data-dd-action="czas"
            onClick={onStall}
            disabled={stalls >= MAX_PRZECIAGNIEC}
          >
            Przeciągnij
            <small>{stalls >= MAX_PRZECIAGNIEC ? "Limit wykorzystany" : stallDetail}</small>
          </button>
        )}
      </div>
      <button type="button" className="dd-action-pass" data-dd-action="pas" onClick={onPass}>
        {passLabel}
      </button>
    </StickyActionBar>
  );
};
