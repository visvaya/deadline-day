import { useEffect, useState } from "react";

import { SectionHeading } from "./section-heading";

/** The display mode a browser reports for its own full screen (F11) as well as for the page's. */
const FULLSCREEN_QUERY = "(display-mode: fullscreen)";

const matchesFullscreen = (): boolean => window.matchMedia?.(FULLSCREEN_QUERY).matches ?? false;

/** Whether the game fills the screen, and whether that is its own full screen, which it can leave. */
const useFullscreen = (): { on: boolean; own: boolean } => {
  const [own, setOwn] = useState(() => document.fullscreenElement !== null);
  const [reported, setReported] = useState(matchesFullscreen);
  useEffect(() => {
    const onChange = () => {
      setOwn(document.fullscreenElement !== null);
      setReported(matchesFullscreen());
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
 * Android and iPad. iPhone Safari offers no full screen to pages, so there the section is not shown. A
 * page can leave only the full screen it asked for itself; the browser's own (F11) is left with F11.
 */
export const FullscreenToggle = () => {
  const fullscreen = useFullscreen();
  const [browserNote, setBrowserNote] = useState(false);
  if (!document.fullscreenEnabled) return null;

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
    <section aria-labelledby="screen-heading">
      <SectionHeading id="screen-heading" title="Ekran" />
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
          Ten pełny ekran włączyła przeglądarka. Wyłączysz go klawiszem F11.
        </p>
      )}
    </section>
  );
};
