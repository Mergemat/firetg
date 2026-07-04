import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bigInt from "big-integer";
import { Api } from "teleproto";
import {
  type FilterableDialogSummary,
  listDialogSummaries,
  type DialogSummary,
  type DialogSource,
} from "../src/telegram/dialogs";
import { getChannelDetails } from "../src/telegram/channels";
import { RateLimitedError } from "../src/telegram/errors";
import {
  listTelegramMessages,
  listTelegramPinnedMessages,
  listTelegramReplies,
  sendTelegramMessage,
} from "../src/telegram/messages";
import { createPeerResolver } from "../src/telegram/peers";
import type { PeerCache } from "../src/peerStore";

const title = new Api.TextWithEntities({ text: "Managers", entities: [] });

function inputUser(id: number): Api.InputPeerUser {
  return new Api.InputPeerUser({
    userId: bigInt(id),
    accessHash: bigInt(id * 10),
  });
}

function apiUser(id: number, username?: string): Api.User {
  return new Api.User({
    id: bigInt(id),
    accessHash: bigInt(id * 10),
    username,
    firstName: `User${id}`,
  });
}

function apiChannel(id: number, username?: string): Api.Channel {
  return new Api.Channel({
    id: bigInt(id),
    accessHash: bigInt(id * 10),
    title: `Channel ${id}`,
    username,
    photo: new Api.ChatPhotoEmpty(),
    date: 1_800_000_000,
    broadcast: true,
  });
}

async function tempPeersPath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "firetg-peers-")), "peers.json");
}

async function seedPeers(path: string, cache: Partial<PeerCache>) {
  await writeFile(
    path,
    JSON.stringify({ version: 1, peers: [], ...cache }, null, 2),
  );
}

async function readPeers(path: string): Promise<PeerCache> {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolverFor(client: unknown, path?: string) {
  return createPeerResolver(client as never, path);
}

function messageReadStateClient(
  expectedChat: unknown,
  readState: { readInboxMaxId: number; readOutboxMaxId: number } = {
    readInboxMaxId: 0,
    readOutboxMaxId: 0,
  },
  inputPeer: Api.TypeInputPeer = new Api.InputPeerChat({ chatId: bigInt(100) }),
) {
  return {
    getDialogs: async () => [],
    getInputEntity: async (chat: unknown) => {
      expect(chat).toEqual(expectedChat);
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

describe("peer resolution", () => {
  test("unknown usernames resolve once and are cached for later runs", async () => {
    const peersPath = await tempPeersPath();
    const channel = apiChannel(200, "HR_MAXMA");
    let resolveCalls = 0;
    const requestedChats: unknown[] = [];

    const client = {
      invoke: async (request: Api.AnyRequest) => {
        if (request instanceof Api.contacts.ResolveUsername) {
          resolveCalls += 1;
          expect(request.username).toBe("hr_maxma");
          return new Api.contacts.ResolvedPeer({
            peer: new Api.PeerChannel({ channelId: channel.id }),
            chats: [channel],
            users: [],
          });
        }

        expect(request).toBeInstanceOf(Api.messages.GetPeerDialogs);
        return new Api.messages.PeerDialogs({
          dialogs: [],
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
      getInputEntity: async (chat: unknown) => chat,
      getMessages: async (chat: unknown, params: { limit: number }) => {
        requestedChats.push(chat);
        expect(params.limit).toBe(1);
        return [
          new Api.Message({ id: 5, date: 1_800_000_005, message: "hi" }),
        ];
      },
      iterDialogs: () => {
        throw new Error("cached/resolved usernames should not scan dialogs");
      },
    };

    await expect(
      listTelegramMessages(client as never, resolverFor(client, peersPath), {
        chat: "@HR_MAXMA",
        limit: 1,
      }),
    ).resolves.toEqual([{ id: 5, date: 1_800_000_005, text: "hi" }]);

    // A fresh resolver (new CLI run) must hit the on-disk cache, not Telegram.
    await expect(
      listTelegramMessages(client as never, resolverFor(client, peersPath), {
        chat: "hr_maxma",
        limit: 1,
      }),
    ).resolves.toEqual([{ id: 5, date: 1_800_000_005, text: "hi" }]);

    expect(resolveCalls).toBe(1);
    expect(requestedChats).toHaveLength(2);
    for (const chat of requestedChats) {
      expect(chat).toBeInstanceOf(Api.InputPeerChannel);
      expect((chat as Api.InputPeerChannel).channelId.toString()).toBe("200");
    }

    const cache = await readPeers(peersPath);
    expect(cache.peers).toMatchObject([
      {
        kind: "channel",
        id: "200",
        accessHash: "2000",
        usernames: ["hr_maxma"],
      },
    ]);
  });

  test("flood waits fall back to a dialog scan and persist the block", async () => {
    const peersPath = await tempPeersPath();
    const known = apiUser(42, "KnownUser");
    const knownInput = inputUser(42);

    const client = {
      invoke: async (request: Api.AnyRequest) => {
        if (request instanceof Api.contacts.ResolveUsername) {
          throw new Error("FLOOD_WAIT_120");
        }
        throw new Error(`unexpected request ${request.className}`);
      },
      async *iterDialogs() {
        yield { entity: known, inputEntity: knownInput };
        throw new Error("dialog scan should stop after a match");
      },
      sendMessage: async (entity: unknown, params: { message: string }) => {
        expect(entity).toBe(knownInput);
        return new Api.Message({
          id: 9,
          date: 1_800_000_009,
          message: params.message,
        });
      },
    };

    await expect(
      sendTelegramMessage(
        client as never,
        resolverFor(client, peersPath),
        "@KnownUser",
        "hello",
      ),
    ).resolves.toEqual({ id: 9, date: 1_800_000_009, text: "hello" });

    const cache = await readPeers(peersPath);
    expect(cache.resolveBlockedUntil).toBeDefined();
    expect(cache.peers).toMatchObject([
      { kind: "user", id: "42", usernames: ["knownuser"] },
    ]);
  });

  test("blocked resolves without a dialog match raise RateLimitedError", async () => {
    const peersPath = await tempPeersPath();
    await seedPeers(peersPath, {
      resolveBlockedUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    let resolveCalls = 0;

    const client = {
      invoke: async () => {
        resolveCalls += 1;
        throw new Error("resolve must not be called while blocked");
      },
      async *iterDialogs() {
        yield { entity: apiUser(1, "someoneelse"), inputEntity: inputUser(1) };
      },
    };

    await expect(
      sendTelegramMessage(
        client as never,
        resolverFor(client, peersPath),
        "@Stranger",
        "hello",
      ),
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(resolveCalls).toBe(0);
  });

  test("stale cached access hashes re-resolve once and retry", async () => {
    const peersPath = await tempPeersPath();
    await seedPeers(peersPath, {
      peers: [
        {
          kind: "channel",
          id: "200",
          accessHash: "999",
          usernames: ["hr_maxma"],
          cachedAt: new Date(0).toISOString(),
        },
      ],
    });
    const channel = apiChannel(200, "hr_maxma");
    const attempts: string[] = [];

    const client = {
      invoke: async (request: Api.AnyRequest) => {
        if (request instanceof Api.contacts.ResolveUsername) {
          return new Api.contacts.ResolvedPeer({
            peer: new Api.PeerChannel({ channelId: channel.id }),
            chats: [channel],
            users: [],
          });
        }

        return new Api.messages.PeerDialogs({
          dialogs: [],
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
      getInputEntity: async (chat: unknown) => chat,
      getMessages: async (chat: Api.InputPeerChannel) => {
        attempts.push(chat.accessHash.toString());
        if (chat.accessHash.toString() === "999") {
          throw new Error("CHANNEL_INVALID");
        }
        return [
          new Api.Message({ id: 6, date: 1_800_000_006, message: "ok" }),
        ];
      },
    };

    await expect(
      listTelegramMessages(client as never, resolverFor(client, peersPath), {
        chat: "hr_maxma",
        limit: 1,
      }),
    ).resolves.toEqual([{ id: 6, date: 1_800_000_006, text: "ok" }]);
    expect(attempts).toEqual(["999", "2000"]);
  });

  test("known numeric user ids resolve through dialogs and are cached", async () => {
    const peersPath = await tempPeersPath();
    const user = apiUser(116040563);
    const userInput = inputUser(116040563);
    let sentEntity: unknown;

    const client = {
      getMe: async () => new Api.User({ id: bigInt(1) }),
      async *iterDialogs() {
        yield { entity: user, inputEntity: userInput };
      },
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
      sendTelegramMessage(
        client as never,
        resolverFor(client, peersPath),
        "116040563",
        "hello",
      ),
    ).resolves.toEqual({
      id: 9,
      date: 1_800_000_002,
      text: "hello",
    });
    expect(sentEntity).toBe(userInput);

    const cache = await readPeers(peersPath);
    expect(cache.peers).toMatchObject([{ kind: "user", id: "116040563" }]);
  });

  test("cached numeric ids resolve without touching Telegram", async () => {
    const peersPath = await tempPeersPath();
    await seedPeers(peersPath, {
      peers: [
        {
          kind: "user",
          id: "116040563",
          accessHash: "77",
          usernames: [],
          cachedAt: new Date().toISOString(),
        },
      ],
    });
    let sentEntity: unknown;

    const client = {
      getMe: async () => {
        throw new Error("cached ids should not call getMe");
      },
      iterDialogs: () => {
        throw new Error("cached ids should not scan dialogs");
      },
      sendMessage: async (entity: unknown, params: { message: string }) => {
        sentEntity = entity;
        return new Api.Message({
          id: 8,
          date: 1_800_000_001,
          message: params.message,
        });
      },
    };

    await expect(
      sendTelegramMessage(
        client as never,
        resolverFor(client, peersPath),
        "116040563",
        "hello",
      ),
    ).resolves.toEqual({ id: 8, date: 1_800_000_001, text: "hello" });
    expect(sentEntity).toBeInstanceOf(Api.InputPeerUser);
    expect((sentEntity as Api.InputPeerUser).accessHash.toString()).toBe("77");
  });
});

describe("telegram message sending", () => {
  test("text messages pass scheduled delivery to Telegram", async () => {
    let sentParams: unknown;

    const client = {
      sendMessage: async (_entity: unknown, params: unknown) => {
        sentParams = params;
        return new Api.Message({
          id: 9,
          date: 1_800_000_004,
          message: "hello later",
        });
      },
    };

    await expect(
      sendTelegramMessage(client as never, resolverFor(client), "launch-team", {
        text: "hello later",
        scheduledAt: 1_800_003_600,
      }),
    ).resolves.toEqual({
      id: 9,
      date: 1_800_000_004,
      text: "hello later",
    });

    expect(sentParams).toEqual({
      message: "hello later",
      parseMode: undefined,
      schedule: 1_800_003_600,
    });
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
      sendTelegramMessage(client as never, resolverFor(client), "launch-team", {
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
    expect(sentEntity).toBe("launch-team");
    expect(sentParams).toEqual({
      file: "/tmp/photo.jpg",
      caption: "caption",
      forceDocument: true,
      parseMode: undefined,
    });
  });

  test("attachments pass scheduled delivery to Telegram", async () => {
    let sentParams: unknown;

    const client = {
      sendFile: async (_entity: unknown, params: unknown) => {
        sentParams = params;
        return new Api.Message({
          id: 11,
          date: 1_800_000_005,
          message: "caption",
        });
      },
    };

    await expect(
      sendTelegramMessage(client as never, resolverFor(client), "launch-team", {
        text: "caption",
        attachment: "/tmp/photo.jpg",
        scheduledAt: 1_800_003_600,
      }),
    ).resolves.toEqual({
      id: 11,
      date: 1_800_000_005,
      text: "caption",
    });

    expect(sentParams).toEqual({
      file: "/tmp/photo.jpg",
      caption: "caption",
      forceDocument: false,
      parseMode: undefined,
      scheduleDate: 1_800_003_600,
    });
  });
});

describe("telegram message listing", () => {
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
      listTelegramMessages(client as never, resolverFor(client), {
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
      listTelegramMessages(client as never, resolverFor(client), {
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
      listTelegramMessages(client as never, resolverFor(client), {
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
      listTelegramPinnedMessages(client as never, resolverFor(client), {
        chat: "launch-team",
        limit: 2,
      }),
    ).resolves.toEqual([
      { id: 12, date: 1_800_000_012, text: "latest pin" },
      { id: 10, date: 1_800_000_010, text: "first pin" },
    ]);
  });

  test("reply search includes replies from selected senders", async () => {
    const peersPath = await tempPeersPath();
    await seedPeers(peersPath, {
      peers: [
        {
          kind: "user",
          id: "42",
          accessHash: "420",
          usernames: [],
          cachedAt: new Date().toISOString(),
        },
      ],
    });
    const calls: Array<{
      chat: string;
      params: {
        limit: number;
        search?: string;
        replyTo?: number;
        fromUser?: unknown;
      };
    }> = [];
    const client = {
      getMessages: async (
        chat: string,
        params: {
          limit: number;
          search?: string;
          replyTo?: number;
          fromUser?: unknown;
        },
      ) => {
        calls.push({ chat, params });

        if (
          params.replyTo === 10 &&
          params.fromUser instanceof Api.InputPeerUser
        ) {
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
      listTelegramReplies(client as never, resolverFor(client, peersPath), {
        chat: "launch-team",
        messageId: 10,
        from: ["42", "alice-x"],
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
    expect(calls).toHaveLength(2);
    expect(calls[0]?.params.replyTo).toBe(10);
    expect(calls[0]?.params.fromUser).toBeInstanceOf(Api.InputPeerUser);
    expect(calls[1]?.params).toMatchObject({
      limit: 5,
      replyTo: 10,
      fromUser: "alice-x",
    });
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

        if (params.fromUser === "alice-x") {
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
      listTelegramReplies(client as never, resolverFor(client), {
        chat: "launch-team",
        messageId: 10,
        from: ["alice-x"],
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
        params: { limit: 50, replyTo: 10, fromUser: "alice-x" },
      },
      {
        chat: "launch-team",
        params: { limit: 50, fromUser: "alice-x" },
      },
    ]);
  });
});

describe("telegram channel details", () => {
  function channelClient(
    channel: Api.Channel,
    fullChat: Api.ChannelFull,
    options: {
      pinned?: Api.Message;
      onResolve?: () => void;
    } = {},
  ) {
    return {
      invoke: async (request: Api.AnyRequest) => {
        if (request instanceof Api.contacts.ResolveUsername) {
          options.onResolve?.();
          return new Api.contacts.ResolvedPeer({
            peer: new Api.PeerChannel({ channelId: channel.id }),
            chats: [channel],
            users: [],
          });
        }

        if (request instanceof Api.channels.GetFullChannel) {
          expect(request.channel).toBeInstanceOf(Api.InputChannel);
          expect(
            (request.channel as Api.InputChannel).channelId.toString(),
          ).toBe(channel.id.toString());
          return new Api.messages.ChatFull({
            fullChat,
            chats: [channel],
            users: [],
          });
        }

        expect(request).toBeInstanceOf(Api.channels.GetMessages);
        if (!options.pinned) {
          throw new Error("missing pinned message should not fetch messages");
        }
        expect(
          ((request as Api.channels.GetMessages).channel as Api.InputChannel)
            .channelId.toString(),
        ).toBe(channel.id.toString());
        return new Api.messages.Messages({
          messages: [options.pinned],
          topics: [],
          chats: [channel],
          users: [],
        });
      },
      getMessages: async () => {
        throw new Error("channel pins should not use client.getMessages");
      },
    };
  }

  test("channel view omits pinned message when Telegram returns null pinned id", async () => {
    const channel = apiChannel(100, "firetg");
    channel.title = "FireTG";

    const client = channelClient(
      channel,
      new Api.ChannelFull({
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
    );

    await expect(
      getChannelDetails(client as never, resolverFor(client), "firetg"),
    ).resolves.toEqual({
      id: "100",
      title: "FireTG",
      username: "firetg",
      description: "No pinned message",
    });
  });

  test("known numeric channel ids resolve through dialogs", async () => {
    const channel = apiChannel(100);
    channel.title = "FireTG";

    const base = channelClient(
      channel,
      new Api.ChannelFull({
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
    );
    const client = {
      ...base,
      getMe: async () => new Api.User({ id: bigInt(1) }),
      async *iterDialogs() {
        yield {
          entity: channel,
          inputEntity: new Api.InputPeerChannel({
            channelId: channel.id,
            accessHash: channel.accessHash ?? bigInt(0),
          }),
        };
      },
    };

    await expect(
      getChannelDetails(client as never, resolverFor(client), "100"),
    ).resolves.toEqual({
      id: "100",
      title: "FireTG",
      description: "Known channel",
    });
  });

  test("channel view includes description and pinned message", async () => {
    const channel = apiChannel(100, "firetg");
    channel.title = "FireTG";
    channel.verified = true;
    channel.participantsCount = 123;
    const pinned = new Api.Message({
      id: 7,
      date: 1_800_000_003,
      message: "Start here",
      peerId: new Api.PeerChannel({ channelId: channel.id }),
    });

    const client = channelClient(
      channel,
      new Api.ChannelFull({
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
      { pinned },
    );

    await expect(
      getChannelDetails(client as never, resolverFor(client), "firetg"),
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
