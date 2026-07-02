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
import {
  listTelegramMessages,
  listTelegramPinnedMessages,
  listTelegramReplies,
  sendTelegramMessage,
} from "../src/telegram/messages";

const title = new Api.TextWithEntities({ text: "Managers", entities: [] });

function inputUser(id: number): Api.InputPeerUser {
  return new Api.InputPeerUser({
    userId: bigInt(id),
    accessHash: bigInt(id * 10),
  });
}

function messageReadStateClient(
  expectedChat: string | Api.TypeInputPeer,
  readState: { readInboxMaxId: number; readOutboxMaxId: number } = {
    readInboxMaxId: 0,
    readOutboxMaxId: 0,
  },
  inputPeer: Api.TypeInputPeer = new Api.InputPeerChat({ chatId: bigInt(100) }),
) {
  return {
    getDialogs: async () => [],
    getInputEntity: async (chat: string | Api.TypeInputPeer) => {
      expect(chat).toBe(expectedChat);
      return inputPeer;
    },
    invoke: async (request: Api.AnyRequest) => {
      expect(request).toBeInstanceOf(Api.messages.GetPeerDialogs);
      const peer = (request as Api.messages.GetPeerDialogs).peers[0];
      expect(peer).toBeInstanceOf(Api.InputDialogPeer);
      expect((peer as Api.InputDialogPeer).peer).toBe(inputPeer);

      return new Api.messages.PeerDialogs({
        dialogs: [
          new Api.Dialog({
            peer: new Api.PeerChat({ chatId: bigInt(100) }),
            topMessage: 12,
            readInboxMaxId: readState.readInboxMaxId,
            readOutboxMaxId: readState.readOutboxMaxId,
            unreadCount: 0,
            unreadMentionsCount: 0,
            unreadReactionsCount: 0,
            unreadPollVotesCount: 0,
            notifySettings: new Api.PeerNotifySettings({}),
          }),
        ],
        messages: [],
        chats: [],
        users: [],
        state: new Api.updates.State({
          pts: 0,
          qts: 0,
          date: 0,
          seq: 0,
          unreadCount: 0,
        }),
      });
    },
  };
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

  test("attachments are sent through sendFile", async () => {
    let textSent = false;
    let sentEntity: unknown;
    let sentParams: unknown;

    const client = {
      sendMessage: async () => {
        textSent = true;
        throw new Error("attachments should not use sendMessage");
      },
      sendFile: async (entity: unknown, params: unknown) => {
        sentEntity = entity;
        sentParams = params;
        return new Api.Message({
          id: 10,
          date: 1_800_000_003,
          message: "caption",
        });
      },
    };

    await expect(
      sendTelegramMessage(client as never, "@telegram", {
        text: "caption",
        attachment: "/tmp/photo.jpg",
        forceDocument: true,
      }),
    ).resolves.toEqual({
      id: 10,
      date: 1_800_000_003,
      text: "caption",
    });
    expect(textSent).toBe(false);
    expect(sentEntity).toBe("telegram");
    expect(sentParams).toEqual({
      file: "/tmp/photo.jpg",
      caption: "caption",
      forceDocument: true,
      parseMode: undefined,
    });
  });
});

describe("telegram message listing", () => {
  test("username chats stop scanning dialogs after the first match", async () => {
    const inputPeer = inputUser(42);
    const user = new Api.User({
      id: bigInt(42),
      accessHash: bigInt(420),
      username: "UserName",
      firstName: "Known",
    });
    let requestedChat: unknown;
    const dialogIterations: unknown[] = [];
    const inputEntityLookups: unknown[] = [];

    const client = {
      ...messageReadStateClient(inputPeer, undefined, inputPeer),
      getDialogs: async () => {
        throw new Error("username chats should not collect every dialog");
      },
      async *iterDialogs(params: unknown) {
        dialogIterations.push(params);
        yield { entity: user, inputEntity: inputPeer };
        throw new Error("username chat lookup should stop after a match");
      },
      getInputEntity: async (chat: unknown) => {
        inputEntityLookups.push(chat);
        if (chat === inputPeer) return inputPeer;

        throw new Error(`unexpected input entity lookup: ${String(chat)}`);
      },
      getMessages: async (
        chat: unknown,
        params: { limit: number; search?: string },
      ) => {
        requestedChat = chat;
        expect(chat).toBe(inputPeer);
        expect(params).toEqual({ limit: 1, search: undefined });

        return [
          new Api.Message({
            id: 12,
            date: 1_800_000_012,
            message: "from known dialog",
          }),
        ];
      },
    };

    await expect(
      listTelegramMessages(client as never, {
        chat: "@UserName",
        limit: 1,
      }),
    ).resolves.toEqual([
      {
        id: 12,
        date: 1_800_000_012,
        text: "from known dialog",
      },
    ]);
    expect(requestedChat).toBe(inputPeer);
    expect(dialogIterations).toEqual([{}]);
    expect(inputEntityLookups).toEqual([inputPeer]);
  });

  test("message history is newest first", async () => {
    const client = {
      getMessages: async (
        chat: string,
        params: { limit: number; search?: string },
      ) => {
        expect(chat).toBe("launch-team");
        expect(params).toEqual({ limit: 3, search: undefined });
        return [
          new Api.Message({
            id: 1,
            date: 1_800_000_001,
            message: "older",
          }),
          new Api.Message({
            id: 3,
            date: 1_800_000_003,
            message: "newer",
            peerId: new Api.PeerChannel({ channelId: bigInt(100) }),
          }),
          new Api.Message({
            id: 2,
            date: 1_800_000_002,
            message: "middle",
          }),
        ];
      },
      ...messageReadStateClient("launch-team"),
    };

    await expect(
      listTelegramMessages(client as never, {
        chat: "launch-team",
        limit: 3,
      }),
    ).resolves.toEqual([
      {
        id: 3,
        date: 1_800_000_003,
        text: "newer",
        chatId: "100",
      },
      { id: 2, date: 1_800_000_002, text: "middle" },
      { id: 1, date: 1_800_000_001, text: "older" },
    ]);
  });

  test("media-only messages include media details", async () => {
    const client = {
      getMessages: async () => [
        new Api.Message({
          id: 81,
          date: 1_800_000_081,
          message: "",
          media: new Api.MessageMediaPhoto({
            photo: new Api.PhotoEmpty({ id: bigInt(1) }),
          }),
        }),
        new Api.Message({
          id: 82,
          date: 1_800_000_082,
          message: "",
          media: new Api.MessageMediaDocument({
            document: new Api.Document({
              id: bigInt(2),
              accessHash: bigInt(20),
              fileReference: Buffer.alloc(0),
              date: 1_800_000_000,
              mimeType: "video/mp4",
              size: bigInt(123456),
              dcId: 2,
              attributes: [
                new Api.DocumentAttributeFilename({ fileName: "clip.mp4" }),
                new Api.DocumentAttributeVideo({
                  duration: 7,
                  w: 1280,
                  h: 720,
                }),
              ],
            }),
          }),
        }),
      ],
      ...messageReadStateClient("launch-team"),
    };

    await expect(
      listTelegramMessages(client as never, {
        chat: "launch-team",
        limit: 2,
      }),
    ).resolves.toEqual([
      {
        id: 82,
        date: 1_800_000_082,
        text: "",
        media: {
          type: "video",
          fileName: "clip.mp4",
          mimeType: "video/mp4",
          size: "123456",
        },
      },
      {
        id: 81,
        date: 1_800_000_081,
        text: "",
        media: { type: "photo" },
      },
    ]);
  });

  test("message history includes explicit read receipts", async () => {
    const client = {
      getMessages: async () => [
        new Api.Message({
          id: 8,
          date: 1_800_000_008,
          message: "read incoming",
          out: false,
        }),
        new Api.Message({
          id: 12,
          date: 1_800_000_012,
          message: "unread incoming",
          out: false,
        }),
        new Api.Message({
          id: 9,
          date: 1_800_000_009,
          message: "read outgoing",
          out: true,
        }),
      ],
      ...messageReadStateClient("launch-team", {
        readInboxMaxId: 10,
        readOutboxMaxId: 9,
      }),
    };

    await expect(
      listTelegramMessages(client as never, {
        chat: "launch-team",
        limit: 3,
      }),
    ).resolves.toEqual([
      {
        id: 12,
        date: 1_800_000_012,
        text: "unread incoming",
        readReceipt: {
          read: false,
          direction: "inbox",
        },
        outgoing: false,
      },
      {
        id: 9,
        date: 1_800_000_009,
        text: "read outgoing",
        readReceipt: {
          read: true,
          direction: "outbox",
        },
        outgoing: true,
      },
      {
        id: 8,
        date: 1_800_000_008,
        text: "read incoming",
        readReceipt: {
          read: true,
          direction: "inbox",
        },
        outgoing: false,
      },
    ]);
  });

  test("pinned messages use the pinned filter and are newest first", async () => {
    const client = {
      getMessages: async (
        chat: string,
        params: { limit: number; filter: Api.InputMessagesFilterPinned },
      ) => {
        expect(chat).toBe("launch-team");
        expect(params.limit).toBe(2);
        expect(params.filter).toBeInstanceOf(Api.InputMessagesFilterPinned);
        return [
          new Api.Message({
            id: 10,
            date: 1_800_000_010,
            message: "first pin",
          }),
          new Api.Message({
            id: 12,
            date: 1_800_000_012,
            message: "latest pin",
          }),
        ];
      },
      ...messageReadStateClient("launch-team"),
    };

    await expect(
      listTelegramPinnedMessages(client as never, {
        chat: "launch-team",
        limit: 2,
      }),
    ).resolves.toEqual([
      { id: 12, date: 1_800_000_012, text: "latest pin" },
      { id: 10, date: 1_800_000_010, text: "first pin" },
    ]);
  });

  test("reply search includes replies from selected senders", async () => {
    const knownUser = new Api.User({
      id: bigInt(42),
      accessHash: bigInt(420),
      firstName: "Ops",
      lastName: "Lead",
    });
    const calls: Array<{
      chat: string;
      params: {
        limit: number;
        search?: string;
        replyTo?: number;
        fromUser?: string | Api.User;
      };
    }> = [];
    const client = {
      getEntity: async (entity: string) => {
        expect(entity).toBe("42");
        return knownUser;
      },
      getMessages: async (
        chat: string,
        params: {
          limit: number;
          search?: string;
          replyTo?: number;
          fromUser?: string | Api.User;
        },
      ) => {
        calls.push({ chat, params });

        if (params.replyTo === 10 && params.fromUser === knownUser) {
          return [
            new Api.Message({
              id: 12,
              date: 1_800_000_012,
              message: "confirmed",
              fromId: new Api.PeerUser({ userId: bigInt(42) }),
              peerId: new Api.PeerChannel({ channelId: bigInt(100) }),
              replyTo: new Api.MessageReplyHeader({ replyToMsgId: 10 }),
            }),
          ];
        }

        return [];
      },
      ...messageReadStateClient("launch-team"),
    };

    await expect(
      listTelegramReplies(client as never, {
        chat: "launch-team",
        messageId: 10,
        from: ["42", "alice"],
        limit: 5,
      }),
    ).resolves.toEqual([
      {
        id: 12,
        date: 1_800_000_012,
        text: "confirmed",
        senderId: "42",
        chatId: "100",
        replyToMessageId: 10,
      },
    ]);
    expect(calls).toEqual([
      {
        chat: "launch-team",
        params: { limit: 5, replyTo: 10, fromUser: knownUser },
      },
      {
        chat: "launch-team",
        params: { limit: 5, replyTo: 10, fromUser: "alice" },
      },
    ]);
  });

  test("reply search falls back to sender history when reply threads are unavailable", async () => {
    const calls: Array<{
      chat: string;
      params: {
        limit: number;
        search?: string;
        replyTo?: number;
        fromUser?: string;
      };
    }> = [];
    const client = {
      getMessages: async (
        chat: string,
        params: {
          limit: number;
          search?: string;
          replyTo?: number;
          fromUser?: string;
        },
      ) => {
        calls.push({ chat, params });

        if (params.replyTo === 10) {
          throw new Error("PEER_ID_INVALID");
        }

        if (params.fromUser === "alice") {
          return [
            new Api.Message({
              id: 15,
              date: 1_800_000_015,
              message: "unrelated",
              replyTo: new Api.MessageReplyHeader({ replyToMsgId: 9 }),
            }),
            new Api.Message({
              id: 12,
              date: 1_800_000_012,
              message: "confirmed",
              replyTo: new Api.MessageReplyHeader({ replyToMsgId: 10 }),
            }),
          ];
        }

        return [];
      },
      ...messageReadStateClient("launch-team"),
    };

    await expect(
      listTelegramReplies(client as never, {
        chat: "launch-team",
        messageId: 10,
        from: ["alice"],
        limit: 50,
      }),
    ).resolves.toEqual([
      {
        id: 12,
        date: 1_800_000_012,
        text: "confirmed",
        replyToMessageId: 10,
      },
    ]);
    expect(calls).toEqual([
      {
        chat: "launch-team",
        params: { limit: 50, replyTo: 10, fromUser: "alice" },
      },
      {
        chat: "launch-team",
        params: { limit: 50, fromUser: "alice" },
      },
    ]);
  });
});

describe("telegram channel details", () => {
  test("channel view omits pinned message when Telegram returns null pinned id", async () => {
    const channel = new Api.Channel({
      id: bigInt(100),
      accessHash: bigInt(10),
      title: "FireTG",
      photo: new Api.ChatPhotoEmpty(),
      date: 1_800_000_000,
      broadcast: true,
    });

    const client = {
      getEntity: async () => channel,
      invoke: async (request: Api.AnyRequest) => {
        expect(request).toBeInstanceOf(Api.channels.GetFullChannel);
        return new Api.messages.ChatFull({
          fullChat: new Api.ChannelFull({
            id: channel.id,
            about: "No pinned message",
            readInboxMaxId: 0,
            readOutboxMaxId: 0,
            unreadCount: 0,
            chatPhoto: new Api.PhotoEmpty({ id: bigInt(1) }),
            notifySettings: new Api.PeerNotifySettings({}),
            botInfo: [],
            pinnedMsgId: null as never,
            pts: 1,
          }),
          chats: [channel],
          users: [],
        });
      },
      getMessages: async () => {
        throw new Error("missing pinned message should not fetch messages");
      },
    };

    await expect(
      getChannelDetails(client as never, "firetg"),
    ).resolves.toEqual({
      id: "100",
      title: "FireTG",
      description: "No pinned message",
    });
  });

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
