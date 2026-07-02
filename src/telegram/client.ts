import { TelegramClient } from "teleproto";
import { Logger, LogLevel } from "teleproto/extensions/Logger";
import { StringSession } from "teleproto/sessions";
import type { TelegramConfig } from "../config";
import { loginTelegramAccount } from "./auth";
import { getChannelDetails } from "./channels";
import {
  createTeleprotoDialogSource,
  listDialogSummaries,
} from "./dialogs";
import { listTelegramFolders } from "./folders";
import {
  listTelegramReplies,
  listTelegramMessages,
  listTelegramPinnedMessages,
  sendTelegramMessage,
} from "./messages";
import { createPeerResolver } from "./peers";
import { getCurrentAccount, getPublicProfile } from "./profile";
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
  const resolver = createPeerResolver(client, config.peersPath);

  return {
    login: (params) => loginTelegramAccount(client, config, params),
    logout: async () => {
      if (!(await client.logOut())) {
        throw new Error("Telegram logout failed");
      }
    },
    getMe: () => getCurrentAccount(client),
    getProfile: (username) => getPublicProfile(client, resolver, username),
    getChannel: (channel) => getChannelDetails(client, resolver, channel),
    sendMessage: (to, text) => sendTelegramMessage(client, resolver, to, text),
    listFolders: async () =>
      listTelegramFolders(await dialogSource.getDialogFilters()),
    listDialogs: (options) => listDialogSummaries(dialogSource, options),
    listMessages: (options) => listTelegramMessages(client, resolver, options),
    listReplies: (options) => listTelegramReplies(client, resolver, options),
    listPinnedMessages: (options) =>
      listTelegramPinnedMessages(client, resolver, options),
    disconnect: async () => {
      await client.destroy();
    },
  };
}
