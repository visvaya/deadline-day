/**
 * Vitest setup file: stubs for browser APIs the game calls and jsdom does
 * not implement.
 *
 * Without these, a UI run printed 128 "Error: Not implemented:
 * window.scrollTo" blocks, each with its own stack trace. Nothing failed,
 * which is exactly the problem - a real warning had nowhere to be seen and
 * the gate stopped being something anyone reads.
 *
 * Stubbed rather than silenced: the methods do nothing, which is what they
 * would do in a viewport that never scrolls, and a test that cares whether
 * something scrolled can still spy on them.
 *
 * Separate from tests/setup.ts on purpose - that one is a module of
 * explicitly imported helpers (the Math.random guard), not a setup file, and
 * merging the two would run the guard's module side effects on every suite.
 */
const noop = (): void => {};

// Setup files run for every project, including the node one that carries the
// engine tests. Those have no window and need none: the stubs below exist so
// a jsdom viewport stops printing "Not implemented" for scrolling, which is
// meaningless where there is no viewport at all.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", { value: noop, writable: true });
  Object.defineProperty(window, "scroll", { value: noop, writable: true });
  Object.defineProperty(Element.prototype, "scrollTo", { value: noop, writable: true });
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: noop, writable: true });
}
