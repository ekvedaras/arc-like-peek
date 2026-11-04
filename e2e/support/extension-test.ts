import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BrowserContext, test as base, chromium, type Worker } from "@playwright/test";
import {
  INTRANET_HOST_RESOLVER_RULE,
  type IntranetApp,
  startIntranetApp,
} from "../fixtures/intranet-app.ts";
import {
  CROSS_SITE_HOST_RESOLVER_RULE,
  type FixtureServer,
  startFixtureServer,
} from "../fixtures/server.ts";

const EXTENSION_DIRECTORY = join(import.meta.dir, "..", "..", "dist");
const VIEWPORT = { width: 1280, height: 800 };

/**
 * Playwright 1.63 launches Chromium with these features off, including ThirdPartyStoragePartitioning,
 * which Chrome ships on. Peek must be tested against the storage rules users have, so the list is
 * replaced by the same one without it. If Playwright changes its list, ignoring it stops matching and
 * the harness self-check "storage of a site framed by another site is partitioned" fails.
 */
const PLAYWRIGHT_DISABLED_FEATURES = [
  "AvoidUnnecessaryBeforeUnloadCheckSync",
  "DestroyProfileOnBrowserClose",
  "DialMediaRouteProvider",
  "GlobalMediaControls",
  "HttpsUpgrades",
  "LensOverlay",
  "MediaRouter",
  "PaintHolding",
  "ThirdPartyStoragePartitioning",
  "BlockOriginHeaderModificationOnRedirect",
  "Translate",
  "AutoDeElevate",
  "OptimizationHints",
  "msForceBrowserSignIn",
  "msEdgeUpdateLaunchServicesPreferredVersion",
];
const DISABLED_FEATURES = PLAYWRIGHT_DISABLED_FEATURES.filter(
  (feature) => feature !== "ThirdPartyStoragePartitioning",
);

type ExtensionFixtures = {
  /** Chrome lets users block third-party cookies; Peek must not depend on them being allowed. */
  thirdPartyCookies: "allowed" | "blocked";
  extensionServiceWorker: Worker;
  extensionId: string;
};

type WorkerFixtures = {
  fixtureServer: FixtureServer;
  intranetApp: IntranetApp;
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

  intranetApp: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here.
    async ({}, use) => {
      const app = await startIntranetApp();
      await use(app);
      await app.stop();
    },
    { scope: "worker" },
  ],

  thirdPartyCookies: ["allowed", { option: true }],

  context: async ({ headless, thirdPartyCookies }, use, testInfo) => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), "arc-like-peek-profile-"));
    if (thirdPartyCookies === "blocked") await blockThirdPartyCookies(userDataDirectory);
    const context: BrowserContext = await chromium.launchPersistentContext(userDataDirectory, {
      channel: "chromium",
      headless,
      viewport: VIEWPORT,
      // The intranet fixture's certificate is self-signed.
      // biome-ignore lint/style/useNamingConvention: Playwright's option name.
      ignoreHTTPSErrors: true,
      ignoreDefaultArgs: [`--disable-features=${PLAYWRIGHT_DISABLED_FEATURES.join(",")}`],
      recordVideo: { dir: testInfo.outputPath("video"), size: VIEWPORT },
      args: [
        `--disable-extensions-except=${EXTENSION_DIRECTORY}`,
        `--load-extension=${EXTENSION_DIRECTORY}`,
        `--host-resolver-rules=${CROSS_SITE_HOST_RESOLVER_RULE}, ${INTRANET_HOST_RESOLVER_RULE}`,
        `--disable-features=${DISABLED_FEATURES.join(",")}`,
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

/** Chrome's "Block third-party cookies" setting, written into the profile before Chrome starts. */
async function blockThirdPartyCookies(userDataDirectory: string): Promise<void> {
  const blockThirdParty = 1;
  await Bun.write(
    join(userDataDirectory, "Default", "Preferences"),
    // biome-ignore lint/style/useNamingConvention: Chrome's preference name.
    JSON.stringify({ profile: { cookie_controls_mode: blockThirdParty } }),
  );
}

async function waitForExtensionServiceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
}

export { expect } from "@playwright/test";
