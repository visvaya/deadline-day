import { describe, expect, test } from "vitest";

import {
  checkForUpdate,
  installUpdate,
  watchForUpdates,
  type RegistrationLike,
  type UpdateStatus,
} from "../../src/ui/game-update";

/** A service worker whose state the test moves on, as the browser would. */
const makeWorker = (state = "installing") => {
  const listeners = new Set<() => void>();
  const worker = {
    state,
    messages: [] as unknown[],
    postMessage: (message: unknown) => worker.messages.push(message),
    addEventListener: (_type: "statechange", listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: "statechange", listener: () => void) => listeners.delete(listener),
    moveTo: (next: string) => {
      worker.state = next;
      for (const listener of [...listeners]) listener();
    },
    listeners,
  };
  return worker;
};

type FakeWorker = ReturnType<typeof makeWorker>;

const makeRegistration = (
  workers: { active?: FakeWorker; installing?: FakeWorker; waiting?: FakeWorker } = {},
  update: () => Promise<unknown> = () => Promise.resolve()
) => {
  const found = new Set<() => void>();
  const registration = {
    active: workers.active ?? null,
    installing: workers.installing ?? null,
    waiting: workers.waiting ?? null,
    update,
    addEventListener: (_type: "updatefound", listener: () => void) => found.add(listener),
    removeEventListener: (_type: "updatefound", listener: () => void) => found.delete(listener),
    /** The browser found a newer worker and starts storing it. */
    find: (worker: FakeWorker) => {
      registration.installing = worker;
      for (const listener of [...found]) listener();
    },
    found,
  } satisfies RegistrationLike & Record<string, unknown>;
  return registration;
};

const online = () => Promise.resolve(true);
const offline = () => Promise.resolve(false);

const recorder = () => {
  const statuses: UpdateStatus[] = [];
  return { statuses, report: (status: UpdateStatus) => statuses.push(status) };
};

describe("checking for a new release", () => {
  test("says what the registration holds after asking the server", async () => {
    const active = makeWorker("activated");
    expect(await checkForUpdate(makeRegistration({ active }), online)).toBe("latest");
    expect(
      await checkForUpdate(makeRegistration({ active, installing: makeWorker() }), online)
    ).toBe("downloading");
    expect(
      await checkForUpdate(makeRegistration({ active, waiting: makeWorker("installed") }), online)
    ).toBe("waiting");
  });

  test("a check that cannot reach the server says so", async () => {
    const registration = makeRegistration({ active: makeWorker("activated") }, () =>
      Promise.reject(new TypeError("Failed to fetch"))
    );
    expect(await checkForUpdate(registration, online)).toBe("unreachable");
  });

  test("a server that does not answer is no network, and the browser is not asked", async () => {
    // Chromium resolves registration.update() without a network as if nothing were new.
    let asked = 0;
    const registration = makeRegistration({ active: makeWorker("activated") }, () => {
      asked += 1;
      return Promise.resolve();
    });
    expect(await checkForUpdate(registration, offline)).toBe("unreachable");
    expect(asked).toBe(0);
  });

  test("a first visit still storing the game, or no worker at all, is not an update", async () => {
    expect(await checkForUpdate(makeRegistration({ installing: makeWorker() }), online)).toBe(
      "saving"
    );
    expect(await checkForUpdate(undefined, online)).toBe("unavailable");
  });
});

describe("watching for a new release", () => {
  test("a release that already waits is reported at once", () => {
    const { statuses, report } = recorder();
    watchForUpdates(
      makeRegistration({ active: makeWorker("activated"), waiting: makeWorker("installed") }),
      report
    );
    expect(statuses).toEqual(["waiting"]);
  });

  test("a waiting release installed from another window leaves nothing waiting here", () => {
    const { statuses, report } = recorder();
    const waiting = makeWorker("installed");
    watchForUpdates(makeRegistration({ active: makeWorker("activated"), waiting }), report);
    waiting.moveTo("activating");
    waiting.moveTo("activated");
    expect(statuses).toEqual(["waiting", "idle"]);
    expect(waiting.listeners.size).toBe(0);
  });

  test("a release found later is reported once it is stored", () => {
    const { statuses, report } = recorder();
    const registration = makeRegistration({ active: makeWorker("activated") });
    watchForUpdates(registration, report);
    const next = makeWorker();
    registration.find(next);
    expect(statuses).toEqual([]);
    next.moveTo("installed");
    expect(statuses).toEqual(["waiting"]);
  });

  test("a release that cannot be stored is a failure, one replaced by a newer release is not", () => {
    const { statuses, report } = recorder();
    const registration = makeRegistration({ active: makeWorker("activated") });
    watchForUpdates(registration, report);
    const broken = makeWorker();
    registration.find(broken);
    broken.moveTo("redundant");
    expect(statuses).toEqual(["failed"]);
    expect(broken.listeners.size).toBe(0);

    const replaced = makeWorker();
    registration.find(replaced);
    replaced.moveTo("installed");
    replaced.moveTo("redundant");
    expect(statuses).toEqual(["failed", "waiting"]);
  });

  test("a stored release that takes over on its own leaves nothing waiting", () => {
    const { statuses, report } = recorder();
    const registration = makeRegistration({ active: makeWorker("activated") });
    watchForUpdates(registration, report);
    const next = makeWorker();
    registration.find(next);
    next.moveTo("installed");
    next.moveTo("activating");
    next.moveTo("activated");
    expect(statuses).toEqual(["waiting", "idle"]);
  });

  test("the first visit storing the game is no update, and once stored nothing is pending", () => {
    const { statuses, report } = recorder();
    const first = makeWorker();
    watchForUpdates(makeRegistration({ installing: first }), report);
    first.moveTo("installed");
    expect(statuses).toEqual([]);
    first.moveTo("activated");
    // Clears "the game is still being stored", which a check made meanwhile shows.
    expect(statuses).toEqual(["idle"]);
    expect(first.listeners.size).toBe(0);
  });

  test("stopping removes every listener", () => {
    const registration = makeRegistration({ active: makeWorker("activated") });
    const stop = watchForUpdates(registration, () => undefined);
    const next = makeWorker();
    registration.find(next);
    stop();
    expect(registration.found.size).toBe(0);
    expect(next.listeners.size).toBe(0);
  });
});

describe("installing a waiting release", () => {
  test("asks the waiting worker to take over and reloads once it has", () => {
    const { statuses, report } = recorder();
    const waiting = makeWorker("installed");
    let reloads = 0;
    const registration = makeRegistration({ active: makeWorker("activated"), waiting });

    expect(installUpdate(registration, report, () => (reloads += 1))).toBe(true);
    expect(waiting.messages).toEqual([{ type: "deadline-day:take-over" }]);
    expect(statuses).toEqual(["installing"]);
    expect(reloads).toBe(0);

    waiting.moveTo("activating");
    expect(reloads).toBe(0);
    waiting.moveTo("activated");
    waiting.moveTo("activated");
    expect(reloads).toBe(1);
  });

  test("a release that is dropped instead is a failure, and nothing reloads", () => {
    const { statuses, report } = recorder();
    const waiting = makeWorker("installed");
    let reloads = 0;
    installUpdate(makeRegistration({ waiting }), report, () => (reloads += 1));
    waiting.moveTo("redundant");
    expect(statuses).toEqual(["installing", "failed"]);
    expect(reloads).toBe(0);
    expect(waiting.listeners.size).toBe(0);
  });

  test("with no release waiting nothing is asked", () => {
    const { statuses, report } = recorder();
    expect(installUpdate(makeRegistration(), report, () => undefined)).toBe(false);
    expect(statuses).toEqual([]);
  });
});
