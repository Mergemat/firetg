#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { runCli } from "./src/cli";

const rl = createInterface({
  input: process.stdin,
  output: process.stderr,
});

try {
  const exitCode = await runCli(process.argv.slice(2), {
    env: process.env,
    io: {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      question: (prompt) => rl.question(prompt),
    },
  });

  process.exitCode = exitCode;
} finally {
  rl.close();
}
