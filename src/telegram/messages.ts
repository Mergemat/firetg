import { Api, type TelegramClient } from "teleproto";
import type { MessageSummary, SentMessage } from "./types";
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
  const normalized = normalizeUser(to);
  if (!isUserId(normalized)) return to;

  return getKnownUserEntityById(client, normalized);
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

function serializeSentMessage(message: Api.Message): SentMessage {
  return {
    id: Number(message.id),
    date: message.date,
    text: message.message,
  };
}

function serializeMessage(message: Api.Message): MessageSummary {
  return {
    id: Number(message.id),
    date: message.date,
    text: message.message,
    senderId: peerIdToString(message.fromId),
    chatId: peerIdToString(message.peerId),
    outgoing: message.out,
  };
}

function serializeMessages(messages: Api.Message[]): MessageSummary[] {
  return [...messages].sort(compareMessagesNewestFirst).map(serializeMessage);
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
