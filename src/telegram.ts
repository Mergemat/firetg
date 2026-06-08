import { Api, TelegramClient } from "teleproto";
import { Logger, LogLevel } from "teleproto/extensions/Logger";
import { StringSession } from "teleproto/sessions";
import type { TelegramConfig } from "./config";

export type Account = {
  id?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
};

export type SentMessage = {
  id?: number;
  date?: number;
  text?: string;
};

export type DialogSummary = {
  id?: string;
  title?: string;
  folderId?: number;
  unreadCount?: number;
  isUser?: boolean;
  isGroup?: boolean;
  isChannel?: boolean;
};

export type FolderSummary = {
  id?: number;
  title: string;
  type: string;
  emoticon?: string;
  color?: number;
};

export type MessageSummary = {
  id?: number;
  date?: number;
  text?: string;
  senderId?: string;
  chatId?: string;
  outgoing?: boolean;
};

export type LoginParams =
  | {
      mode: "phone";
      phoneNumber: string;
      phoneCode: (isCodeViaApp?: boolean) => Promise<string>;
      password: (hint?: string) => Promise<string>;
    }
  | {
      mode: "qr";
      qrCode: (qrCode: { token: Buffer; expires: number }) => Promise<void>;
      password: (hint?: string) => Promise<string>;
    };

export type FireTgClient = {
  login: (params: LoginParams) => Promise<{ session: string }>;
  getMe: () => Promise<Account>;
  sendMessage: (to: string, text: string) => Promise<SentMessage>;
  listFolders: () => Promise<FolderSummary[]>;
  listDialogs: (options: { limit: number; folder?: number }) => Promise<DialogSummary[]>;
  listMessages: (options: {
    chat: string;
    limit: number;
    search?: string;
  }) => Promise<MessageSummary[]>;
  disconnect?: () => Promise<void>;
};

export type CreateTelegramClient = (config: TelegramConfig) => Promise<FireTgClient>;
type TeleprotoDialog = Awaited<ReturnType<TelegramClient["getDialogs"]>>[number];

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
    },
  );

  if (config.session) {
    await client.connect();
  }

  return {
    async login(params) {
      if (params.mode === "qr") {
        await client.connect();
        await client.signInUserWithQrCode(
          { apiId: config.apiId, apiHash: config.apiHash },
          {
            qrCode: params.qrCode,
            password: params.password,
            onError: (error) => {
              throw error;
            },
          },
        );
      } else {
        await client.start({
          phoneNumber: async () => params.phoneNumber,
          phoneCode: params.phoneCode,
          password: params.password,
          onError: (error) => {
            throw error;
          },
        });
      }

      return { session: (client.session as StringSession).save() };
    },
    async getMe() {
      return serializeUser(await client.getMe());
    },
    async sendMessage(to, text) {
      return serializeSentMessage(
        await client.sendMessage(to, { message: text, parseMode: undefined }),
      );
    },
    async listFolders() {
      const response = await client.invoke(new Api.messages.GetDialogFilters());
      return response.filters.map(serializeFolder);
    },
    async listDialogs(options) {
      if (options.folder !== undefined && !isPeerFolderId(options.folder)) {
        const dialogs = await listDialogsByFilter(client, options.folder);
        return dialogs.slice(0, options.limit).map(serializeDialog);
      }

      const dialogs = await client.getDialogs({
        limit: options.limit,
        folder: options.folder,
      });
      return dialogs.map(serializeDialog);
    },
    async listMessages(options) {
      const messages = await client.getMessages(options.chat, {
        limit: options.limit,
        search: options.search,
      });
      return messages.map(serializeMessage);
    },
    async disconnect() {
      await client.disconnect();
    },
  };
}

async function listDialogsByFilter(
  client: TelegramClient,
  filterId: number,
): Promise<TeleprotoDialog[]> {
  const filter = await findDialogFilter(client, filterId);

  if (!filter) {
    throw new Error(
      `Custom folder ${filterId} not found. Run folders list to see available ids.`,
    );
  }

  const dialogs = await client.getDialogs({});
  return dialogs.filter((dialog) => matchesDialogFilter(dialog, filter));
}

async function findDialogFilter(
  client: TelegramClient,
  filterId: number,
): Promise<Api.DialogFilter | Api.DialogFilterChatlist | undefined> {
  const response = await client.invoke(new Api.messages.GetDialogFilters());
  return response.filters.find(
    (filter): filter is Api.DialogFilter | Api.DialogFilterChatlist =>
      (filter instanceof Api.DialogFilter ||
        filter instanceof Api.DialogFilterChatlist) &&
      filter.id === filterId,
  );
}

function matchesDialogFilter(
  dialog: TeleprotoDialog,
  filter: Api.DialogFilter | Api.DialogFilterChatlist,
): boolean {
  const peerKey = inputPeerKey(dialog.inputEntity);
  if (!peerKey) return false;

  const excludedPeers =
    filter instanceof Api.DialogFilter
      ? new Set(filter.excludePeers.map(inputPeerKey))
      : new Set<string | undefined>();

  if (excludedPeers.has(peerKey)) return false;

  const includedPeers = new Set([
    ...filter.pinnedPeers.map(inputPeerKey),
    ...filter.includePeers.map(inputPeerKey),
  ]);

  if (includedPeers.has(peerKey)) return true;
  if (filter instanceof Api.DialogFilterChatlist) return false;

  if (filter.excludeArchived && dialog.folderId !== undefined) return false;
  if (filter.excludeRead && dialog.unreadCount <= 0 && !dialog.dialog.unreadMark) {
    return false;
  }
  if (filter.excludeMuted && isMuted(dialog)) return false;

  return matchesDialogFilterCategory(dialog, filter);
}

function matchesDialogFilterCategory(
  dialog: TeleprotoDialog,
  filter: Api.DialogFilter,
): boolean {
  if (filter.bots && dialog.entity instanceof Api.User && dialog.entity.bot) {
    return true;
  }

  if (
    filter.contacts &&
    dialog.entity instanceof Api.User &&
    !dialog.entity.bot &&
    (dialog.entity.contact || dialog.entity.mutualContact)
  ) {
    return true;
  }

  if (
    filter.nonContacts &&
    dialog.entity instanceof Api.User &&
    !dialog.entity.bot &&
    !dialog.entity.contact &&
    !dialog.entity.mutualContact
  ) {
    return true;
  }

  if (filter.groups && dialog.isGroup) return true;

  return (
    !!filter.broadcasts &&
    dialog.entity instanceof Api.Channel &&
    !!dialog.entity.broadcast
  );
}

function isMuted(dialog: TeleprotoDialog): boolean {
  const muteUntil = dialog.dialog.notifySettings.muteUntil;
  return muteUntil !== undefined && muteUntil > Math.floor(Date.now() / 1000);
}

function inputPeerKey(inputPeer: Api.TypeInputPeer): string | undefined {
  if (inputPeer instanceof Api.InputPeerUser) {
    return `user:${inputPeer.userId.toString()}`;
  }

  if (inputPeer instanceof Api.InputPeerChat) {
    return `chat:${inputPeer.chatId.toString()}`;
  }

  if (inputPeer instanceof Api.InputPeerChannel) {
    return `channel:${inputPeer.channelId.toString()}`;
  }

  return undefined;
}

function isPeerFolderId(folderId: number): boolean {
  return folderId === 0 || folderId === 1;
}

function serializeDialog(dialog: TeleprotoDialog): DialogSummary {
  return {
    id: dialog.id?.toString(),
    title: dialog.title,
    folderId: dialog.folderId,
    unreadCount: dialog.unreadCount,
    isUser: dialog.isUser,
    isGroup: dialog.isGroup,
    isChannel: dialog.isChannel,
  };
}

function serializeUser(user: Api.User): Account {
  return {
    id: user.id?.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
  };
}

function serializeSentMessage(message: Api.Message): SentMessage {
  return {
    id: Number(message.id),
    date: message.date,
    text: message.message,
  };
}

function serializeFolder(folder: Api.TypeDialogFilter): FolderSummary {
  if (folder instanceof Api.DialogFilterDefault) {
    return { title: "All chats", type: folder.className };
  }

  return {
    id: folder.id,
    title: textWithEntitiesToString(folder.title),
    type: folder.className,
    emoticon: folder.emoticon,
    color: folder.color,
  };
}

function serializeMessage(message: Api.Message): MessageSummary {
  return {
    id: Number(message.id),
    date: message.date,
    text: message.message,
    senderId: message.fromId?.toString(),
    chatId: message.peerId?.toString(),
    outgoing: message.out,
  };
}

function textWithEntitiesToString(value: Api.TypeTextWithEntities): string {
  return "text" in value ? value.text : "";
}
