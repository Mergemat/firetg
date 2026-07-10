import {
  InputMedia,
  Long,
  Message,
  PeersIndex,
  SearchFilters,
  type MessageMedia,
  type TelegramClient,
} from "@mtcute/bun";
import { extname } from "node:path";
import type {
  MessageMediaSummary,
  MessageReadReceipt,
  MessageSummary,
  SendMessageInput,
  SentMessage,
} from "./types";
import { normalizePeerInput } from "./peers";

type MessageReadState = {
  readInboxMaxId: number;
  readOutboxMaxId: number;
};

export async function sendTelegramMessage(
  client: TelegramClient,
  to: string,
  message: string | SendMessageInput,
): Promise<SentMessage> {
  const peer = normalizePeerInput(to, "user");
  const input = typeof message === "string" ? { text: message } : message;
  const schedule = input.scheduledAt
    ? new Date(input.scheduledAt * 1000)
    : undefined;
  const sent = input.attachment
    ? await client.sendMedia(
        peer,
        input.forceDocument
          ? InputMedia.document(input.attachment)
          : mediaForPath(input.attachment),
        { caption: input.text, schedule },
      )
    : await client.sendText(peer, input.text ?? "", { schedule });

  return serializeSentMessage(sent);
}

function mediaForPath(path: string) {
  const extension = extname(path).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
    return InputMedia.photo(path);
  }
  if ([".mp4", ".mov", ".m4v", ".webm"].includes(extension)) {
    return InputMedia.video(path);
  }
  if (extension === ".gif") return InputMedia.animation(path);
  if ([".mp3", ".m4a", ".aac", ".flac", ".ogg", ".wav"].includes(extension)) {
    return InputMedia.audio(path);
  }
  return InputMedia.document(path);
}

export async function listTelegramMessages(
  client: TelegramClient,
  options: { chat: string; limit: number; search?: string },
): Promise<MessageSummary[]> {
  const chat = normalizePeerInput(options.chat);
  const messages = options.search
    ? await client.searchMessages({
        chatId: chat,
        query: options.search,
        limit: options.limit,
      })
    : await client.getHistory(chat, { limit: options.limit });

  return serializeMessages(messages, await getMessageReadState(client, chat));
}

export async function listTelegramPinnedMessages(
  client: TelegramClient,
  options: { chat: string; limit: number },
): Promise<MessageSummary[]> {
  const chat = normalizePeerInput(options.chat);
  const messages = await client.searchMessages({
    chatId: chat,
    filter: SearchFilters.Pinned,
    limit: options.limit,
  });

  return serializeMessages(messages, await getMessageReadState(client, chat));
}

export async function listTelegramReplies(
  client: TelegramClient,
  options: {
    chat: string;
    messageId: number;
    from: string[];
    limit: number;
  },
): Promise<MessageSummary[]> {
  const chat = normalizePeerInput(options.chat);
  const peer = await client.resolvePeer(chat);
  const senders = await client.getPeers(
    options.from.map((sender) => normalizePeerInput(sender, "user")),
  );
  const senderIds = new Set(
    senders.flatMap((sender) => (sender ? [sender.id] : [])),
  );
  const response = await client.call({
    _: "messages.getReplies",
    peer,
    msgId: options.messageId,
    offsetId: 0,
    offsetDate: 0,
    addOffset: 0,
    limit: Math.max(options.limit, 1),
    maxId: 0,
    minId: 0,
    hash: Long.ZERO,
  });

  if (response._ === "messages.messagesNotModified") return [];

  const peers = PeersIndex.from(response);
  const messages = response.messages
    .filter((raw) => raw._ !== "messageEmpty")
    .map((raw) => new Message(raw, peers))
    .filter((message) => senderIds.has(message.sender.id))
    .slice(0, options.limit);

  return serializeMessages(messages, await getMessageReadState(client, chat));
}

async function getMessageReadState(
  client: TelegramClient,
  chat: Parameters<TelegramClient["getPeerDialogs"]>[0],
): Promise<MessageReadState | undefined> {
  const dialog = (await client.getPeerDialogs(chat))[0];
  return dialog
    ? {
        readInboxMaxId: dialog.lastReadIngoing,
        readOutboxMaxId: dialog.lastReadOutgoing,
      }
    : undefined;
}

function serializeSentMessage(message: Message): SentMessage {
  return {
    id: message.id,
    date: toUnixSeconds(message.date),
    text: message.text,
    ...(message.media ? { media: serializeMessageMedia(message.media) } : {}),
  };
}

export function serializeMessage(
  message: Message,
  readState?: MessageReadState,
): MessageSummary {
  const replyToMessageId = message.replyToMessage?.id ?? undefined;
  return {
    id: message.id,
    date: toUnixSeconds(message.date),
    text: message.text,
    senderId: unmarkPeerId(message.sender.id),
    chatId: unmarkPeerId(message.chat.id),
    outgoing: message.isOutgoing,
    ...(message.media ? { media: serializeMessageMedia(message.media) } : {}),
    ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
    ...(readState
      ? { readReceipt: serializeMessageReadReceipt(message, readState) }
      : {}),
  };
}

function serializeMessages(
  messages: Iterable<Message>,
  readState?: MessageReadState,
): MessageSummary[] {
  return [...messages]
    .sort((left, right) =>
      right.date.getTime() - left.date.getTime() || right.id - left.id,
    )
    .map((message) => serializeMessage(message, readState));
}

function serializeMessageReadReceipt(
  message: Message,
  readState: MessageReadState,
): MessageReadReceipt {
  return message.isOutgoing
    ? {
        read: message.id <= readState.readOutboxMaxId,
        direction: "outbox",
      }
    : {
        read: message.id <= readState.readInboxMaxId,
        direction: "inbox",
      };
}

function serializeMessageMedia(media: Exclude<MessageMedia, null>): MessageMediaSummary {
  switch (media.type) {
    case "photo":
      return { type: "photo" };
    case "video":
      return documentSummary(
        media.isAnimation ? "gif" : media.isRound ? "video_note" : "video",
        media,
      );
    case "audio":
    case "voice":
    case "sticker":
    case "document":
      return documentSummary(media.type, media);
    case "webpage":
      return {
        type: "webpage",
        title: media.preview.title ?? undefined,
        url: media.preview.url,
      };
    case "contact":
      return {
        type: "contact",
        title:
          [media.firstName, media.lastName].filter(Boolean).join(" ") ||
          undefined,
        phoneNumber: media.phoneNumber,
      };
    case "venue":
      return { type: "venue", title: media.title };
    case "live_location":
      return { type: "live_geo" };
    case "location":
      return { type: "geo" };
    case "game":
      return { type: "game", title: media.title };
    case "invoice":
      return { type: "invoice", title: media.title };
    case "poll":
      return { type: "poll", title: media.question };
    case "dice":
      return { type: "dice", title: media.emoji };
    default:
      return { type: media.type };
  }
}

function documentSummary(
  type: string,
  media: {
    fileName: string | null;
    mimeType: string;
    fileSize?: number;
  },
): MessageMediaSummary {
  return {
    type,
    ...(media.fileName ? { fileName: media.fileName } : {}),
    ...(media.mimeType ? { mimeType: media.mimeType } : {}),
    ...(media.fileSize === undefined ? {} : { size: String(media.fileSize) }),
  };
}

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function unmarkPeerId(id: number): string {
  const value = String(id);
  if (value.startsWith("-100")) return value.slice(4);
  if (value.startsWith("-")) return value.slice(1);
  return value;
}
