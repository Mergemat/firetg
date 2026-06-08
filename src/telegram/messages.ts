import { Api, type TelegramClient } from "teleproto";
import type { MessageSummary, SentMessage } from "./types";

export async function sendTelegramMessage(
  client: TelegramClient,
  to: string,
  text: string,
): Promise<SentMessage> {
  return serializeSentMessage(
    await client.sendMessage(to, { message: text, parseMode: undefined }),
  );
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
