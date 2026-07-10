import type { TelegramConfig } from "../config";

export type Account = {
  id: string;
  firstName: string;
  username?: string;
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
  id: number;
  date: number;
  text: string;
  media?: MessageMediaSummary;
};

export type SendMessageInput = {
  text?: string;
  attachment?: string;
  forceDocument?: boolean;
  /** Unix timestamp in seconds for Telegram-native scheduled delivery. */
  scheduledAt?: number;
};

export type DialogSummary = {
  id: string;
  title: string;
  folderId?: number;
  unreadCount: number;
  isUser: boolean;
  isGroup: boolean;
  isChannel: boolean;
};

export type FolderSummary = {
  id?: number;
  title: string;
  type: string;
  emoticon?: string;
  color?: number;
};

export type MessageSummary = {
  id: number;
  date: number;
  text: string;
  textTruncated?: boolean;
  media?: MessageMediaSummary;
  senderId: string;
  chatId: string;
  replyToMessageId?: number;
  outgoing: boolean;
  readReceipt?: MessageReadReceipt;
};

export type MessageReadReceipt = {
  read: boolean;
  direction: "inbox" | "outbox";
};

export type MessageMediaSummary = {
  type: string;
  fileName?: string;
  mimeType?: string;
  size?: string;
  title?: string;
  url?: string;
  phoneNumber?: string;
};

export type ChannelDetails = {
  id: string;
  title: string;
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
      qrCode: (qrCode: { url: string; expires: Date }) => void;
      password: (hint?: string) => Promise<string>;
    };

export type FireTgClient = {
  login: (params: LoginParams) => Promise<Account>;
  logout: () => Promise<void>;
  getMe: () => Promise<Account>;
  getProfile: (user: string) => Promise<Profile>;
  getChannel: (channel: string) => Promise<ChannelDetails>;
  sendMessage: (
    to: string,
    message: string | SendMessageInput,
  ) => Promise<SentMessage>;
  listFolders: () => Promise<FolderSummary[]>;
  listDialogs: (options: { limit: number; folder?: number }) => Promise<DialogSummary[]>;
  listMessages: (options: {
    chat: string;
    limit: number;
    search?: string;
  }) => Promise<MessageSummary[]>;
  listReplies: (options: {
    chat: string;
    messageId: number;
    from: string[];
    limit: number;
  }) => Promise<MessageSummary[]>;
  listPinnedMessages: (options: {
    chat: string;
    limit: number;
  }) => Promise<MessageSummary[]>;
  disconnect: () => Promise<void>;
};

export type CreateTelegramClient = (config: TelegramConfig) => Promise<FireTgClient>;
