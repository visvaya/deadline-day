import { useGameUpdate, type UpdateStatus } from "../game-update";

const STATUS_TEXT: Record<UpdateStatus, string> = {
  idle: "",
  checking: "Sprawdzam…",
  latest: "Masz najnowszą wersję.",
  downloading: "Jest nowa wersja gry. Pobieram ją.",
  waiting:
    "Nowa wersja gry jest gotowa. Zainstaluj ją teraz albo zamknij grę całkowicie i uruchom ją ponownie.",
  installing: "Instaluję…",
  failed: "Nie udało się zaktualizować gry: spróbuj później.",
  unreachable: "Brak połączenia: nie można sprawdzić.",
  saving: "Gra jeszcze zapisuje się na tym urządzeniu.",
  unavailable: "Ta przeglądarka nie pozwala sprawdzić.",
};

/**
 * Looks for a new release of the game and installs a waiting one at once (the page reloads). Sits under the
 * notice that an update may drop the career in progress, which is what installing one now can do.
 */
export const UpdateCheck = () => {
  const { supported, status, check, install } = useGameUpdate();
  if (!supported) return null;
  const ready = status === "waiting" || status === "installing";
  const busy = status === "checking" || status === "installing";
  return (
    <>
      <button
        type="button"
        className="dd-changelog-toggle"
        data-dd-action={ready ? "zainstaluj-aktualizacje" : "sprawdz-aktualizacje"}
        aria-disabled={busy}
        onClick={() => {
          if (busy) return;
          if (ready) install();
          else void check();
        }}
      >
        {ready ? "Zainstaluj teraz" : "Sprawdź aktualizację"}
      </button>
      <p className="dd-note" aria-live="polite">
        {STATUS_TEXT[status]}
      </p>
    </>
  );
};
