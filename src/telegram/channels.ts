import type { FullChat, TelegramClient } from "@mtcute/bun";
import type { ChannelDetails } from "./types";
import { serializeMessage } from "./messages";
import { normalizePeerInput } from "./peers";

export async function getChannelDetails(
  client: TelegramClient,
  channel: string,
): Promise<ChannelDetails> {
  const peer = normalizePeerInput(channel, "channel");
  const full = await client.getFullChat(peer);

  if (full.chatType !== "channel") {
    throw new Error(`${channel} does not resolve to a broadcast channel`);
  }

  const pinned = full.pinnedMsgId
    ? (await client.getMessages(peer, full.pinnedMsgId))[0]
    : undefined;

  return serializeChannelDetails(full, pinned ? serializeMessage(pinned) : undefined);
}

function serializeChannelDetails(
  channel: FullChat,
  pinnedMessage?: ChannelDetails["pinnedMessage"],
): ChannelDetails {
  const id = String(channel.id).replace(/^-100/, "");
  return {
    id,
    title: channel.title,
    ...(channel.username ? { username: channel.username } : {}),
    ...(channel.bio ? { description: channel.bio } : {}),
    ...(channel.membersCount > 0
      ? { participantsCount: channel.membersCount }
      : {}),
    ...(pinnedMessage ? { pinnedMessage } : {}),
    verified: channel.isVerified,
    restricted: channel.isRestricted,
    scam: channel.isScam,
    fake: channel.isFake,
  };
}
