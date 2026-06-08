import { describe, expect, test } from "bun:test";
import bigInt from "big-integer";
import { Api } from "teleproto";
import {
  type FilterableDialogSummary,
  listDialogSummaries,
  type DialogSummary,
  type DialogSource,
} from "../src/telegram/dialogs";
import { getChannelDetails } from "../src/telegram/channels";
import { sendTelegramMessage } from "../src/telegram/messages";

const title = new Api.TextWithEntities({ text: "Managers", entities: [] });

function inputUser(id: number): Api.InputPeerUser {
  return new Api.InputPeerUser({
    userId: bigInt(id),
    accessHash: bigInt(id * 10),
  });
}

describe("telegram dialog listing", () => {
  test("explicit custom folders fetch only their peers", async () => {
    const first = inputUser(1);
    const second = inputUser(2);
    const peerFetches: Api.TypeInputPeer[][] = [];

    const source: DialogSource = {
      getDialogFilters: async () => [
        new Api.DialogFilter({
          id: 78,
          title,
          pinnedPeers: [],
          includePeers: [first, second],
          excludePeers: [],
        }),
      ],
      getDialogSummaries: async () => {
        throw new Error("standard folders should not be used");
      },
      getFilterableDialogSummaries: async () => {
        throw new Error("explicit folders should not scan every dialog");
      },
      getPeerDialogSummaries: async (peers) => {
        peerFetches.push(peers);
        return peers.map<DialogSummary>((peer, index) => ({
          id: `user-${index + 1}`,
          title: `User ${index + 1}`,
          isUser: peer instanceof Api.InputPeerUser,
        }));
      },
    };

    await expect(
      listDialogSummaries(source, { folder: 78, limit: 1000 }),
    ).resolves.toEqual([
      { id: "user-1", title: "User 1", isUser: true },
      { id: "user-2", title: "User 2", isUser: true },
    ]);
    expect(peerFetches).toEqual([[first, second]]);
  });

  test("category custom folders scan filterable dialogs", async () => {
    const source: DialogSource = {
      getDialogFilters: async () => [
        new Api.DialogFilter({
          id: 12,
          title,
          groups: true,
          pinnedPeers: [],
          includePeers: [],
          excludePeers: [],
        }),
      ],
      getDialogSummaries: async () => {
        throw new Error("standard folders should not be used");
      },
      getFilterableDialogSummaries: async () => [
        {
          id: "1",
          title: "General",
          isGroup: true,
          inputPeer: new Api.InputPeerChat({ chatId: bigInt(1) }),
        } satisfies FilterableDialogSummary,
        {
          id: "2",
          title: "Alice",
          isUser: true,
          inputPeer: inputUser(2),
        } satisfies FilterableDialogSummary,
      ],
      getPeerDialogSummaries: async () => {
        throw new Error("category folders cannot be fetched peer-only");
      },
    };

    await expect(
      listDialogSummaries(source, { folder: 12, limit: 10 }),
    ).resolves.toEqual([
      {
        id: "1",
        title: "General",
        isGroup: true,
      },
    ]);
  });

  test("explicit custom folders surface peer fetch failures", async () => {
    const first = inputUser(1);

    const source: DialogSource = {
      getDialogFilters: async () => [
        new Api.DialogFilter({
          id: 78,
          title,
          pinnedPeers: [],
          includePeers: [first],
          excludePeers: [],
        }),
      ],
      getDialogSummaries: async () => {
        throw new Error("standard folders should not be used");
      },
      getFilterableDialogSummaries: async () => [
        {
          id: "1",
          title: "Recovered",
          inputPeer: first,
        } satisfies FilterableDialogSummary,
      ],
      getPeerDialogSummaries: async () => {
        throw new Error("peer fetch failed");
      },
    };

    await expect(
      listDialogSummaries(source, { folder: 78, limit: 10 }),
    ).rejects.toThrow("peer fetch failed");
  });
});

describe("telegram message sending", () => {
  test("known numeric user ids resolve through dialogs before sending", async () => {
    const user = new Api.User({
      id: bigInt(116040563),
      accessHash: bigInt(1),
      firstName: "Kirill",
    });
    let sentEntity: unknown;

    const client = {
      getEntity: async () => {
        throw new Error("direct entity lookup failed");
      },
      getMe: async () => new Api.User({ id: bigInt(1) }),
      getDialogs: async () => [{ entity: user }],
      sendMessage: async (entity: unknown, params: { message: string }) => {
        sentEntity = entity;
        return new Api.Message({
          id: 9,
          date: 1_800_000_002,
          message: params.message,
          peerId: new Api.PeerUser({ userId: user.id }),
        });
      },
    };

    await expect(
      sendTelegramMessage(client as never, "116040563", "hello"),
    ).resolves.toEqual({
      id: 9,
      date: 1_800_000_002,
      text: "hello",
    });
    expect(sentEntity).toBe(user);
  });
});

describe("telegram channel details", () => {
  test("known numeric channel ids resolve through dialogs", async () => {
    const channel = new Api.Channel({
      id: bigInt(100),
      accessHash: bigInt(10),
      title: "FireTG",
      photo: new Api.ChatPhotoEmpty(),
      date: 1_800_000_000,
      broadcast: true,
    });
    let requestedChannel: unknown;

    const client = {
      getEntity: async () => {
        throw new Error("direct entity lookup failed");
      },
      getDialogs: async () => [{ entity: channel }],
      invoke: async (request: Api.channels.GetFullChannel) => {
        requestedChannel = request.channel;
        return new Api.messages.ChatFull({
          fullChat: new Api.ChannelFull({
            id: channel.id,
            about: "Known channel",
            readInboxMaxId: 0,
            readOutboxMaxId: 0,
            unreadCount: 0,
            chatPhoto: new Api.PhotoEmpty({ id: bigInt(1) }),
            notifySettings: new Api.PeerNotifySettings({}),
            botInfo: [],
            pts: 1,
          }),
          chats: [channel],
          users: [],
        });
      },
      getMessages: async () => {
        throw new Error("channel has no pinned message");
      },
    };

    await expect(
      getChannelDetails(client as never, "100"),
    ).resolves.toEqual({
      id: "100",
      title: "FireTG",
      description: "Known channel",
    });
    expect(requestedChannel).toBe(channel);
  });

  test("channel view includes description and pinned message", async () => {
    const channel = new Api.Channel({
      id: bigInt(100),
      accessHash: bigInt(10),
      title: "FireTG",
      username: "firetg",
      photo: new Api.ChatPhotoEmpty(),
      date: 1_800_000_000,
      broadcast: true,
      verified: true,
      participantsCount: 123,
    });
    const pinned = new Api.Message({
      id: 7,
      date: 1_800_000_003,
      message: "Start here",
      peerId: new Api.PeerChannel({ channelId: channel.id }),
    });

    const client = {
      getEntity: async (entity: string) => {
        expect(entity).toBe("firetg");
        return channel;
      },
      invoke: async (request: Api.AnyRequest) => {
        if (request instanceof Api.channels.GetFullChannel) {
          return new Api.messages.ChatFull({
            fullChat: new Api.ChannelFull({
              id: channel.id,
              about: "Agent-ready Telegram CLI",
              participantsCount: 123,
              readInboxMaxId: 0,
              readOutboxMaxId: 0,
              unreadCount: 0,
              chatPhoto: new Api.PhotoEmpty({ id: bigInt(1) }),
              notifySettings: new Api.PeerNotifySettings({}),
              botInfo: [],
              pinnedMsgId: 7,
              pts: 1,
            }),
            chats: [channel],
            users: [],
          });
        }

        expect(request).toBeInstanceOf(Api.channels.GetMessages);
        expect((request as Api.channels.GetMessages).channel).toBe(channel);
        expect((request as Api.channels.GetMessages).id).toEqual([
          new Api.InputMessageID({ id: 7 }),
        ]);
        return new Api.messages.Messages({
          messages: [pinned],
          topics: [],
          chats: [channel],
          users: [],
        });
      },
      getMessages: async () => {
        throw new Error("channel pins should not use client.getMessages");
      },
    };

    await expect(
      getChannelDetails(client as never, "firetg"),
    ).resolves.toEqual({
      id: "100",
      title: "FireTG",
      username: "firetg",
      description: "Agent-ready Telegram CLI",
      participantsCount: 123,
      pinnedMessage: {
        id: 7,
        date: 1_800_000_003,
        text: "Start here",
        chatId: "100",
      },
      verified: true,
    });
  });
});
