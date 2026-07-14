import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ParsedArgs } from "./args";
import type { CommandSpec } from "./commands";
import { InteractiveRequiredError } from "./errors";
import type { CliContext } from "./types";

type CommandResult = {
  exitCode: number;
  stdout: string;
};

const timeoutResult = Symbol("timeout");

export async function executeCommand(
  command: CommandSpec,
  parsed: ParsedArgs,
  context: CliContext,
): Promise<number> {
  const result = await captureCommand(command, parsed, context);
  return deliverOutput(result, parsed, context);
}

async function captureCommand(
  command: CommandSpec,
  parsed: ParsedArgs,
  context: CliContext,
): Promise<CommandResult> {
  const chunks: string[] = [];
  const controller = new AbortController();
  let active = true;
  const noInput = parsed.flags.has("no-input");
  const executionContext: CliContext = {
    ...context,
    noInput,
    signal: controller.signal,
    io: {
      stdout: (text) => {
        if (active) chunks.push(text);
      },
      stderr: (text) => {
        if (active) context.io.stderr(text);
      },
      question: (prompt) => {
        if (noInput) {
          return Promise.reject(new InteractiveRequiredError(prompt));
        }
        return context.io.question(prompt);
      },
      ...(context.io.secret
        ? {
            secret: (prompt: string) => {
              if (noInput) {
                return Promise.reject(new InteractiveRequiredError(prompt));
              }
              return context.io.secret!(prompt);
            },
          }
        : {}),
    },
  };

  const commandPromise = command.run({ parsed, context: executionContext });
  const timeoutSeconds = parsed.flags.get("timeout");
  if (timeoutSeconds === undefined) {
    const exitCode = await commandPromise;
    active = false;
    return { exitCode, stdout: chunks.join("") };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof timeoutResult>((resolveTimeout) => {
    timer = setTimeout(() => {
      active = false;
      controller.abort();
      resolveTimeout(timeoutResult);
    }, Number(timeoutSeconds) * 1000);
  });
  const outcome = await Promise.race([commandPromise, timeoutPromise]);
  if (timer) clearTimeout(timer);

  if (outcome !== timeoutResult) {
    active = false;
    return { exitCode: outcome, stdout: chunks.join("") };
  }

  void commandPromise.catch(() => undefined);
  return {
    exitCode: 2,
    stdout: `${JSON.stringify({
      ok: false,
      error: {
        code: "TIMEOUT",
        message: `Command timed out after ${timeoutSeconds} seconds`,
        timeoutSeconds: Number(timeoutSeconds),
      },
    })}\n`,
  };
}

async function deliverOutput(
  result: CommandResult,
  parsed: ParsedArgs,
  context: CliContext,
): Promise<number> {
  const output = parsed.flags.has("pretty")
    ? prettyJson(result.stdout)
    : result.stdout;
  const requestedPath = parsed.flags.get("output");
  if (requestedPath === undefined) {
    context.io.stdout(output);
    return result.exitCode;
  }

  const outputPath = resolve(requestedPath);
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    const file = await open(outputPath, "w", 0o600);
    try {
      await file.chmod(0o600);
      await file.writeFile(output);
    } finally {
      await file.close();
    }
    context.io.stderr(`Output written to: ${outputPath}\n`);
    return result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = {
      ok: false,
      error: {
        code: "OUTPUT_ERROR",
        message: `Could not write output to ${outputPath}: ${message}`,
        path: outputPath,
      },
    };
    context.io.stdout(
      parsed.flags.has("pretty")
        ? `${JSON.stringify(failure, null, 2)}\n`
        : `${JSON.stringify(failure)}\n`,
    );
    return 1;
  }
}

function prettyJson(output: string): string {
  try {
    return `${JSON.stringify(JSON.parse(output), null, 2)}\n`;
  } catch {
    return output;
  }
}
