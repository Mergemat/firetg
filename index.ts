#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
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

let hideInput = false;
const readlineOutput = new Writable({
  write(chunk, _encoding, callback) {
    if (!hideInput) writeStream(process.stderr, String(chunk));
    callback();
  },
});
const rl = createInterface({
  input: process.stdin,
  output: readlineOutput,
  terminal: Boolean(process.stdin.isTTY),
});

async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "Authentication secrets require a trusted interactive terminal",
    );
  }

  const answer = rl.question(prompt);
  hideInput = true;
  try {
    return await answer;
  } finally {
    hideInput = false;
    writeStream(process.stderr, "\n");
  }
}

let exitCode = 1;

try {
  exitCode = await runCli(process.argv.slice(2), {
    store: new LocalStore(Bun.env.XDG_CONFIG_HOME || undefined),
    io: {
      stdout: (text) => writeStream(process.stdout, text),
      stderr: (text) => writeStream(process.stderr, text),
      question: (prompt) => rl.question(prompt),
      secret: readSecret,
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
