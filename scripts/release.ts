#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

type Increment = "patch" | "minor" | "major";

const increments = new Set<Increment>(["patch", "minor", "major"]);

function exec(
  command: string,
  args: string[],
  options: { capture?: boolean } = {},
): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  return options.capture ? result.stdout.trim() : "";
}

function readPackageJson(): { name: string; version: string } {
  return JSON.parse(readFileSync("package.json", "utf8"));
}

function nextVersion(version: string, increment: Increment | string): string {
  if (/^\d+\.\d+\.\d+$/.test(increment)) {
    return increment;
  }

  if (!increments.has(increment as Increment)) {
    console.error("Usage: bun run release [patch|minor|major|x.y.z]");
    process.exit(1);
  }

  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    console.error(`Unsupported current version: ${version}`);
    process.exit(1);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (increment === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (increment === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

const status = exec("git", ["status", "--porcelain"], { capture: true });
if (status) {
  console.error("Working tree must be clean before releasing.");
  process.exit(1);
}

const packageJson = readPackageJson();
const version = nextVersion(packageJson.version, process.argv[2] ?? "patch");

if (compareVersions(version, packageJson.version) <= 0) {
  console.error(`New version ${version} must be greater than ${packageJson.version}.`);
  process.exit(1);
}

const existingVersion = spawnSync("bun", ["pm", "view", `${packageJson.name}@${version}`, "version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});

if (existingVersion.status === 0) {
  console.error(`${packageJson.name}@${version} already exists on npm.`);
  process.exit(1);
}

exec("bun", ["pm", "pkg", "set", `version=${version}`]);
exec("git", ["add", "package.json"]);
exec("git", ["commit", "-m", `chore(release): v${version}`]);
exec("git", ["tag", `v${version}`]);

console.log(`Release v${version} is ready.`);
console.log("Push it with:");
console.log("  git push origin main");
console.log(`  git push origin v${version}`);
