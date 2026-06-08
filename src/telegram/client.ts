import { TelegramClient } from "teleproto";
import { Logger, LogLevel } from "teleproto/extensions/Logger";
import { StringSession } from "teleproto/sessions";
import type { TelegramConfig } from "../config";
import { loginTelegramAccount } from "./auth";
import {
  createTeleprotoDialogSource,
  listDialogSummaries,
} from "./dialogs";
import { listTelegramFolders } from "./folders";
import { listTelegramMessages, sendTelegramMessage } from "./messages";
import { getCurrentAccount } from "./profile";
import type { FireTgClient } from "./types";

export async function createTeleprotoClient(
  config: TelegramConfig,
): Promise<FireTgClient> {
  const client = new TelegramClient(
    new StringSession(config.session),
    config.apiId,
    config.apiHash,
    {
      baseLogger: new Logger(LogLevel.NONE),
      connectionRetries: 5,
      autoReconnect: false,
      reconnectRetries: 0,
    },
  );

  if (config.session) {
    await client.connect();
  }

  const dialogSource = createTeleprotoDialogSource(client);

  return {
    login: (params) => loginTelegramAccount(client, config, params),
    getMe: () => getCurrentAccount(client),
    sendMessage: (to, text) => sendTelegramMessage(client, to, text),
    listFolders: async () =>
      listTelegramFolders(await dialogSource.getDialogFilters()),
    listDialogs: (options) => listDialogSummaries(dialogSource, options),
    listMessages: (options) => listTelegramMessages(client, options),
    disconnect: async () => {
      await client.destroy();
    },
  };
}
