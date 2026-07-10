#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { runCli } from "./src/cli";
import { LocalStore } from "./src/localStore";

const pendingWrites: Promise<void>[] = [];

function writeStream(
  stream: NodeJS.WritableStream,
  text: string,
): void {
  if (stream.write(text)) return;

  pendingWrites.push(
    new Promise((resolve) => {
      stream.once("drain", resolve);
    }),
  );
}

const rl = createInterface({
  input: process.stdin,
  output: process.stderr,
});

let exitCode = 1;

try {
  exitCode = await runCli(process.argv.slice(2), {
    store: new LocalStore(Bun.env.XDG_CONFIG_HOME || undefined),
    io: {
      stdout: (text) => writeStream(process.stdout, text),
      stderr: (text) => writeStream(process.stderr, text),
      question: (prompt) => rl.question(prompt),
    },
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeStream(process.stdout, `Unexpected failure: ${message}\n`);
  if (Bun.env.FIRETG_DEBUG && error instanceof Error && error.stack) {
    writeStream(process.stderr, `${error.stack}\n`);
  }
  exitCode = 2;
} finally {
  await Promise.all(pendingWrites);
  rl.close();
}

process.exit(exitCode);
