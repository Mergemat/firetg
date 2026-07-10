import { rm } from "node:fs/promises";
import { TelegramClient } from "@mtcute/bun";
import { convertFromGramjsSession } from "@mtcute/convert";
import type { TelegramConfig } from "../config";
import { secureSqliteFiles } from "../localStore";
import { loginTelegramAccount } from "./auth";
import { getChannelDetails } from "./channels";
import { listDialogSummaries } from "./dialogs";
import { listTelegramFolders } from "./folders";
import {
  listTelegramMessages,
  listTelegramPinnedMessages,
  listTelegramReplies,
  sendTelegramMessage,
} from "./messages";
import { getCurrentAccount, getPublicProfile } from "./profile";
import type { FireTgClient } from "./types";

export async function createMtcuteClient(
  config: TelegramConfig,
): Promise<FireTgClient> {
  const client = new TelegramClient({
    apiId: config.apiId,
    apiHash: config.apiHash,
    storage: config.storagePath,
    disableUpdates: true,
    logLevel: 0,
  });

  if (config.legacySession) {
    try {
      await client.importSession(convertFromGramjsSession(config.legacySession));
      await client.getMe();
      await Promise.all(
        [config.legacySessionPath, config.legacyPeersPath].flatMap((path) =>
          path ? [rm(path, { force: true })] : [],
        ),
      );
    } catch (error) {
      await client.destroy().catch(() => undefined);
      throw new Error(
        `Could not migrate the legacy Telegram session: ${errorMessage(error)}. Run firetg auth login to create a new mtcute session.`,
        { cause: error },
      );
    }
  }

  await secureSqliteFiles(config.storagePath);

  return {
    login: (params) => loginTelegramAccount(client, params),
    logout: async () => {
      await client.logOut();
    },
    getMe: () => getCurrentAccount(client),
    getProfile: (username) => getPublicProfile(client, username),
    getChannel: (channel) => getChannelDetails(client, channel),
    sendMessage: (to, message) => sendTelegramMessage(client, to, message),
    listFolders: () => listTelegramFolders(client),
    listDialogs: (options) => listDialogSummaries(client, options),
    listMessages: (options) => listTelegramMessages(client, options),
    listReplies: (options) => listTelegramReplies(client, options),
    listPinnedMessages: (options) =>
      listTelegramPinnedMessages(client, options),
    disconnect: () => client.destroy(),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
