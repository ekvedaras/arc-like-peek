import { mkdir, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, parse } from "node:path";

/**
 * Splits a video into PNG frames so motion can be reviewed and measured frame by frame.
 *
 * - `.webm` (Playwright's e2e recordings, VP8, ≈25 fps): decoded with the ffmpeg build Playwright ships,
 *   since no system ffmpeg is installed; that build decodes VP8 only (no H.264).
 * - `.mov` / `.mp4` / `.m4v` (macOS screen recordings of Arc, H.264/HEVC, variable frame rate): decoded with
 *   AVFoundation through `scripts/decode-video-frames.swift`. Frames are named by presentation time
 *   (`frame-00420ms.png`) and listed with their times in `frames.json`.
 *
 * Usage: bun run video-frames <video> [width px, default 640] [output dir, default <video dir>/<name>-frames]
 */

const PLAYWRIGHT_CACHE = join(homedir(), "Library", "Caches", "ms-playwright");
const AV_FOUNDATION_EXTENSIONS = new Set([".mov", ".mp4", ".m4v"]);

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

function decodeWebm(video: string, width: string, outputDirectory: string): Promise<number> {
  return playwrightFfmpeg().then(
    (ffmpeg) =>
      Bun.spawn(
        [
          ffmpeg,
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
      ).exited,
  );
}

function decodeWithAvFoundation(
  video: string,
  width: string,
  outputDirectory: string,
): Promise<number> {
  const decoder = join(import.meta.dir, "decode-video-frames.swift");
  return Bun.spawn(["swift", decoder, video, outputDirectory, width], {
    stdout: "inherit",
    stderr: "inherit",
  }).exited;
}

const [video, width = "640", outputArgument] = process.argv.slice(2);
const extension = video ? extname(video).toLowerCase() : "";
if (!(video && (extension === ".webm" || AV_FOUNDATION_EXTENSIONS.has(extension)))) {
  console.error("Usage: bun run video-frames <video.webm|.mov|.mp4> [width] [output dir]");
  process.exit(1);
}

const outputDirectory = outputArgument ?? join(dirname(video), `${parse(video).name}-frames`);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const exitCode =
  extension === ".webm"
    ? await decodeWebm(video, width, outputDirectory)
    : await decodeWithAvFoundation(video, width, outputDirectory);
if (exitCode !== 0) process.exit(exitCode);

const frames = (await readdir(outputDirectory)).filter((file) => file.endsWith(".png")).length;
const spacing = extension === ".webm" ? "≈25 fps, 40 ms apart" : "times in frames.json";
console.log(`${frames} frames (${spacing}) in ${outputDirectory}`);
