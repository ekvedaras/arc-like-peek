import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BrowserContext, test as base, chromium, type Worker } from "@playwright/test";
import { type FixtureServer, startFixtureServer } from "../fixtures/server.ts";

const EXTENSION_DIRECTORY = join(import.meta.dir, "..", "..", "dist");
const VIEWPORT = { width: 1280, height: 800 };

type ExtensionFixtures = {
  extensionServiceWorker: Worker;
  extensionId: string;
};

type WorkerFixtures = {
  fixtureServer: FixtureServer;
};

export const test = base.extend<ExtensionFixtures, WorkerFixtures>({
  fixtureServer: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here.
    async ({}, use) => {
      const server = startFixtureServer();
      await use(server);
      await server.stop();
    },
    { scope: "worker" },
  ],

  context: async ({ headless }, use, testInfo) => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), "arc-like-peek-profile-"));
    const context: BrowserContext = await chromium.launchPersistentContext(userDataDirectory, {
      channel: "chromium",
      headless,
      viewport: VIEWPORT,
      recordVideo: { dir: testInfo.outputPath("video"), size: VIEWPORT },
      args: [
        `--disable-extensions-except=${EXTENSION_DIRECTORY}`,
        `--load-extension=${EXTENSION_DIRECTORY}`,
      ],
    });

    await waitForExtensionServiceWorker(context);
    await use(context);

    const videos = context.pages().map((page) => page.video());
    await context.close();
    for (const video of videos) {
      if (video)
        await testInfo.attach("video", { path: await video.path(), contentType: "video/webm" });
    }
    await rm(userDataDirectory, { recursive: true, force: true });
  },

  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()));
  },

  extensionServiceWorker: async ({ context }, use) => {
    await use(await waitForExtensionServiceWorker(context));
  },

  extensionId: async ({ extensionServiceWorker }, use) => {
    const extensionId = new URL(extensionServiceWorker.url()).host;
    await use(extensionId);
  },
});

async function waitForExtensionServiceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
}

export { expect } from "@playwright/test";
