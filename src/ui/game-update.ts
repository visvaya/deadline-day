import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A new release of the game, as the start screen shows it. The service worker (scripts/service-worker-template.js)
 * stores a new release in the background and lets it wait until every window of the game is closed; here the
 * player can look for one and install a waiting one at once.
 */
export type UpdateStatus =
  | "idle"
  | "checking"
  | "latest"
  | "downloading"
  | "waiting"
  | "installing"
  | "failed"
  | "unreachable"
  | "saving"
  | "unavailable";

/** What the game reads of a service worker and of its registration; the browser's objects satisfy it. */
type WorkerLike = {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
};

export type RegistrationLike = {
  readonly active: WorkerLike | null;
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
  update(): Promise<unknown>;
  addEventListener(type: "updatefound", listener: () => void): void;
  removeEventListener(type: "updatefound", listener: () => void): void;
};

/** The message the worker answers with skipWaiting; the worker names it too. */
const TAKE_OVER_MESSAGE = { type: "deadline-day:take-over" };

/** Looks for a new release now and says what was found. */
export const checkForUpdate = async (
  registration: RegistrationLike | undefined
): Promise<UpdateStatus> => {
  if (registration === undefined) return "unavailable";
  try {
    await registration.update();
  } catch {
    // The browser does not tell a missing network from a server that did not answer.
    return "unreachable";
  }
  // A first visit: the game is still being stored, so there is nothing to compare with yet.
  if (registration.active === null) return "saving";
  if (registration.waiting !== null) return "waiting";
  return registration.installing === null ? "latest" : "downloading";
};

/**
 * Reports a release that waits now or later, and one that could not be stored. A new worker of the very
 * first visit is the game being stored, not an update. Returns the means to stop.
 */
export const watchForUpdates = (
  registration: RegistrationLike,
  report: (status: UpdateStatus) => void
): (() => void) => {
  const followed = new Set<() => void>();
  const follow = (worker: WorkerLike) => {
    const isUpdate = registration.active !== null;
    // A stored release that a still newer one replaces is not a failure; one that never got stored is.
    let stored = worker.state === "installed";
    const onState = () => {
      if (isUpdate && worker.state === "installed") {
        stored = true;
        report("waiting");
      }
      if (isUpdate && worker.state === "redundant" && !stored) report("failed");
      // Taken over without waiting: the game stored on a first visit, a release installed from another
      // window, or one that no window of the running release kept waiting (a page of the first visit is not
      // one of its pages). Nothing waits any more; the next start gets it.
      if (worker.state === "activated") report("idle");
      if (worker.state === "activated" || worker.state === "redundant") stop();
    };
    const stop = () => {
      worker.removeEventListener("statechange", onState);
      followed.delete(stop);
    };
    worker.addEventListener("statechange", onState);
    followed.add(stop);
  };
  const onFound = () => {
    if (registration.installing !== null) follow(registration.installing);
  };
  if (registration.waiting !== null && registration.active !== null) {
    report("waiting");
    follow(registration.waiting);
  }
  if (registration.installing !== null) follow(registration.installing);
  registration.addEventListener("updatefound", onFound);
  return () => {
    registration.removeEventListener("updatefound", onFound);
    for (const stop of [...followed]) stop();
  };
};

/**
 * Asks the waiting release to take over and reloads the page once it has; false when no release waits.
 * Followed by the worker's own state rather than the page's controller: a page loaded past the worker (a
 * forced reload) has no controller to change, and is reloaded all the same.
 */
export const installUpdate = (
  registration: RegistrationLike,
  report: (status: UpdateStatus) => void,
  reload: () => void
): boolean => {
  const waiting = registration.waiting;
  if (waiting === null) return false;
  const onState = () => {
    if (waiting.state !== "activated" && waiting.state !== "redundant") return;
    waiting.removeEventListener("statechange", onState);
    if (waiting.state === "activated") reload();
    else report("failed");
  };
  waiting.addEventListener("statechange", onState);
  report("installing");
  waiting.postMessage(TAKE_OVER_MESSAGE);
  return true;
};

const currentRegistration = async (): Promise<RegistrationLike | undefined> =>
  "serviceWorker" in navigator ? navigator.serviceWorker.getRegistration() : undefined;

/** The update controls of the start screen; `supported` is false where the browser has no service workers. */
export const useGameUpdate = () => {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const watched = useRef<{ registration: RegistrationLike; stop: () => void } | null>(null);

  const watch = useCallback((registration: RegistrationLike | undefined) => {
    if (registration === undefined || watched.current?.registration === registration) return;
    watched.current?.stop();
    watched.current = { registration, stop: watchForUpdates(registration, setStatus) };
  }, []);

  useEffect(() => {
    let mounted = true;
    void currentRegistration()
      .then((registration) => {
        if (mounted) watch(registration);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      watched.current?.stop();
      watched.current = null;
    };
  }, [watch]);

  const check = useCallback(async () => {
    setStatus("checking");
    // Asked again: on a first visit the registration may not have existed when the screen opened.
    const registration = await currentRegistration().catch(() => undefined);
    watch(registration);
    setStatus(await checkForUpdate(registration));
  }, [watch]);

  const install = useCallback(() => {
    const registration = watched.current?.registration;
    // From here the install reports alone: the watcher would see the same worker take over and say that
    // nothing waits, just before the page reloads. A later check watches again.
    watched.current?.stop();
    watched.current = null;
    const started =
      registration !== undefined &&
      installUpdate(registration, setStatus, () => window.location.reload());
    if (!started) setStatus("failed");
  }, []);

  return { supported: "serviceWorker" in navigator, status, check, install };
};
