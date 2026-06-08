import { parseArgs } from "./args";
import { commandSpecs } from "./commands";
import { renderHelp } from "./help";
import { writeError } from "./output";
import type { CliContext } from "./types";

export async function runCli(
  args: string[],
  context: CliContext,
): Promise<number> {
  if (args.includes("--help") || args.length === 0) {
    context.io.stdout(renderHelp());
    return 0;
  }

  const parsed = parseArgs(args);
  const command = commandSpecs.find((candidate) => candidate.matches(parsed));

  if (!command) {
    writeError(
      context,
      "INPUT_ERROR",
      `Unknown command: ${args.join(" ")}`,
    );
    return 1;
  }

  return command.run({ parsed, context });
}
