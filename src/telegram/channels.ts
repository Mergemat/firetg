import { Api, type TelegramClient } from "teleproto";
import type { ChannelDetails, MessageSummary } from "./types";
import { normalizeUser } from "./users";

export async function getChannelDetails(
  client: TelegramClient,
  channel: string,
): Promise<ChannelDetails> {
  const normalized = normalizeUser(channel);
  const entity = await resolveChannelEntity(client, normalized);

  const response = await client.invoke(
    new Api.channels.GetFullChannel({ channel: entity }),
  );

  if (!(response instanceof Api.messages.ChatFull)) {
    throw new Error(`Telegram did not return channel details for ${channel}`);
  }

  if (!(response.fullChat instanceof Api.ChannelFull)) {
    throw new Error(`${channel} does not resolve to full channel details`);
  }

  return serializeChannelDetails(
    entity,
    response.fullChat,
    await getPinnedMessage(client, entity, response.fullChat.pinnedMsgId),
  );
}

async function resolveChannelEntity(
  client: TelegramClient,
  channel: string,
): Promise<Api.Channel> {
  try {
    const entity = await client.getEntity(channel);
    if (entity instanceof Api.Channel) return entity;
  } catch {
    // Numeric channel IDs resolve directly only when Teleproto already knows them.
  }

  if (!isChannelId(channel)) {
    throw new Error(`${channel} does not resolve to a channel`);
  }

  const dialog = (await client.getDialogs({})).find(
    (candidate) =>
      candidate.entity instanceof Api.Channel &&
      candidate.entity.id?.toString() === channel,
  );

  if (dialog?.entity instanceof Api.Channel) return dialog.entity;

  throw new Error(
    `Channel id ${channel} is not known to this session. Open a dialog first or use a username.`,
  );
}

async function getPinnedMessage(
  client: TelegramClient,
  channel: Api.Channel,
  pinnedMsgId?: number,
): Promise<MessageSummary | undefined> {
  if (pinnedMsgId === undefined) return undefined;

  const messages = await client.getMessages(channel, { ids: pinnedMsgId });
  const message = messages[0];
  if (!(message instanceof Api.Message)) return undefined;

  return serializePinnedMessage(message);
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

function isChannelId(channel: string): boolean {
  return /^\d+$/.test(channel);
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
