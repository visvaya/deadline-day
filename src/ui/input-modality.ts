export type InputModality = "keyboard" | "pointer";

/**
 * Tracks whether the last meaningful input was a keyboard press or a
 * pointer/touch press.
 *
 * A11y fix (2026-09-17, WCAG 2.4.11): app.tsx's screen-transition effect
 * reads this to decide whether a notification banner that shares a
 * dispatch with a transition may safely take focus for itself instead of
 * the new screen's heading. A mouse/touch user never lost sight of that
 * heading in the first place (the banner auto-dismisses in 1.5s and
 * nothing about a pointer interaction depends on focus being visible the
 * way keyboard/screen-reader navigation does), so only "keyboard" changes
 * anything downstream.
 *
 * Deliberately module-level state, not a React hook or context: nothing
 * that reads it needs to re-render when modality changes mid-session - the
 * one caller (app.tsx) only ever reads it once, synchronously, at the exact
 * moment a transition happens. A hook re-rendering the whole app on every
 * keystroke and pointerdown would be a straightforward performance
 * regression for a value nothing here subscribes to.
 */
let modality: InputModality = "pointer";

// A monotonic counter bumped on every keydown/pointerdown/touchstart -
// app.tsx's transition-hold logic (2026-09-17 fix) uses it to tell "no new
// input happened since this transition" from "the player has since pressed
// something else", which a boolean or timestamp cannot distinguish reliably
// (two events in the same millisecond, or a paused/faked clock in tests).
// Bumped unconditionally, even for a bare modifier key that never flips
// `modality` - a Shift press between a transition and a late-arriving
// notification is still a new input event for this purpose.
let inputSequence = 0;

// A bare modifier keydown does not mean the player switched to the
// keyboard - browsers fire "keydown" for Shift alone while, say, a mouse
// drag-select is in progress. Treating that as a real keyboard interaction
// would flip modality behind a pointer user's back for a key that never,
// by itself, activates anything.
const BARE_MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Fn",
  "FnLock",
  "Hyper",
  "NumLock",
  "ScrollLock",
  "Super",
  "Symbol",
  "SymbolLock",
  "OS",
]);

const handleKeyDown = (event: KeyboardEvent): void => {
  inputSequence += 1;
  if (BARE_MODIFIER_KEYS.has(event.key)) return;
  modality = "keyboard";
};

const handlePointerSignal = (): void => {
  inputSequence += 1;
  modality = "pointer";
};

// Listeners are installed once, at module load, and never torn down - this
// is a page-lifetime singleton by design (see the doc comment above), the
// same way the rest of the app treats "what does the viewport look like
// right now" state that nothing meaningfully unmounts.
if (typeof window !== "undefined") {
  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("pointerdown", handlePointerSignal, true);
  window.addEventListener("touchstart", handlePointerSignal, true);
}

export const getInputModality = (): InputModality => modality;

export const getInputSequence = (): number => inputSequence;
