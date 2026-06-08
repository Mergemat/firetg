import { readPositiveInt } from "../args";
import { writeError, writeJson } from "../output";
import { runWithTelegram } from "./shared";
import type { CommandSpec } from "./types";

export const messagesListCommand: CommandSpec = {
  id: "messages.list",
  usage: "messages:list --chat <peer> [--limit <n>] [--search <query>]",
  matches: (parsed) => parsed.command === "messages:list",
  async run({ parsed, context }) {
    const chat = parsed.flags.get("chat");

    if (!chat) {
      writeError(context, "INPUT_ERROR", "messages:list requires --chat");
      return 1;
    }

    return runWithTelegram(context, async (telegram) => {
      writeJson(context, true, {
        data: await telegram.listMessages({
          chat,
          limit: readPositiveInt(parsed.flags, "limit", 20),
          search: parsed.flags.get("search"),
        }),
      });
      return 0;
    });
  },
};
