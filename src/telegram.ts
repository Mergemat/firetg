import { Api, TelegramClient } from "teleproto";
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

export async function createTeleprotoClient(
  config: TelegramConfig,
): Promise<FireTgClient> {
  const client = new TelegramClient(
    new StringSession(config.session),
    config.apiId,
    config.apiHash,
    { connectionRetries: 5 },
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
      const dialogs = await client.getDialogs({
        limit: options.limit,
        folder: options.folder,
      });
      return dialogs.map((dialog) => ({
        id: dialog.id?.toString(),
        title: dialog.title,
        folderId: dialog.folderId,
        unreadCount: dialog.unreadCount,
        isUser: dialog.isUser,
        isGroup: dialog.isGroup,
        isChannel: dialog.isChannel,
      }));
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
