import { useGameUpdate, type UpdateStatus } from "../game-update";

const STATUS_TEXT: Record<UpdateStatus, string> = {
  idle: "",
  checking: "Sprawdzam…",
  latest: "Masz najnowszą wersję.",
  downloading: "Jest nowa wersja gry. Pobieram ją.",
  waiting: "Nowa wersja gry jest gotowa. Partia w toku może po aktualizacji przepaść.",
  installing: "Instaluję…",
  failed: "Nie udało się zaktualizować gry: spróbuj później.",
  unreachable: "Brak połączenia: nie można sprawdzić.",
  saving: "Gra jeszcze zapisuje się na tym urządzeniu.",
  unavailable: "Ta przeglądarka nie pozwala sprawdzić.",
};

/**
 * Looks for a new release of the game and installs a waiting one at once (the page reloads). Sits on the
 * version line of the start screen's header, after the version it is about; the status wraps below it.
 */
export const UpdateCheck = () => {
  const { supported, status, check, install } = useGameUpdate();
  if (!supported) return null;
  const ready = status === "waiting" || status === "installing";
  const busy = status === "checking" || status === "installing";
  return (
    <>
      <span aria-hidden="true">·</span>
      <button
        // A new element when the meaning changes: a click on "check" that lands just as a release turns
        // ready must not install it.
        key={ready ? "install" : "check"}
        type="button"
        className="dd-update-button"
        data-dd-action={ready ? "zainstaluj-aktualizacje" : "sprawdz-aktualizacje"}
        aria-disabled={busy}
        onClick={() => {
          if (busy) return;
          if (ready) install();
          else void check();
        }}
      >
        {ready ? "Zainstaluj nową wersję" : "Szukaj aktualizacji"}
      </button>
      <p className="dd-update-status" aria-live="polite">
        {STATUS_TEXT[status]}
      </p>
    </>
  );
};
