import type { TelegramConfig } from "../config";

export type Account = {
  id?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
};

export type Profile = Account & {
  about?: string;
  bot?: boolean;
  verified?: boolean;
  premium?: boolean;
  restricted?: boolean;
  scam?: boolean;
  fake?: boolean;
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

export type ChannelDetails = {
  id?: string;
  title?: string;
  username?: string;
  description?: string;
  participantsCount?: number;
  pinnedMessage?: MessageSummary;
  verified?: boolean;
  restricted?: boolean;
  scam?: boolean;
  fake?: boolean;
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
  logout: () => Promise<void>;
  getMe: () => Promise<Account>;
  getProfile: (user: string) => Promise<Profile>;
  getChannel: (channel: string) => Promise<ChannelDetails>;
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
