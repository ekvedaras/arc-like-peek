import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const version = process.argv[2];

function git(...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: ROOT, stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout.toString().trim();
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!(version && /^\d+\.\d+\.\d+$/.test(version)))
  fail("usage: bun run release <major.minor.patch>");
if (git("branch", "--show-current") !== "main") fail("release from main");
if (git("status", "--porcelain") !== "") fail("working tree is not clean");
if (git("tag", "--list", `v${version}`) !== "") fail(`tag v${version} already exists`);

const packageJsonPath = join(ROOT, "package.json");
const packageJson = await Bun.file(packageJsonPath).text();
const bumped = packageJson.replace(/"version": "[^"]+"/, `"version": "${version}"`);
if (bumped === packageJson) fail(`package.json is already at ${version}`);
await Bun.write(packageJsonPath, bumped);

git("commit", "--all", "--message", `Release ${version}`);
git("tag", "--annotate", `v${version}`, "--message", `v${version}`);

console.log(
  `Committed and tagged v${version}. Publish it with:\n  git push origin main v${version}`,
);
