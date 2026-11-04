import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const ARTIFACTS = join(ROOT, "artifacts");

function run(command: string[], cwd: string): void {
  const result = Bun.spawnSync(command, { cwd, stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`${command.join(" ")} failed`);
}

run(["bun", "run", "build"], ROOT);

const { version } = await Bun.file(join(DIST, "manifest.json")).json();
const zipPath = join(ARTIFACTS, `arc-like-peek-${version}.zip`);

await mkdir(ARTIFACTS, { recursive: true });
await rm(zipPath, { force: true });
// Run inside dist/ so manifest.json sits at the zip root, as the Chrome Web Store requires.
run(["zip", "-r", "-q", "-X", zipPath, "."], DIST);

console.log(zipPath);
