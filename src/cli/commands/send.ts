import { writeError, writeJson } from "../output";
import { matchesScopedCommand, runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const sendCommand: CommandSpec = {
  id: "messages.send",
  usage: "messages send --to <peer> --text <message>",
  matches: (parsed) =>
    matchesScopedCommand(parsed, "messages", "send") ||
    parsed.command === "send",
  async run({ parsed, context }) {
    const to = parsed.flags.get("to");
    const text = parsed.flags.get("text");

    if (!to || !text) {
      writeError(
        context,
        "INPUT_ERROR",
        "messages send requires --to and --text",
      );
      return 1;
    }

    return runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.sendMessage(to, text),
      });
      return 0;
    });
  },
};
