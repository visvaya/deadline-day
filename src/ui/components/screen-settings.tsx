import { useEffect, useRef, useState } from "react";

import { SectionHeading } from "./section-heading";

/** The display mode a browser reports for its own full screen (F11) as well as for the page's. */
const FULLSCREEN_QUERY = "(display-mode: fullscreen)";
/** A finger is the main pointer: there the system closes apps, and a page cannot close its window. */
const TOUCH_QUERY = "(pointer: coarse)";
/** How long a refused window.close() is given before the player is told how to close the tab. */
const QUIT_NOTE_AFTER_MS = 300;

const matches = (query: string): boolean => window.matchMedia?.(query).matches ?? false;

/** Whether the game fills the screen, and whether that is its own full screen, which it can leave. */
const useFullscreen = (): { on: boolean; own: boolean } => {
  const [own, setOwn] = useState(() => document.fullscreenElement !== null);
  const [reported, setReported] = useState(() => matches(FULLSCREEN_QUERY));
  useEffect(() => {
    const onChange = () => {
      setOwn(document.fullscreenElement !== null);
      setReported(matches(FULLSCREEN_QUERY));
    };
    const query = window.matchMedia?.(FULLSCREEN_QUERY);
    document.addEventListener("fullscreenchange", onChange);
    query?.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      query?.removeEventListener("change", onChange);
    };
  }, []);
  return { on: own || reported, own };
};

/**
 * Full screen, where the browser lets a page ask for it: desktop browsers and installed desktop apps,
 * Android and iPad (iPhone Safari has offered pages none). A page can leave only the full screen it asked
 * for itself; the browser's own (F11, Ctrl+Cmd+F on a Mac) is left with that key.
 */
const FullscreenCard = () => {
  const fullscreen = useFullscreen();
  const [browserNote, setBrowserNote] = useState(false);

  const toggle = () => {
    if (fullscreen.on && !fullscreen.own) {
      setBrowserNote(true);
      return;
    }
    setBrowserNote(false);
    const request = fullscreen.own
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    request.catch(() => undefined);
  };

  return (
    <>
      <button
        type="button"
        className={`dd-setup-choice${fullscreen.on ? " is-selected" : ""}`}
        data-dd-action="pelny-ekran"
        aria-pressed={fullscreen.on}
        onClick={toggle}
      >
        <span className="dd-setup-choice-title">
          <strong>Pełny ekran</strong>
        </span>
        <span className="dd-setup-choice-description">
          Gra zajmuje cały ekran, bez pasków przeglądarki. Wyłączysz go tym samym przyciskiem.
        </span>
        {/* Both states written out, so the card reads as a switch and keeps its height. */}
        <span className={`dd-setup-choice-state${fullscreen.on ? "" : " is-off"}`}>
          {fullscreen.on ? "włączony" : "wyłączony"}
        </span>
      </button>
      {browserNote && fullscreen.on && (
        <p className="dd-note" role="status">
          Ten pełny ekran włączyła przeglądarka. Wyłączysz go klawiszem F11{" "}
          {"(na Macu Ctrl+Cmd+F)."}
        </p>
      )}
    </>
  );
};

/**
 * Closes the game's window. A browser lets a page do that only for a window it has nowhere to go back in
 * (the installed game on a computer, a tab opened by a script); elsewhere it ignores the call, and after a
 * moment the player is told how to close the tab. The career is saved after every decision.
 */
const QuitCard = () => {
  const [refused, setRefused] = useState(false);
  const noteRef = useRef<HTMLParagraphElement>(null);
  // The note takes the focus, so it is not missed: the eyes are on the button that was just pressed.
  useEffect(() => {
    if (refused) noteRef.current?.focus();
  }, [refused]);

  const quit = () => {
    window.close();
    window.setTimeout(() => setRefused(true), QUIT_NOTE_AFTER_MS);
  };

  return (
    <>
      <button type="button" className="dd-setup-choice" data-dd-action="wylacz-gre" onClick={quit}>
        <span className="dd-setup-choice-title">
          <strong>Wyłącz grę</strong>
        </span>
        <span className="dd-setup-choice-description">
          Zamyka okno gry. Kariera jest zapisana po ostatniej decyzji.
        </span>
      </button>
      {refused && (
        <p className="dd-note" role="status" tabIndex={-1} ref={noteRef}>
          Gra nie może sama zamknąć tej karty. Zamknij ją krzyżykiem albo klawiszami Ctrl+W{" "}
          {"(na Macu Cmd+W)."}
        </p>
      )}
    </>
  );
};

/** The start screen's "Okno gry" section: what each browser allows, and nothing where it allows neither. */
export const ScreenSettings = () => {
  const fullscreen = document.fullscreenEnabled;
  const quit = !matches(TOUCH_QUERY);
  if (!fullscreen && !quit) return null;
  return (
    <section aria-labelledby="screen-heading">
      <SectionHeading id="screen-heading" title="Okno gry" />
      <div className="dd-setup-choice-list">
        {fullscreen && <FullscreenCard />}
        {quit && <QuitCard />}
      </div>
    </section>
  );
};
