/**
 * Runs the generated service worker against stand-ins for the browser's cache storage and network, so every
 * branch of its life cycle is checked without a browser: what is stored, what is refused, what is left behind.
 * The cases follow the failures the sibling project Telemark met with the same worker in production.
 */
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";

import { describe, expect, test } from "vitest";

import {
  CACHE_PREFIX,
  cacheIdOf,
  precacheOf,
  renderServiceWorker,
  sha256Hex,
} from "../../scripts/write-service-worker.mjs";

const TEMPLATE = readFileSync("scripts/service-worker-template.js", "utf8");
const ORIGIN = "https://game.example";
const POLICY = "default-src 'self'";
const SCRIPT_A = "/assets/index-AAAAAAAA.js";

type Release = Record<string, string>;

const RELEASE_A: Release = {
  "/": "<html>a</html>",
  [SCRIPT_A]: "console.log('a')",
  "/assets/figtree-latin-AAAAAAAA.woff2": "font",
  "/manifest.webmanifest": "{}",
};
const RELEASE_B: Release = {
  "/": "<html>b</html>",
  "/assets/index-BBBBBBBB.js": "console.log('b')",
  "/assets/figtree-latin-AAAAAAAA.woff2": "font",
  "/manifest.webmanifest": "{}",
};

const precacheFor = (release: Release) =>
  precacheOf(
    Object.entries(release).map(([url, body]) => ({
      path: url === "/" ? "index.html" : url.slice(1),
      sha256: sha256Hex(body),
    }))
  );

const cacheNameOf = (release: Release) => `${CACHE_PREFIX}${cacheIdOf(precacheFor(release))}`;
const sorted = (names: Iterable<string>) => [...names].sort();

type Store = Map<string, Response>;

/**
 * Cache storage as the worker uses it. `failPutAt` makes the n-th write fail, as a full disk would;
 * `dropAtPut` removes every cache at the n-th write, as another worker of the game does when it tidies up.
 */
const makeCacheStorage = ({ failPutAt = Infinity, dropAtPut = Infinity } = {}) => {
  const stores = new Map<string, Store>();
  let puts = 0;
  return {
    stores,
    has: (name: string) => Promise.resolve(stores.has(name)),
    open: (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return Promise.resolve({
        match: (url: string) => Promise.resolve(stores.get(name)?.get(url)?.clone()),
        put: (url: string, response: Response) => {
          puts += 1;
          if (puts >= failPutAt)
            return Promise.reject(new DOMException("no room", "QuotaExceededError"));
          if (puts === dropAtPut) stores.clear();
          stores.get(name)?.set(url, response);
          return Promise.resolve();
        },
      });
    },
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    keys: () => Promise.resolve([...stores.keys()]),
    match: (url: string, options: { cacheName: string }) =>
      Promise.resolve(stores.get(options.cacheName)?.get(url)?.clone()),
  };
};

type Served = string | { body: string; status?: number; type?: string; redirect?: boolean };

const responseOf = (body: string, status: number, type: string): Response => {
  const response = new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain",
      "Content-Security-Policy": POLICY,
      "Content-Encoding": "gzip",
      "Content-Length": "123",
      Vary: "Accept-Encoding",
    },
  });
  Object.defineProperty(response, "type", { value: type });
  return response;
};

/** The network: `served` maps a path to its body, or to a description of how it misbehaves. */
const makeNetwork = (initial: Record<string, Served>) => {
  const network = {
    calls: [] as { path: string; init: RequestInit }[],
    served: { ...initial },
    offline: false,
    fetch: (input: string | URL | { url: string }, init: RequestInit = {}): Promise<Response> => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      network.calls.push({ path: url.pathname, init });
      if (network.offline) return Promise.reject(new TypeError("Failed to fetch"));
      const entry = network.served[url.pathname];
      if (entry === undefined) return Promise.resolve(responseOf("", 404, "basic"));
      const served = typeof entry === "string" ? { body: entry } : entry;
      if (served.redirect === true && init.redirect === "error") {
        return Promise.reject(new TypeError("redirected"));
      }
      return Promise.resolve(responseOf(served.body, served.status ?? 200, served.type ?? "basic"));
    },
  };
  return network;
};

type World = {
  caches: ReturnType<typeof makeCacheStorage>;
  network: ReturnType<typeof makeNetwork>;
  registration?: { installing: object | null; waiting: object | null };
};

const world = (): World => ({ caches: makeCacheStorage(), network: makeNetwork(RELEASE_A) });

type FetchOptions = { method?: string; mode?: string; origin?: string };

/** Loads the worker of `release` and returns the means to send it events. */
const startWorker = (release: Release, { caches, network, registration }: World) => {
  const handlers = new Map<string, (event: object) => void>();
  const tookOver: string[] = [];
  const scope = {
    location: { origin: ORIGIN },
    registration: registration ?? { installing: null, waiting: null },
    addEventListener: (type: string, handler: (event: object) => void) =>
      handlers.set(type, handler),
    skipWaiting: () => tookOver.push("skipWaiting"),
    clients: { claim: () => tookOver.push("clients.claim") },
  };
  const source = renderServiceWorker(TEMPLATE, precacheFor(release));
  compileFunction(source, ["self", "caches", "fetch"])(scope, caches, network.fetch);

  const lifecycle = async (type: string) => {
    const pending: Promise<unknown>[] = [];
    handlers.get(type)?.({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
  };
  return {
    tookOver,
    install: () => lifecycle("install"),
    activate: () => lifecycle("activate"),
    message: async (data: unknown) => {
      const pending: Promise<unknown>[] = [];
      handlers.get("message")?.({
        data,
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      });
      await Promise.all(pending);
    },
    /** The worker's answer, or null when it leaves the request to the browser; after all it started. */
    fetch: async (
      path: string,
      { method = "GET", mode = "cors", origin = ORIGIN }: FetchOptions = {}
    ) => {
      let answer: Promise<Response> | null = null;
      const pending: Promise<unknown>[] = [];
      handlers.get("fetch")?.({
        request: { method, mode, url: `${origin}${path}` },
        respondWith: (promise: Promise<Response>) => {
          answer = promise;
        },
        waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      });
      const response = await Promise.resolve(answer);
      await Promise.all(pending);
      return response as Response | null;
    },
  };
};

const installed = async (release: Release, w: World) => {
  const worker = startWorker(release, w);
  await worker.install();
  return worker;
};

const storeOf = (w: World, release: Release): Store => {
  const store = w.caches.stores.get(cacheNameOf(release));
  if (store === undefined) throw new Error("the release is not stored");
  return store;
};

describe("the release written into the worker", () => {
  test("keeps every built file but the host's rules and the worker, the page at the root", () => {
    const files = ["sw.js", "index.html", "_headers", "assets/b.js", "assets/a.css"].map(
      (path) => ({
        path,
        sha256: path,
      })
    );
    expect(precacheOf(files)).toEqual([
      { url: "/assets/a.css", sha256: "assets/a.css" },
      { url: "/assets/b.js", sha256: "assets/b.js" },
      { url: "/", sha256: "index.html" },
    ]);
  });

  test("names its cache after its files, so a changed file is another release", () => {
    const changed = { ...RELEASE_A, [SCRIPT_A]: "console.log('a2')" };
    expect(cacheNameOf(RELEASE_A)).not.toBe(cacheNameOf(changed));
    expect(cacheNameOf(RELEASE_A)).toBe(cacheNameOf({ ...RELEASE_A }));
  });

  test("refuses a template without exactly one placeholder", () => {
    expect(() => renderServiceWorker("const RELEASE = {};", [])).toThrow(/exactly once/);
  });
});

describe("install", () => {
  test("stores every file of the release after checking it, from the server, without redirects", async () => {
    const w = world();
    await installed(RELEASE_A, w);
    expect(sorted(storeOf(w, RELEASE_A).keys())).toEqual(sorted(Object.keys(RELEASE_A)));
    expect(await storeOf(w, RELEASE_A).get("/")?.text()).toBe(RELEASE_A["/"]);
    expect(w.network.calls).toHaveLength(Object.keys(RELEASE_A).length);
    for (const call of w.network.calls) {
      expect(call.init).toMatchObject({ cache: "no-cache", redirect: "error" });
    }
  });

  test("a stored copy keeps the policy and the type, not the headers of the transfer", async () => {
    const w = world();
    await installed(RELEASE_A, w);
    const page = storeOf(w, RELEASE_A).get("/");
    expect(page?.headers.get("content-security-policy")).toBe(POLICY);
    expect(page?.headers.get("content-type")).toBe("text/plain");
    for (const name of ["content-encoding", "content-length", "vary"]) {
      expect(page?.headers.get(name), name).toBeNull();
    }
  });

  const BROKEN_ANSWERS: { name: string; answer: Served | undefined; message: RegExp }[] = [
    { name: "a missing file", answer: undefined, message: /HTTP 404/ },
    { name: "a server error", answer: { body: "oops", status: 500 }, message: /HTTP 500/ },
    // A deployment in progress: the old worker, the new files.
    { name: "a file of another release", answer: "console.log('b')", message: /not the file/ },
    {
      name: "an answer from another origin",
      answer: { body: RELEASE_A[SCRIPT_A] ?? "", type: "opaque" },
      message: /same-origin/,
    },
    {
      name: "a redirect",
      answer: { body: RELEASE_A[SCRIPT_A] ?? "", redirect: true },
      message: /redirected/,
    },
  ];

  for (const { name, answer, message } of BROKEN_ANSWERS) {
    test(`fails on ${name} and leaves no part of the release`, async () => {
      const w = world();
      if (answer === undefined) delete w.network.served[SCRIPT_A];
      else w.network.served[SCRIPT_A] = answer;
      await expect(installed(RELEASE_A, w)).rejects.toThrow(message);
      expect([...w.caches.stores.keys()]).toEqual([]);
    });
  }

  test("fails without a network, without room, or when its cache is removed meanwhile", async () => {
    const offline = world();
    offline.network.offline = true;
    await expect(installed(RELEASE_A, offline)).rejects.toThrow(/Failed to fetch/);

    const full = { ...world(), caches: makeCacheStorage({ failPutAt: 3 }) };
    await expect(installed(RELEASE_A, full)).rejects.toThrow(/no room/);

    const tidied = { ...world(), caches: makeCacheStorage({ dropAtPut: 3 }) };
    await expect(installed(RELEASE_A, tidied)).rejects.toThrow(/removed while it was written/);

    for (const w of [offline, full, tidied]) expect([...w.caches.stores.keys()]).toEqual([]);
  });

  test("a failed install of the next release leaves the running one whole and working offline", async () => {
    const w = world();
    const running = await installed(RELEASE_A, w);
    w.network.served = { ...RELEASE_B };
    delete w.network.served["/assets/index-BBBBBBBB.js"];
    await expect(installed(RELEASE_B, w)).rejects.toThrow(/HTTP 404/);

    expect([...w.caches.stores.keys()]).toEqual([cacheNameOf(RELEASE_A)]);
    w.network.offline = true;
    expect(await (await running.fetch("/", { mode: "navigate" }))?.text()).toBe(RELEASE_A["/"]);
  });

  test("a release stored in full is not fetched again, one with a file gone is", async () => {
    const w = world();
    await installed(RELEASE_A, w);
    w.network.calls.length = 0;
    await installed(RELEASE_A, w);
    expect(w.network.calls).toEqual([]);

    storeOf(w, RELEASE_A).delete("/manifest.webmanifest");
    await installed(RELEASE_A, w);
    expect(storeOf(w, RELEASE_A).has("/manifest.webmanifest")).toBe(true);
  });

  test("the worker never takes over pages on its own", async () => {
    const worker = await installed(RELEASE_A, world());
    await worker.activate();
    expect(worker.tookOver).toEqual([]);
  });

  test("a waiting worker takes over only when the start screen asks it to, and claims no page", async () => {
    const worker = await installed(RELEASE_A, world());
    await worker.message({ type: "something-else" });
    await worker.message(null);
    expect(worker.tookOver).toEqual([]);
    await worker.message({ type: "deadline-day:take-over" });
    expect(worker.tookOver).toEqual(["skipWaiting"]);
  });
});

describe("answers", () => {
  test("the start page answers the root, its file name and any query from the store", async () => {
    const w = world();
    const worker = await installed(RELEASE_A, w);
    w.network.offline = true;
    for (const path of ["/", "/index.html", "/?source=homescreen", "/index.html?x=1"]) {
      expect(await (await worker.fetch(path, { mode: "navigate" }))?.text(), path).toBe(
        RELEASE_A["/"]
      );
    }
    for (const path of [SCRIPT_A, `${SCRIPT_A}?v=2`, "/manifest.webmanifest"]) {
      expect(await (await worker.fetch(path))?.text(), path).toBe(
        RELEASE_A[path.split("?")[0] ?? ""]
      );
    }
  });

  test("requests that are not files of the release are left to the browser", async () => {
    const w = world();
    const worker = await installed(RELEASE_A, w);
    // The page of the release has started; nothing but this release is stored.
    await worker.fetch("/", { mode: "navigate" });
    const untouched: [string, FetchOptions][] = [
      ["/assets/index-BBBBBBBB.js", {}],
      ["/sw.js", {}],
      ["/some/page", { mode: "navigate" }],
      ["/", { method: "POST" }],
      [SCRIPT_A, { method: "HEAD" }],
      [SCRIPT_A, { origin: "https://elsewhere.example" }],
    ];
    for (const [path, options] of untouched) {
      expect(await worker.fetch(path, options), `${options.method ?? "GET"} ${path}`).toBeNull();
    }
  });

  test("when the browser has dropped the store, the network answers and no empty store is made", async () => {
    const w = world();
    const worker = await installed(RELEASE_A, w);
    w.caches.stores.clear();
    expect(await (await worker.fetch("/", { mode: "navigate" }))?.text()).toBe(RELEASE_A["/"]);
    expect([...w.caches.stores.keys()]).toEqual([]);
  });

  test("a request the network fails is answered with a network error, never a broken promise", async () => {
    const w = world();
    const worker = await installed(RELEASE_A, w);
    w.caches.stores.clear();
    w.network.offline = true;
    for (const [path, mode] of [
      ["/", "navigate"],
      [SCRIPT_A, "cors"],
    ] as const) {
      expect((await worker.fetch(path, { mode }))?.type, path).toBe("error");
    }
  });
});

describe("one release after another", () => {
  /** Release A runs, release B is on the server and stored; the worker of B has taken over. */
  const afterTakeover = async () => {
    const w = world();
    await installed(RELEASE_A, w);
    w.caches.stores.set("someone-elses-cache", new Map());
    w.network.served = { ...RELEASE_B };
    const workerB = await installed(RELEASE_B, w);
    await workerB.activate();
    w.network.calls.length = 0;
    return { w, workerB };
  };
  const BOTH = sorted([cacheNameOf(RELEASE_A), cacheNameOf(RELEASE_B), "someone-elses-cache"]);

  test("taking over removes nothing: the release before stays stored", async () => {
    const { w } = await afterTakeover();
    expect(sorted(w.caches.stores.keys())).toEqual(BOTH);
  });

  // Right after an update the browser can answer one more launch with the page of the outgoing release and
  // switch workers under it; that page then asks for a script the server no longer has.
  test("a page of the release before gets its files from that release, not from the network", async () => {
    const { w, workerB } = await afterTakeover();
    expect(await (await workerB.fetch(SCRIPT_A))?.text()).toBe(RELEASE_A[SCRIPT_A]);
    expect(w.network.calls).toEqual([]);
    expect(await workerB.fetch(SCRIPT_A, { mode: "navigate" }), "never a page").toBeNull();
  });

  test("the start page of this release removes the other releases and nothing else", async () => {
    const { w, workerB } = await afterTakeover();
    expect(await (await workerB.fetch("/", { mode: "navigate" }))?.text()).toBe(RELEASE_B["/"]);
    expect(sorted(w.caches.stores.keys())).toEqual(
      sorted([cacheNameOf(RELEASE_B), "someone-elses-cache"])
    );
    expect(await workerB.fetch(SCRIPT_A), "left to the browser from now on").toBeNull();
  });

  test("a start page that had to come from the network removes nothing", async () => {
    const { w, workerB } = await afterTakeover();
    w.caches.stores.delete(cacheNameOf(RELEASE_B));
    await workerB.fetch("/", { mode: "navigate" });
    expect(sorted(w.caches.stores.keys())).toEqual(
      sorted([cacheNameOf(RELEASE_A), "someone-elses-cache"])
    );
  });

  for (const pending of ["installing", "waiting"] as const) {
    test(`a release that is ${pending} keeps its cache when the running one starts a page`, async () => {
      const registration: NonNullable<World["registration"]> = { installing: null, waiting: null };
      const w = { ...world(), registration };
      const workerA = await installed(RELEASE_A, w);
      w.network.served = { ...RELEASE_B };
      await installed(RELEASE_B, w);
      registration[pending] = {};

      await workerA.fetch("/", { mode: "navigate" });
      expect(sorted(w.caches.stores.keys())).toEqual(
        sorted([cacheNameOf(RELEASE_A), cacheNameOf(RELEASE_B)])
      );
    });
  }
});
