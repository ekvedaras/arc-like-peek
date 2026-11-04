import { mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/**
 * Splits a recorded e2e video into PNG frames next to it (`<video dir>/<video name>-frames/`), so the
 * motion can be reviewed frame by frame. Uses the ffmpeg build Playwright ships for recording, since
 * no system ffmpeg is installed; it can decode VP8 WebM and write PNG, nothing more.
 *
 * Usage: bun run video-frames <video.webm> [width]
 */

const PLAYWRIGHT_CACHE = join(homedir(), "Library", "Caches", "ms-playwright");

async function playwrightFfmpeg(): Promise<string> {
  const installs = (await readdir(PLAYWRIGHT_CACHE)).filter((entry) => entry.startsWith("ffmpeg-"));
  for (const install of installs.sort().reverse()) {
    for (const binary of ["ffmpeg-mac", "ffmpeg-linux", "ffmpeg-win64.exe"]) {
      const candidate = join(PLAYWRIGHT_CACHE, install, binary);
      if (await Bun.file(candidate).exists()) return candidate;
    }
  }
  throw new Error(
    `No Playwright ffmpeg under ${PLAYWRIGHT_CACHE}; run \`bunx playwright install ffmpeg\``,
  );
}

const [video, width = "640"] = process.argv.slice(2);
if (!video?.endsWith(".webm")) {
  console.error("Usage: bun run video-frames <video.webm> [width]");
  process.exit(1);
}

const outputDirectory = join(dirname(video), `${basename(video, ".webm")}-frames`);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const ffmpeg = Bun.spawn(
  [
    await playwrightFfmpeg(),
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    video,
    "-vf",
    `scale=${width}:-1`,
    join(outputDirectory, "frame-%03d.png"),
  ],
  { stdout: "inherit", stderr: "inherit" },
);
const exitCode = await ffmpeg.exited;
if (exitCode !== 0) process.exit(exitCode);

const frames = (await readdir(outputDirectory)).length;
console.log(`${frames} frames (≈25 fps, 40 ms apart) in ${outputDirectory}`);
