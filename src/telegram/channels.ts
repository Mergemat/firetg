import { Api, type TelegramClient } from "teleproto";
import type { ChannelDetails, MessageSummary } from "./types";
import { withPeer, type PeerResolver } from "./peers";

export async function getChannelDetails(
  client: TelegramClient,
  resolver: PeerResolver,
  channel: string,
): Promise<ChannelDetails> {
  return withPeer(
    resolver,
    channel,
    async (peer) => {
      const inputChannel = toInputChannel(peer);
      if (!inputChannel) {
        throw new Error(`${channel} does not resolve to a channel`);
      }

      const response = await client.invoke(
        new Api.channels.GetFullChannel({ channel: inputChannel }),
      );

      if (!(response instanceof Api.messages.ChatFull)) {
        throw new Error(`Telegram did not return channel details for ${channel}`);
      }

      if (!(response.fullChat instanceof Api.ChannelFull)) {
        throw new Error(`${channel} does not resolve to full channel details`);
      }

      const fullChat = response.fullChat;
      const entity = response.chats.find(
        (chat): chat is Api.Channel =>
          chat instanceof Api.Channel &&
          chat.id.toString() === fullChat.id.toString(),
      );

      if (!entity) {
        throw new Error(`${channel} does not resolve to a channel`);
      }

      return serializeChannelDetails(
        entity,
        fullChat,
        await getPinnedMessage(client, inputChannel, fullChat.pinnedMsgId),
      );
    },
    { kind: "channel" },
  );
}

function toInputChannel(peer: unknown): Api.InputChannel | undefined {
  if (peer instanceof Api.InputPeerChannel) {
    return new Api.InputChannel({
      channelId: peer.channelId,
      accessHash: peer.accessHash,
    });
  }

  return undefined;
}

async function getPinnedMessage(
  client: TelegramClient,
  channel: Api.InputChannel,
  pinnedMsgId?: number | null,
): Promise<MessageSummary | undefined> {
  const id = normalizePinnedMessageId(pinnedMsgId);
  if (id === undefined) return undefined;

  const response = await client.invoke(
    new Api.channels.GetMessages({
      channel,
      id: [new Api.InputMessageID({ id })],
    }),
  );
  const message = getFirstMessage(response);
  if (!(message instanceof Api.Message)) return undefined;

  return serializePinnedMessage(message);
}

function getFirstMessage(
  response: Api.messages.TypeMessages,
): Api.TypeMessage | undefined {
  if (
    response instanceof Api.messages.Messages ||
    response instanceof Api.messages.MessagesSlice ||
    response instanceof Api.messages.ChannelMessages
  ) {
    return response.messages[0];
  }

  return undefined;
}

function normalizePinnedMessageId(
  pinnedMsgId?: number | null,
): number | undefined {
  if (pinnedMsgId === undefined || pinnedMsgId === null) return undefined;

  const id = Number(pinnedMsgId);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function serializeChannelDetails(
  channel: Api.Channel,
  full: Api.ChannelFull,
  pinnedMessage?: MessageSummary,
): ChannelDetails {
  const details: ChannelDetails = {
    id: channel.id?.toString(),
    title: channel.title,
    username: channel.username,
    description: full.about,
    participantsCount: full.participantsCount ?? channel.participantsCount,
    pinnedMessage,
    verified: channel.verified,
    restricted: channel.restricted,
    scam: channel.scam,
    fake: channel.fake,
  };

  return cleanChannelDetails(details);
}

function serializePinnedMessage(message: Api.Message): MessageSummary {
  return {
    id: Number(message.id),
    date: message.date,
    text: message.message,
    senderId: peerIdToString(message.fromId),
    chatId: peerIdToString(message.peerId),
    outgoing: message.out,
  };
}

function peerIdToString(peer?: Api.TypePeer): string | undefined {
  if (peer instanceof Api.PeerUser) return peer.userId.toString();
  if (peer instanceof Api.PeerChat) return peer.chatId.toString();
  if (peer instanceof Api.PeerChannel) return peer.channelId.toString();
  return undefined;
}

function cleanChannelDetails(details: ChannelDetails): ChannelDetails {
  const result: ChannelDetails = {};

  if (details.id !== undefined) result.id = details.id;
  if (details.title !== undefined) result.title = details.title;
  if (details.username !== undefined) result.username = details.username;
  if (details.description !== undefined) {
    result.description = details.description;
  }
  if (details.participantsCount !== undefined) {
    result.participantsCount = details.participantsCount;
  }
  if (details.pinnedMessage !== undefined) {
    result.pinnedMessage = cleanMessageSummary(details.pinnedMessage);
  }
  if (details.verified !== undefined) result.verified = details.verified;
  if (details.restricted !== undefined) result.restricted = details.restricted;
  if (details.scam !== undefined) result.scam = details.scam;
  if (details.fake !== undefined) result.fake = details.fake;

  return result;
}

function cleanMessageSummary(message: MessageSummary): MessageSummary {
  const result: MessageSummary = {};

  if (message.id !== undefined) result.id = message.id;
  if (message.date !== undefined) result.date = message.date;
  if (message.text !== undefined) result.text = message.text;
  if (message.senderId !== undefined) result.senderId = message.senderId;
  if (message.chatId !== undefined) result.chatId = message.chatId;
  if (message.outgoing !== undefined) result.outgoing = message.outgoing;

  return result;
}
