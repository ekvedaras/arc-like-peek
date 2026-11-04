import { watch } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { renderIcons } from "./render-icons";

const ROOT = join(import.meta.dir, "..");
const SOURCE = join(ROOT, "src");
const OUTPUT = join(ROOT, "dist");

const ENTRYPOINTS = [
  join(SOURCE, "background/service-worker.ts"),
  join(SOURCE, "content/content-script.ts"),
  join(SOURCE, "content/peek-frame-script.ts"),
  join(SOURCE, "peek-window/peek-window.ts"),
];

const STATIC_ASSETS = new Bun.Glob("**/*.{json,html,css}");

async function buildExtension(): Promise<boolean> {
  await rm(OUTPUT, { recursive: true, force: true });
  await mkdir(OUTPUT, { recursive: true });

  const result = await Bun.build({
    entrypoints: ENTRYPOINTS,
    root: SOURCE,
    outdir: OUTPUT,
    target: "browser",
    format: "iife",
    sourcemap: "linked",
    minify: false,
  });

  for (const log of result.logs) console.error(log);
  if (!result.success) return false;

  for await (const asset of STATIC_ASSETS.scan(SOURCE)) {
    await Bun.write(join(OUTPUT, asset), await Bun.file(join(SOURCE, asset)).bytes());
  }
  for (const [size, png] of await renderIcons()) {
    await Bun.write(join(OUTPUT, "icons", `icon-${size}.png`), png);
  }
  return true;
}

async function buildAndReport(): Promise<boolean> {
  const startedAt = performance.now();
  const succeeded = await buildExtension();
  const elapsed = Math.round(performance.now() - startedAt);
  console.log(succeeded ? `built dist/ in ${elapsed}ms` : "build failed");
  return succeeded;
}

const isWatchMode = process.argv.includes("--watch");

if (!isWatchMode) {
  process.exit((await buildAndReport()) ? 0 : 1);
}

await buildAndReport();
let pendingRebuild: Timer | undefined;
watch(SOURCE, { recursive: true }, () => {
  clearTimeout(pendingRebuild);
  pendingRebuild = setTimeout(buildAndReport, 50);
});
console.log("watching src/ for changes");
