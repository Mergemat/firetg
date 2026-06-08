import { parseArgs } from "./args";
import { commandModules, commandSpecs } from "./commands";
import { renderCommandHelp, renderHelp, renderModuleHelp } from "./help";
import { writeError } from "./output";
import type { CliContext } from "./types";

export async function runCli(
  args: string[],
  context: CliContext,
): Promise<number> {
  const parsed = parseArgs(args);

  if (args.length === 0 || parsed.command === "--help") {
    context.io.stdout(renderHelp());
    return 0;
  }

  const command = commandSpecs.find((candidate) => candidate.matches(parsed));
  const module = commandModules.find(
    (candidate) => candidate.scope === parsed.command,
  );

  if (parsed.flags.has("help")) {
    context.io.stdout(
      command
        ? renderCommandHelp(command)
        : module
          ? renderModuleHelp(module)
          : renderHelp(),
    );
    return 0;
  }

  if (!command && module && parsed.subcommand === undefined) {
    context.io.stdout(renderModuleHelp(module));
    return 0;
  }

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
