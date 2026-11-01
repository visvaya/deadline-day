import { Component, type ReactNode } from "react";
import { clearGameSave } from "../game-save";
import { clearSetupDraft } from "../setup-draft";

/**
 * App-level error boundary: an exception while rendering used to leave a
 * blank white page with no way forward. It is the one class component in
 * src/, allowed because React offers error boundaries only as classes
 * (class exception, oxlint.config.ts CLASS_SELECTORS).
 *
 * Two ways back, because a reload alone cannot always help: the autosave is
 * written after every decision, so if the saved state itself is what fails
 * to render, reloading resumes straight into the same crash. Discarding the
 * save is the player's explicit choice, never automatic.
 */
const CRASH_COPY = {
  title: "Coś poszło nie tak",
  body: "Gra natrafiła na błąd i nie może wyświetlić tego ekranu. Kariera jest zapisana po ostatniej decyzji, więc zwykle wystarczy wczytać grę ponownie.",
  reload: "Wczytaj ponownie",
  resetHint:
    "Jeśli błąd wraca po każdym wczytaniu, możesz porzucić zapis. Tej kariery nie da się wtedy odzyskać.",
  reset: "Porzuć zapis i zacznij od nowa",
} as const;

type Props = {
  readonly children?: ReactNode;
  /** Injected in tests; the default reloads the page. */
  readonly onReload?: () => void;
};

type State = { readonly failed: boolean };

const reloadPage = (): void => window.location.reload();

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    // React itself reports the error to the console; nothing to add here.
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const reload = this.props.onReload ?? reloadPage;
    const discardAndReload = (): void => {
      clearGameSave();
      clearSetupDraft();
      reload();
    };

    return (
      <main className="dd-root dd-crash">
        <div className="dd-wrap">
          <h1 className="dd-crash-title">{CRASH_COPY.title}</h1>
          <p role="alert">{CRASH_COPY.body}</p>
          <button type="button" className="dd-btn tak" onClick={reload}>
            {CRASH_COPY.reload}
          </button>
          <p className="dd-crash-hint">{CRASH_COPY.resetHint}</p>
          <button type="button" className="dd-restart" onClick={discardAndReload}>
            {CRASH_COPY.reset}
          </button>
        </div>
      </main>
    );
  }
}
