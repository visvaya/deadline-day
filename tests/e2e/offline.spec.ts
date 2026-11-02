import { appendFile, cp, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * The installable, offline game: the service worker (scripts/service-worker-template.js) and the manifest.
 * The worker's life cycle across releases is checked without a browser in
 * tests/scripts/service-worker.test.ts; this file proves that a real browser installs it and starts the game
 * from it with no network.
 */

/** Resolves once this release is stored in full and its worker is active. */
const offlineReady = (page: Page) =>
  page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

test("after one visit the game starts without a network, fonts included", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await offlineReady(page);

  await context.setOffline(true);
  await page.reload();

  await expect(page.locator(".dd-root[data-dd-screen]")).toBeVisible();
  const figtreeFaces = await page.evaluate(
    async () => (await document.fonts.load('400 16px "Figtree"', "Deadline Day ąę")).length
  );
  expect(figtreeFaces).toBeGreaterThan(0);
});

test("the game is installable", async ({ page, browserName }) => {
  test.skip(
    browserName !== "chromium",
    "only Chromium reports what keeps a page from being installed"
  );
  await page.goto("/");
  await offlineReady(page);

  const session = await page.context().newCDPSession(page);
  const { installabilityErrors } = await session.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
});

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
};

/**
 * A copy of the built game on a server of its own, so a test can put a new release on it without touching
 * the server the other tests share. No caching headers: the browser asks for the worker every time anyway.
 */
const serveCopyOfBuild = async () => {
  // The test's own output directory, which Playwright empties before the next run.
  const root = test.info().outputPath("release");
  await cp("dist", root, { recursive: true });
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const file = path.join(root, path.normalize(pathname === "/" ? "/index.html" : pathname));
    readFile(file).then(
      (body) => {
        const type = CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream";
        response.writeHead(200, { "Content-Type": type });
        response.end(body);
      },
      () => {
        response.writeHead(404);
        response.end();
      }
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}/`,
    /** The next release: the same files and a worker that differs by a byte. */
    release: () => appendFile(path.join(root, "sw.js"), "\n// next release\n"),
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
};

test("a release found on demand installs from the start screen and the page reloads under it", async ({
  page,
}) => {
  const host = await serveCopyOfBuild();
  try {
    await page.goto(host.url);
    await offlineReady(page);
    // A page of the release, as on every start after the first: the page of the first visit is not one,
    // and with no page of its own the running release lets a new one take over at once instead of waiting.
    await page.reload();
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    const check = page.locator('[data-dd-action="sprawdz-aktualizacje"]');
    await check.click();
    await expect(page.getByText("Masz najnowszą wersję.")).toBeVisible();

    await host.release();
    await check.click();
    const install = page.locator('[data-dd-action="zainstaluj-aktualizacje"]');
    await expect(install).toBeVisible();

    await page.evaluate(() => {
      (window as Window & { beforeUpdate?: true }).beforeUpdate = true;
    });
    await install.click();
    await expect.poll(() => page.evaluate(() => "beforeUpdate" in window)).toBe(false);
    await expect(check).toBeVisible();
    const waitingAfter = await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistration())?.waiting ?? null
    );
    expect(waitingAfter).toBeNull();
  } finally {
    await host.close();
  }
});
