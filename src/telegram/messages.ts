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

  return messages.map(serializeMessage);
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
    senderId: message.fromId?.toString(),
    chatId: message.peerId?.toString(),
    outgoing: message.out,
  };
}
