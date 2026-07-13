import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FullUser,
  Long,
  Message,
  PeersIndex,
  SearchFilters,
  User,
  type TelegramClient,
  tl,
} from "@mtcute/bun";
import { loadTelegramConfig } from "../src/config";
import { LocalStore } from "../src/localStore";
import { loginTelegramAccount } from "../src/telegram/auth";
import { getChannelDetails } from "../src/telegram/channels";
import { createMtcuteClient } from "../src/telegram/client";
import { listDialogSummaries } from "../src/telegram/dialogs";
import { floodWaitSeconds } from "../src/telegram/errors";
import { listTelegramFolders } from "../src/telegram/folders";
import {
  listTelegramMessages,
  listTelegramPinnedMessages,
  listTelegramReplies,
  sendTelegramMessage,
  serializeMessage,
} from "../src/telegram/messages";
import { normalizePeerInput } from "../src/telegram/peers";
import { getCurrentAccount, getPublicProfile } from "../src/telegram/profile";

const alice = {
  _: "user",
  id: 42,
  accessHash: Long.fromNumber(420),
  firstName: "Alice",
  lastName: "Agent",
  username: "alice",
  phone: "10000000000",
  bot: false,
  verified: false,
  premium: false,
  restricted: false,
  scam: false,
  fake: false,
} satisfies tl.RawUser;

function makeMessage(
  id: number,
  options: {
    date?: number;
    text?: string;
    outgoing?: boolean;
    replyTo?: number;
  } = {},
): Message {
  const raw: tl.RawMessage = {
    _: "message",
    id,
    peerId: { _: "peerUser", userId: alice.id },
    fromId: { _: "peerUser", userId: alice.id },
    date: options.date ?? 1_800_000_000,
    message: options.text ?? "message",
    out: options.outgoing ?? false,
    ...(options.replyTo
      ? {
          replyTo: {
            _: "messageReplyHeader" as const,
            replyToMsgId: options.replyTo,
          },
        }
      : {}),
  };
  return new Message(raw, PeersIndex.from({ users: [alice], chats: [] }));
}

function clientFixture(
  methods: Partial<TelegramClient>,
): TelegramClient {
  return methods as TelegramClient;
}

describe("local Telegram configuration", () => {
  test("prepares peer storage before exposing profile lookups", async () => {
    const home = await mkdtemp(join(tmpdir(), "firetg-client-"));
    const storagePath = join(home, "telegram.sqlite");
    const telegram = await createMtcuteClient({
      apiId: 123,
      apiHash: "hash",
      storagePath,
    });
    await telegram.disconnect();

    const database = new Database(storagePath, { readonly: true });
    try {
      expect(
        database
          .query("select name from sqlite_master where type = 'table' and name = 'peers'")
          .get(),
      ).toEqual({ name: "peers" });
    } finally {
      database.close();
    }
  });

  test("requires credentials and a Telegram login", async () => {
    const home = await mkdtemp(join(tmpdir(), "firetg-config-"));
    const store = new LocalStore(home);

    await expect(loadTelegramConfig(store)).rejects.toThrow(
      `Missing config file at ${store.paths.config}`,
    );

    await store.writeCredentials({ apiId: 123, apiHash: "hash" });
    await expect(loadTelegramConfig(store)).rejects.toThrow(
      `Missing Telegram login at ${store.paths.telegram}`,
    );
  });

  test("uses SQLite storage and exposes legacy migration input", async () => {
    const home = await mkdtemp(join(tmpdir(), "firetg-config-"));
    const store = new LocalStore(home);
    await store.writeCredentials({ apiId: 123, apiHash: "hash" });
    await writeFile(store.paths.legacySession, "gramjs-session\n");

    expect(await loadTelegramConfig(store)).toEqual({
      apiId: 123,
      apiHash: "hash",
      storagePath: store.paths.telegram,
      legacySession: "gramjs-session",
      legacySessionPath: store.paths.legacySession,
      legacyPeersPath: store.paths.legacyPeers,
    });
  });

  test("rejects malformed credential files instead of treating them as missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "firetg-config-"));
    const store = new LocalStore(home);
    await mkdir(store.paths.directory, { recursive: true });
    await writeFile(store.paths.config, "not json");

    await expect(store.readCredentials()).rejects.toMatchObject({
      name: "ConfigError",
      path: store.paths.config,
    });
  });
});

describe("mtcute peer normalization", () => {
  test("normalizes aliases, usernames, users, groups, and channel ids", () => {
    expect(normalizePeerInput("this")).toBe("self");
    expect(normalizePeerInput("@Alice")).toBe("Alice");
    expect(normalizePeerInput("42", "user")).toBe(42);
    expect(normalizePeerInput("-42")).toBe(-42);
    expect(normalizePeerInput("100", "channel")).toBe(-100100);
    expect(normalizePeerInput("-1001234567890")).toBe(-1001234567890);
  });

  test("rejects peer ids outside JavaScript's safe integer range", () => {
    expect(() => normalizePeerInput("99999999999999999", "user")).toThrow(
      "outside JavaScript's safe range",
    );
  });
});

describe("mtcute authentication adapters", () => {
  test("passes QR URLs and Date expirations through unchanged", async () => {
    const seen: Array<{ url: string; expires: Date }> = [];
    const client = clientFixture({
      start: async (params) => {
        params?.qrCodeHandler?.(
          "tg://login?token=abc",
          new Date("2027-01-15T08:00:00.000Z"),
        );
        return new User(alice);
      },
    });

    const account = await loginTelegramAccount(client, {
      mode: "qr",
      qrCode: (qr) => seen.push(qr),
      password: async () => "secret",
    });

    expect(seen).toEqual([
      {
        url: "tg://login?token=abc",
        expires: new Date("2027-01-15T08:00:00.000Z"),
      },
    ]);
    expect(account).toEqual({
      id: "42",
      firstName: "Alice",
      lastName: "Agent",
      username: "alice",
      phone: "10000000000",
    });
  });

  test("reports app-delivered phone codes to the CLI callback", async () => {
    const viaApp: Array<boolean | undefined> = [];
    const client = clientFixture({
      start: async (params) => {
        await params?.codeSentCallback?.({ type: "app" } as never);
        await (typeof params?.code === "function" ? params.code() : params?.code);
        return new User(alice);
      },
    });

    await loginTelegramAccount(client, {
      mode: "phone",
      phoneNumber: "+10000000000",
      phoneCode: async (isCodeViaApp) => {
        viaApp.push(isCodeViaApp);
        return "12345";
      },
      password: async () => "secret",
    });

    expect(viaApp).toEqual([true]);
  });
});

describe("mtcute messages", () => {
  test("sends text to numeric users and converts scheduled seconds to Date", async () => {
    const calls: unknown[][] = [];
    const client = clientFixture({
      sendText: async (...args) => {
        calls.push(args);
        return makeMessage(10, { text: "later", outgoing: true });
      },
    });

    const sent = await sendTelegramMessage(client, "42", {
      text: "later",
      scheduledAt: 1_900_000_000,
    });

    expect(calls).toEqual([
      [42, "later", { schedule: new Date(1_900_000_000_000) }],
    ]);
    expect(sent).toEqual({
      id: 10,
      date: 1_800_000_000,
      text: "later",
    });
  });

  test("wraps attachments as auto media or forced documents", async () => {
    const media: Array<{ type: string; file: unknown }> = [];
    const client = clientFixture({
      sendMedia: async (_peer, input) => {
        media.push(input as { type: string; file: unknown });
        return makeMessage(11, { text: "caption", outgoing: true });
      },
    });

    await sendTelegramMessage(client, "alice", {
      attachment: "/tmp/photo.jpg",
      text: "caption",
    });
    await sendTelegramMessage(client, "alice", {
      attachment: "/tmp/report.pdf",
      forceDocument: true,
    });

    expect(media.map(({ type, file }) => ({ type, file }))).toEqual([
      { type: "photo", file: "file:/tmp/photo.jpg" },
      { type: "document", file: "file:/tmp/report.pdf" },
    ]);
  });

  test("lists history newest-first with marked ids and read receipts", async () => {
    const client = clientFixture({
      getHistory: async () => [
        makeMessage(1, { date: 1_800_000_000, text: "older" }),
        makeMessage(2, {
          date: 1_800_000_100,
          text: "newer",
          outgoing: true,
        }),
      ] as never,
      getPeerDialogs: async () => [
        { lastReadIngoing: 1, lastReadOutgoing: 2 },
      ] as never,
    });

    expect(await listTelegramMessages(client, { chat: "42", limit: 2 })).toEqual([
      {
        id: 2,
        date: 1_800_000_100,
        text: "newer",
        senderId: "42",
        chatId: "42",
        outgoing: true,
        readReceipt: { read: true, direction: "outbox" },
      },
      {
        id: 1,
        date: 1_800_000_000,
        text: "older",
        senderId: "42",
        chatId: "42",
        outgoing: false,
        readReceipt: { read: true, direction: "inbox" },
      },
    ]);
  });

  test("uses mtcute search for text and pinned messages", async () => {
    const searches: unknown[] = [];
    const client = clientFixture({
      searchMessages: async (params) => {
        searches.push(params);
        return [] as never;
      },
      getPeerDialogs: async () => [],
    });

    await listTelegramMessages(client, {
      chat: "alice",
      limit: 5,
      search: "#deploy",
    });
    await listTelegramPinnedMessages(client, { chat: "alice", limit: 3 });

    expect(searches).toEqual([
      { chatId: "alice", query: "#deploy", limit: 5 },
      { chatId: "alice", filter: SearchFilters.Pinned, limit: 3 },
    ]);
  });

  test("filters raw replies by resolved sender", async () => {
    const reply = makeMessage(12, { text: "reply", replyTo: 10 });
    const client = clientFixture({
      resolvePeer: async () => ({
        _: "inputPeerUser",
        userId: 42,
        accessHash: Long.fromNumber(420),
      }),
      getPeers: async () => [new User(alice)],
      call: async () => ({
        _: "messages.messages",
        messages: [reply.raw],
        users: [alice],
        chats: [],
      }) as never,
      getPeerDialogs: async () => [],
    });

    expect(
      await listTelegramReplies(client, {
        chat: "42",
        messageId: 10,
        from: ["alice"],
        limit: 5,
      }),
    ).toEqual([
      {
        id: 12,
        date: 1_800_000_000,
        text: "reply",
        senderId: "42",
        chatId: "42",
        replyToMessageId: 10,
        outgoing: false,
      },
    ]);
  });

  test("serializes mtcute messages without optional read state", () => {
    expect(serializeMessage(makeMessage(7, { text: "hello" }))).toEqual({
      id: 7,
      date: 1_800_000_000,
      text: "hello",
      senderId: "42",
      chatId: "42",
      outgoing: false,
    });
  });
});

describe("mtcute profiles, channels, dialogs, and folders", () => {
  test("serializes current and full user profiles", async () => {
    const full = new FullUser({
      _: "users.userFull",
      fullUser: {
        _: "userFull",
        id: 42,
        about: "Agent-ready",
        settings: { _: "peerSettings" },
        notifySettings: { _: "peerNotifySettings" },
        commonChatsCount: 0,
      },
      users: [alice],
      chats: [],
    });
    const client = clientFixture({
      getMe: async () => new User(alice),
      getFullUser: async (peer) => {
        expect(peer).toBe(42);
        return full;
      },
    });

    expect(await getCurrentAccount(client)).toMatchObject({
      id: "42",
      firstName: "Alice",
      username: "alice",
    });
    expect(await getPublicProfile(client, "42")).toMatchObject({
      id: "42",
      about: "Agent-ready",
      bot: false,
      verified: false,
    });
  });

  test("normalizes channel ids and includes pinned channel messages", async () => {
    const lookups: unknown[] = [];
    const client = clientFixture({
      getFullChat: async (peer) => {
        lookups.push(peer);
        return {
          id: -100100,
          chatType: "channel",
          title: "Fire TG",
          username: "firetg",
          bio: "Agent-ready Telegram CLI",
          membersCount: 123,
          pinnedMsgId: 9,
          isVerified: true,
          isRestricted: false,
          isScam: false,
          isFake: false,
        } as never;
      },
      getMessages: async () => [makeMessage(9, { text: "pin" })],
    });

    expect(await getChannelDetails(client, "100")).toMatchObject({
      id: "100",
      title: "Fire TG",
      description: "Agent-ready Telegram CLI",
      participantsCount: 123,
      pinnedMessage: { id: 9, text: "pin" },
      verified: true,
    });
    expect(lookups).toEqual([-100100]);
  });

  test("maps archive and custom folders to mtcute iterDialogs", async () => {
    const params: unknown[] = [];
    const dialog = {
      peer: {
        type: "user",
        id: 42,
        displayName: "Alice Agent",
      },
      raw: { folderId: 1 },
      unreadCount: 3,
    };
    const client = clientFixture({
      iterDialogs: ((options: unknown) => {
        params.push(options);
        return (async function* () {
          yield dialog;
        })();
      }) as TelegramClient["iterDialogs"],
    });

    expect(await listDialogSummaries(client, { folder: 1, limit: 2 })).toEqual([
      {
        id: "42",
        title: "Alice Agent",
        folderId: 1,
        unreadCount: 3,
        isUser: true,
        isGroup: false,
        isChannel: false,
      },
    ]);
    await listDialogSummaries(client, { folder: 78, limit: 4 });
    expect(params).toEqual([
      { limit: 2, archived: "only" },
      { limit: 4, folder: 78 },
    ]);
  });

  test("serializes discriminated mtcute dialog filters", async () => {
    const client = clientFixture({
      getFolders: async () => ({
        filters: [
          { _: "dialogFilterDefault" },
          {
            _: "dialogFilter",
            id: 78,
            title: { _: "textWithEntities", text: "Managers", entities: [] },
            emoticon: "💼",
            color: 4,
            pinnedPeers: [],
            includePeers: [],
            excludePeers: [],
          },
        ],
        tagsEnabled: false,
      }) as never,
    });

    expect(await listTelegramFolders(client)).toEqual([
      { title: "All chats", type: "dialogFilterDefault" },
      {
        id: 78,
        title: "Managers",
        type: "dialogFilter",
        emoticon: "💼",
        color: 4,
      },
    ]);
  });
});

test("flood waits use mtcute typed RPC errors", () => {
  const error = tl.RpcError.fromTl({
    errorCode: 420,
    errorMessage: "FLOOD_WAIT_42",
  });
  expect(floodWaitSeconds(error)).toBe(42);
  expect(floodWaitSeconds(new Error("FLOOD_WAIT_42"))).toBeUndefined();
});
