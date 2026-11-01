import type { Formation, Market } from "../../data/types";
import { MarketPanel } from "./market-panel";
import { SectionHeading } from "./section-heading";

export const MarketAnomaliesSection = ({
  rynek,
  formation,
  meta,
}: {
  rynek: Market;
  formation: Formation;
  meta?: string;
}) => (
  <>
    <SectionHeading title="Anomalie rynkowe" meta={meta} />
    <MarketPanel rynek={rynek} formation={formation} />
    <p className="dd-note">
      Nadpodaż oznacza tańsze zakupy. Nadpopyt podnosi ceny i zwiększa szansę na ofertę za twojego
      zawodnika.
    </p>
  </>
);
