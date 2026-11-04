import { join } from "node:path";
import { chromium } from "@playwright/test";

export const ICON_SIZES = [16, 32, 48, 128] as const;

const ICON_SOURCE = join(import.meta.dir, "..", "assets", "icon.svg");

/** Rasterizes `assets/icon.svg` with the Chromium Playwright already ships, so no extra tool is needed. */
export async function renderIcons(): Promise<ReadonlyMap<number, Uint8Array>> {
  const svg = await Bun.file(ICON_SOURCE).text();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const icons = new Map<number, Uint8Array>();
    for (const size of ICON_SIZES) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      icons.set(size, await page.screenshot({ omitBackground: true, type: "png" }));
    }
    return icons;
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  const outputDirectory = process.argv[2] ?? join(import.meta.dir, "..", "dist", "icons");
  for (const [size, png] of await renderIcons()) {
    await Bun.write(join(outputDirectory, `icon-${size}.png`), png);
  }
}
