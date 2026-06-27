import { Api, type TelegramClient } from "teleproto";
import type { MessageMediaSummary, MessageSummary, SentMessage } from "./types";
import { getKnownUserEntityById, isUserId, normalizeUser } from "./users";

export async function sendTelegramMessage(
  client: TelegramClient,
  to: string,
  text: string,
): Promise<SentMessage> {
  const entity = await resolveMessageRecipient(client, to);

  return serializeSentMessage(
    await client.sendMessage(entity, { message: text, parseMode: undefined }),
  );
}

async function resolveMessageRecipient(
  client: TelegramClient,
  to: string,
): Promise<string | Api.User> {
  return resolveMessageUser(client, to);
}

export async function listTelegramMessages(
  client: TelegramClient,
  options: {
    chat: string;
    limit: number;
    search?: string;
  },
): Promise<MessageSummary[]> {
  const messages = await client.getMessages(options.chat, {
    limit: options.limit,
    search: options.search,
  });

  return serializeMessages(messages);
}

export async function listTelegramPinnedMessages(
  client: TelegramClient,
  options: {
    chat: string;
    limit: number;
  },
): Promise<MessageSummary[]> {
  const messages = await client.getMessages(options.chat, {
    limit: options.limit,
    filter: new Api.InputMessagesFilterPinned(),
  });

  return serializeMessages(messages);
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
  const replies = await listRepliesFromSenders(client, {
    chat: options.chat,
    messageId: options.messageId,
    senders: options.from,
    limit: options.limit,
  });

  return serializeMessages(replies);
}

function serializeSentMessage(message: Api.Message): SentMessage {
  return {
    id: Number(message.id),
    date: message.date,
    text: message.message,
  };
}

function serializeMessage(message: Api.Message): MessageSummary {
  const media = serializeMessageMedia(message);
  const senderId = peerIdToString(message.fromId);
  const chatId = peerIdToString(message.peerId);
  const summary: MessageSummary = {
    id: Number(message.id),
    date: message.date,
    text: message.message,
  };
  const replyToMessageId = messageReplyToMessageId(message);

  if (media) summary.media = media;
  if (senderId !== undefined) summary.senderId = senderId;
  if (chatId !== undefined) summary.chatId = chatId;
  if (message.out !== undefined) summary.outgoing = message.out;
  if (replyToMessageId !== undefined) {
    summary.replyToMessageId = replyToMessageId;
  }

  return summary;
}

function serializeMessages(messages: Api.Message[]): MessageSummary[] {
  return sortMessagesNewestFirst(messages).map(serializeMessage);
}

function sortMessagesNewestFirst(messages: Api.Message[]): Api.Message[] {
  return [...messages].sort(compareMessagesNewestFirst);
}

async function listRepliesFromSenders(
  client: TelegramClient,
  options: {
    chat: string;
    messageId: number;
    senders: string[];
    limit: number;
  },
): Promise<Api.Message[]> {
  const senders = await Promise.all(
    options.senders.map((sender) => resolveMessageUser(client, sender)),
  );
  const repliesBySender = await Promise.all(
    senders.map((sender) =>
      listRepliesFromSender(client, {
        chat: options.chat,
        messageId: options.messageId,
        sender,
        limit: options.limit,
      }),
    ),
  );

  return uniqueMessages(repliesBySender.flat());
}

async function listRepliesFromSender(
  client: TelegramClient,
  options: {
    chat: string;
    messageId: number;
    sender: string | Api.User;
    limit: number;
  },
): Promise<Api.Message[]> {
  try {
    return await client.getMessages(options.chat, {
      limit: options.limit,
      replyTo: options.messageId,
      fromUser: options.sender,
    });
  } catch (error) {
    if (!isPeerIdInvalid(error)) throw error;
  }

  const senderMessages = await client.getMessages(options.chat, {
    limit: options.limit,
    fromUser: options.sender,
  });

  return senderMessages.filter(
    (message) => messageReplyToMessageId(message) === options.messageId,
  );
}

async function resolveMessageUser(
  client: TelegramClient,
  user: string,
): Promise<string | Api.User> {
  const normalized = normalizeUser(user);
  if (!isUserId(normalized)) return normalized;

  return getKnownUserEntityById(client, normalized);
}

function uniqueMessages(messages: Api.Message[]): Api.Message[] {
  const seen = new Set<number>();
  const unique: Api.Message[] = [];

  for (const message of messages) {
    const id = Number(message.id);
    if (seen.has(id)) continue;

    seen.add(id);
    unique.push(message);
  }

  return unique;
}

function isPeerIdInvalid(error: unknown): boolean {
  return error instanceof Error && error.message.includes("PEER_ID_INVALID");
}

function compareMessagesNewestFirst(left: Api.Message, right: Api.Message): number {
  const leftDate = left.date ?? 0;
  const rightDate = right.date ?? 0;
  if (leftDate !== rightDate) return rightDate - leftDate;

  return Number(right.id ?? 0) - Number(left.id ?? 0);
}

function peerIdToString(peer?: Api.TypePeer): string | undefined {
  if (peer instanceof Api.PeerUser) return peer.userId.toString();
  if (peer instanceof Api.PeerChat) return peer.chatId.toString();
  if (peer instanceof Api.PeerChannel) return peer.channelId.toString();
  return undefined;
}

function messageReplyToMessageId(message: Api.Message): number | undefined {
  if (message.replyTo instanceof Api.MessageReplyHeader) {
    return message.replyTo.replyToMsgId;
  }

  return undefined;
}

function serializeMessageMedia(message: Api.Message): MessageMediaSummary | undefined {
  const media = message.media;

  if (!media || media instanceof Api.MessageMediaEmpty) return undefined;
  if (media instanceof Api.MessageMediaPhoto) return { type: "photo" };
  if (media instanceof Api.MessageMediaDocument) {
    return serializeDocumentMedia(message, media.document);
  }
  if (media instanceof Api.MessageMediaWebPage) {
    return {
      type: "webpage",
      title: message.webPreview?.title,
      url: message.webPreview?.url,
    };
  }
  if (media instanceof Api.MessageMediaContact) {
    return {
      type: "contact",
      title: [media.firstName, media.lastName].filter(Boolean).join(" ") || undefined,
      phoneNumber: media.phoneNumber,
    };
  }
  if (media instanceof Api.MessageMediaVenue) {
    return { type: "venue", title: media.title };
  }
  if (media instanceof Api.MessageMediaGeoLive) return { type: "live_geo" };
  if (media instanceof Api.MessageMediaGeo) return { type: "geo" };
  if (media instanceof Api.MessageMediaGame) {
    return { type: "game", title: message.game?.title };
  }
  if (media instanceof Api.MessageMediaInvoice) {
    return { type: "invoice", title: media.title };
  }
  if (media instanceof Api.MessageMediaPoll) {
    return { type: "poll", title: media.poll.question.text };
  }
  if (media instanceof Api.MessageMediaDice) {
    return { type: "dice", title: media.emoticon };
  }
  if (media instanceof Api.MessageMediaUnsupported) return { type: "unsupported" };

  return { type: media.className.replace(/^MessageMedia/, "").toLowerCase() || "unknown" };
}

function serializeDocumentMedia(
  message: Api.Message,
  document?: Api.TypeDocument,
): MessageMediaSummary {
  const apiDocument = document instanceof Api.Document ? document : undefined;
  const summary: MessageMediaSummary = {
    type: documentMediaType(message, apiDocument),
    fileName: documentFileName(apiDocument),
    mimeType: apiDocument?.mimeType,
    size: apiDocument?.size.toString(),
  };

  return summary;
}

function documentMediaType(message: Api.Message, document?: Api.Document): string {
  if (message.sticker) return "sticker";
  if (message.gif) return "gif";
  if (message.videoNote) return "video_note";
  if (message.voice) return "voice";
  if (message.audio) return "audio";
  if (message.video) return "video";

  const mimeType = document?.mimeType ?? "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";

  return "document";
}

function documentFileName(document?: Api.Document): string | undefined {
  return document?.attributes.find(
    (attribute): attribute is Api.DocumentAttributeFilename =>
      attribute instanceof Api.DocumentAttributeFilename,
  )?.fileName;
}
