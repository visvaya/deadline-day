import { useEffect, useRef, useState, type Dispatch } from "react";
import { CHANGELOG, DEVELOPMENT_NOTICE, NEXT_UPDATE_NOTE } from "../../data/changelog";
import type { GameAction, ManagerIdentity } from "../../data/types";
import {
  randomManagerIdentity,
  validateManagerIdentityFields,
  type ManagerField,
  type ManagerFieldError,
} from "../../logic/manager-identity";
import {
  resolveActionBarMode,
  useIsActionBarCompactViewport,
  viewportDefaultActionBarMode,
} from "../action-bar-query";
import { AppHero } from "../components/app-hero";
import { SectionHeading } from "../components/section-heading";
import { StickyActionBar } from "../components/sticky-action-bar";
import { UpdateCheck } from "../components/update-check";
import { writeSetupDraftFields } from "../setup-draft";
import { at } from "../../logic/invariant";
import { useUiPreferences, type ActionBarMode } from "../ui-preferences";

/**
 * Step 1 of career setup: the manager types their name, then sets up timer,
 * action bar preference, archive and changelog - everything the old
 * `POZIOMY`-driven start screen carried besides the difficulty choice, which
 * the club screen (step 2) replaces. `Dalej` validates and normalises the
 * name, then hands it to `onContinue`, which `app.tsx` wires to `START_GAME`.
 */
export type ManagerScreenProps = {
  readonly initialManager: ManagerIdentity | null;
  readonly onContinue: (_manager: ManagerIdentity) => void;
  readonly timerWl: boolean;
  readonly dispatch: Dispatch<GameAction>;
  readonly onOpenArchive: () => void;
};

const FIELD_INPUT_ID: Record<ManagerField, string> = {
  firstName: "manager-first-name",
  lastName: "manager-last-name",
};

const FIELD_LABEL: Record<ManagerField, string> = {
  firstName: "Imię",
  lastName: "Nazwisko",
};

const FIELD_ERROR_ID: Record<ManagerField, string> = {
  firstName: "manager-first-name-error",
  lastName: "manager-last-name-error",
};

export const ManagerScreen = ({
  initialManager,
  onContinue,
  timerWl,
  dispatch,
  onOpenArchive,
}: ManagerScreenProps) => {
  const [firstName, setFirstName] = useState(initialManager?.firstName ?? "");
  const [lastName, setLastName] = useState(initialManager?.lastName ?? "");
  // Both fields' errors at once (owner decision) - an empty array means
  // no error, rather than `null`, so `errors.find(...)` reads the same
  // whether the form has never been submitted or was submitted and passed.
  const [errors, setErrors] = useState<readonly ManagerFieldError[]>([]);
  // A11y fix (2026-09-16, HIGH #3): "Losuj imię i nazwisko" filled both
  // inputs but moved focus nowhere and announced nothing - a sighted player
  // sees the fields change, a screen-reader user hears silence and has to
  // tab backwards through both fields to find out anything happened at all.
  // Chosen fix: a polite live region next to the button, not moving focus
  // into the first name field. Moving focus would work too, but it would
  // also drop the player mid-form with no memory of having just clicked
  // "Losuj" - they would have to infer it from the field contents changing,
  // exactly the sighted-only cue this fix exists to replace. A live region
  // states outright what happened ("Wylosowano: Jan Kowalski.") while
  // leaving focus on the button, so a player who dislikes the draw can press
  // it again immediately, and one who is happy with it can tab forward into
  // the still-focus-reachable fields in the normal reading order.
  const [randomAnnouncement, setRandomAnnouncement] = useState<string | null>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  /* Only the newest version is worth the vertical space on a phone; the rest
     stays one tap away. Not persisted - the start screen is short-lived. */
  const [changelogExpanded, setChangelogExpanded] = useState(false);
  const { actionBarMode, setActionBarMode } = useUiPreferences();
  const isCompactViewport = useIsActionBarCompactViewport();
  const viewportDefaultMode = viewportDefaultActionBarMode(isCompactViewport);
  const effectiveActionBarMode = resolveActionBarMode(actionBarMode, isCompactViewport);

  const refForField = (field: ManagerField) => (field === "firstName" ? firstNameRef : lastNameRef);

  // Setup-draft autosave (setup-draft.ts): merges the raw, not-yet-submitted
  // field text and the current step into whatever club-select-screen.tsx
  // may already have written, so a reload lands back on this exact text
  // instead of a blank form. Fires on every keystroke and on mount alike -
  // cheap (one small JSON blob), same trade-off ui-preferences.tsx already
  // makes for its own localStorage writes. Deliberately NOT gated on
  // `errors`/validity: this is a draft of what the player typed, not a
  // record of what passed validation.
  useEffect(() => {
    writeSetupDraftFields({ firstName, lastName, step: "manager" });
  }, [firstName, lastName]);

  useEffect(() => {
    writeSetupDraftFields({ timerWl });
  }, [timerWl]);

  const handleRandomize = (): void => {
    const identity = randomManagerIdentity();
    setFirstName(identity.firstName);
    setLastName(identity.lastName);
    setErrors([]);
    setRandomAnnouncement(`Wylosowano: ${identity.firstName} ${identity.lastName}.`);
  };

  const chooseTimer = (enabled: boolean): void => {
    if (timerWl !== enabled) dispatch({ type: "TOGGLE_TIMER" });
  };

  const handleContinue = (): void => {
    const result = validateManagerIdentityFields(firstName, lastName);
    if (!result.ok) {
      setErrors(result.errors);
      // `result.errors` is ordered firstName-then-lastName (see
      // validateManagerIdentityFields), so its first entry is always the
      // FIRST invalid field in reading order - focus moves there, never to
      // whichever field happened to be touched last.
      refForField(at(result.errors, 0, "manager identity validation error").field).current?.focus();
      return;
    }
    setErrors([]);
    onContinue(result.value);
  };

  const errorForField = (field: ManagerField): ManagerFieldError | undefined =>
    errors.find((error) => error.field === field);

  return (
    <>
      <AppHero />
      <main className="dd-setup-content">
        <div className="dd-wrap dd-setup-options">
          <section aria-labelledby="manager-heading">
            <SectionHeading id="manager-heading" title="Menedżer" meta="Krok 1 z 2" />
            <p className="dd-note">Jak chcesz nazwać swojego menedżera?</p>

            <div className="dd-manager-panel">
              <div className="dd-manager-form">
                {(["firstName", "lastName"] as const).map((field) => {
                  const fieldError = errorForField(field);
                  return (
                    <div className="dd-manager-field" key={field}>
                      <label htmlFor={FIELD_INPUT_ID[field]}>{FIELD_LABEL[field]}</label>
                      <input
                        id={FIELD_INPUT_ID[field]}
                        ref={refForField(field)}
                        type="text"
                        autoComplete={field === "firstName" ? "given-name" : "family-name"}
                        value={field === "firstName" ? firstName : lastName}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (field === "firstName") setFirstName(value);
                          else setLastName(value);
                        }}
                        aria-invalid={fieldError ? true : undefined}
                        aria-describedby={fieldError ? FIELD_ERROR_ID[field] : undefined}
                      />
                      {fieldError && (
                        <p id={FIELD_ERROR_ID[field]} className="dd-manager-error" role="alert">
                          {fieldError.message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="dd-manager-random"
                data-dd-action="losuj"
                onClick={(event) => {
                  // A11y fix (2026-09-16, focus-invariant audit): WebKit does
                  // not focus a button when it is clicked, unlike Chromium -
                  // the same quirk offer-card.tsx's squad trigger already
                  // works around. Without this, the "leaving focus on the
                  // button" design intent above (2026-09-16, HIGH #3) held
                  // in Chromium but silently failed in real Safari/iOS: a
                  // mouse or touch tap left focus on <body>, so the live
                  // region announcement below had nothing keyboard-reachable
                  // for a player to tab onward from.
                  event.currentTarget.focus();
                  handleRandomize();
                }}
              >
                Losuj imię i nazwisko
              </button>
              {/* A11y fix (2026-09-16, HIGH #3): always present in the DOM
                  (content empty until the first draw) rather than only
                  mounted once there is something to say - a screen reader
                  needs the live region to already exist before its content
                  changes to reliably announce that first change; an element
                  that appears and is filled in the same tick is not
                  guaranteed to be picked up. Visually hidden because the
                  fields themselves already show the draw to sighted
                  players - this is the non-visual equivalent of that same
                  information, not a second visible message. */}
              <p className="dd-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
                {randomAnnouncement ?? ""}
              </p>
            </div>
          </section>

          <section aria-labelledby="timer-heading">
            <SectionHeading id="timer-heading" title="Timer" />
            <div className="dd-setup-choice-list">
              <button
                type="button"
                className={`dd-setup-choice${timerWl ? " is-selected" : ""}`}
                data-dd-action="timer-toggle"
                data-timer-choice="on"
                aria-pressed={timerWl}
                onClick={() => chooseTimer(true)}
              >
                <span className="dd-setup-choice-title">
                  <strong>Włączony</strong>
                  <span>polecane</span>
                </span>
                <span className="dd-setup-choice-description">
                  15 sekund na każdą ofertę. Możesz przeciągnąć negocjacje, ale to kosztuje. Tak gra
                  się w Deadline Day.
                </span>
                {timerWl && <span className="dd-setup-choice-state">wybrano</span>}
              </button>
              <button
                type="button"
                className={`dd-setup-choice${timerWl ? "" : " is-selected"}`}
                data-dd-action="timer-toggle"
                data-timer-choice="off"
                aria-pressed={!timerWl}
                onClick={() => chooseTimer(false)}
              >
                <span className="dd-setup-choice-title">
                  <strong>Wyłączony</strong>
                </span>
                <span className="dd-setup-choice-description">
                  Bez pośpiechu, tyle czasu na decyzję, ile chcesz. Przycisk „Przeciągnij
                  negocjacje” znika, bo nie ma czego przeciągać.
                </span>
                {!timerWl && <span className="dd-setup-choice-state">wybrano</span>}
              </button>
            </div>
          </section>

          {/* Owner decision (2026-09-18): shown on every viewport now, not
              just compact ones - only the DEFAULT differs by viewport (see
              `viewportDefaultActionBarMode`), and that default has to stay
              live while nothing is stored yet, so both the "domyślnie" badge
              and which choice reads as selected are computed per render
              instead of baked into the choice list. */}
          <section aria-labelledby="action-bar-heading">
            <SectionHeading id="action-bar-heading" title="Pasek akcji" />
            <div className="dd-setup-choice-list">
              {(
                [
                  {
                    mode: "autoHide",
                    title: "Ukrywany podczas przewijania",
                    description:
                      "Pasek znika, gdy przewijasz w dół, i wraca przy przewijaniu w górę.",
                  },
                  {
                    mode: "alwaysVisible",
                    title: "Zawsze widoczny",
                    description: "Pasek pozostaje przy dolnej krawędzi ekranu przez całą grę.",
                  },
                ] satisfies Array<{ mode: ActionBarMode; title: string; description: string }>
              ).map((choice) => {
                const isSelected = effectiveActionBarMode === choice.mode;
                const isViewportDefault = viewportDefaultMode === choice.mode;
                return (
                  <button
                    type="button"
                    key={choice.mode}
                    className={`dd-setup-choice${isSelected ? " is-selected" : ""}`}
                    data-action-bar-choice={choice.mode}
                    aria-pressed={isSelected}
                    onClick={() => setActionBarMode(choice.mode)}
                  >
                    <span className="dd-setup-choice-title">
                      <strong>{choice.title}</strong>
                      {isViewportDefault && <span>domyślnie</span>}
                    </span>
                    <span className="dd-setup-choice-description">{choice.description}</span>
                    {isSelected && <span className="dd-setup-choice-state">wybrano</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="archive-heading">
            <SectionHeading id="archive-heading" title="Archiwum wyników" />
            <button
              type="button"
              className="dd-setup-choice"
              data-dd-action="archiwum"
              onClick={onOpenArchive}
            >
              <span className="dd-setup-choice-title">
                <strong>Zobacz archiwum wyników</strong>
              </span>
              <span className="dd-setup-choice-description">Twoje partie na tym urządzeniu.</span>
            </button>
          </section>

          <section aria-labelledby="changelog-heading">
            <SectionHeading id="changelog-heading" title="Historia zmian" meta={NEXT_UPDATE_NOTE} />
            <p className="dd-note">{DEVELOPMENT_NOTICE}</p>
            <UpdateCheck />
            <ul className="dd-changelog">
              {(changelogExpanded ? CHANGELOG : CHANGELOG.slice(0, 1)).map((entry) => (
                <li key={entry.version}>
                  <div className="dd-changelog-heading">
                    <strong>v{entry.version}</strong>
                    <span>{entry.date}</span>
                  </div>
                  <ul>
                    {entry.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            {CHANGELOG.length > 1 && (
              <button
                type="button"
                className="dd-changelog-toggle"
                data-dd-action="historia-zmian"
                aria-expanded={changelogExpanded}
                onClick={() => setChangelogExpanded((expanded) => !expanded)}
              >
                {changelogExpanded
                  ? "Zwiń starsze wersje"
                  : `Pokaż starsze wersje (${CHANGELOG.length - 1})`}{" "}
                <span aria-hidden="true">{changelogExpanded ? "▴" : "▾"}</span>
              </button>
            )}
          </section>
        </div>
      </main>

      <StickyActionBar label="Konfiguracja menedżera">
        <button
          type="button"
          className="dd-action-primary"
          data-dd-action="dalej"
          onClick={handleContinue}
        >
          Dalej
        </button>
      </StickyActionBar>
    </>
  );
};
