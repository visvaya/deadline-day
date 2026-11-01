import { useEffect, useRef, type Dispatch, type KeyboardEvent } from "react";
import type { GameAction } from "../../data/types";

/** Mirrors prototype's Restart :644-671. */
export const RestartDialog = ({
  pytamRestart: isConfirming,
  dispatch,
}: {
  pytamRestart: boolean;
  dispatch: Dispatch<GameAction>;
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const restartButtonRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingRef = useRef(false);

  useEffect(() => {
    if (isConfirming) {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      sectionRef.current?.scrollIntoView?.({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
      cancelButtonRef.current?.focus({ preventScroll: true });
    } else if (wasConfirmingRef.current) {
      restartButtonRef.current?.focus();
    }
    wasConfirmingRef.current = isConfirming;
  }, [isConfirming]);

  const cancelOnEscape = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    dispatch({ type: "CANCEL_RESTART" });
  };

  return isConfirming ? (
    <section
      ref={sectionRef}
      className="dd-restart-confirmation"
      role="group"
      aria-labelledby="restart-confirmation-title"
      onKeyDown={cancelOnEscape}
    >
      <p id="restart-confirmation-title">Porzucić karierę i zacząć od nowa?</p>
      <button
        type="button"
        className="dd-restart danger"
        data-dd-action="restart-tak"
        onClick={() => dispatch({ type: "CONFIRM_RESTART" })}
      >
        Tak, porzuć tę karierę
      </button>
      <button
        ref={cancelButtonRef}
        type="button"
        className="dd-restart"
        data-dd-action="restart-nie"
        onClick={() => dispatch({ type: "CANCEL_RESTART" })}
      >
        Nie, wracam do gry
      </button>
    </section>
  ) : (
    <button
      ref={restartButtonRef}
      type="button"
      className="dd-restart"
      data-dd-action="restart-pytaj"
      onClick={() => dispatch({ type: "ASK_RESTART" })}
    >
      Porzuć karierę i zacznij od nowa
    </button>
  );
};
