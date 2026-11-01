import type { Dispatch } from "react";
import type { GameState, GameAction } from "../../data/types";
import { pluralPl, POINT_FORMS } from "../../logic/format";
import { SectionHeading } from "../components/section-heading";
import { StickyActionBar } from "../components/sticky-action-bar";
import { TopBar } from "../components/top-bar";

/** Mirrors prototype's faza==="epilog" branch :1129-1161. */
export const EpilogueScreen = ({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}) => {
  const s = state.epilog[state.epilogIdx];
  if (!s) return null;

  return (
    <>
      <TopBar prawa={`Sezon ${s.nr} · z boku`} club={state.club ?? undefined} />
      <main className="dd-wrap dd-screen-content dd-epilogue-content">
        <SectionHeading title={`Sezon ${s.nr}`} meta="bez twojego wpływu" tabIndex={-1} />
        <section className="dd-round-summary dd-epilogue-summary" aria-label="Wynik sezonu">
          <strong>{s.miejsce}. miejsce</strong>
          <span>{pluralPl(s.pkt, POINT_FORMS)}</span>
        </section>
        <SectionHeading title="Co wydarzyło się w klubie" />
        <div className="dd-transfer-log dd-epilogue-headlines">
          {s.naglowki.map((headline) => (
            <p key={headline.kind}>{headline.text}</p>
          ))}
        </div>
      </main>
      <StickyActionBar label="Przejście do kolejnego sezonu epilogu">
        <button
          type="button"
          className="dd-action-primary"
          data-dd-action="dalej"
          onClick={() => dispatch({ type: "ADVANCE" })}
        >
          {state.epilogIdx < state.epilog.length - 1 ? "Następny sezon" : "Podsumowanie"}
        </button>
      </StickyActionBar>
    </>
  );
};
