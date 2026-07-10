import { describe, expect, test } from "bun:test";
import {
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tl } from "@mtcute/bun";
import { runCli } from "../src/cli";
import { commandModules } from "../src/cli/commands";
import { LocalStore } from "../src/localStore";
import type { FireTgClient, SendMessageInput } from "../src/telegram";

function createHarness() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const store = new LocalStore(
    join(tmpdir(), `firetg-test-${crypto.randomUUID()}`),
  );

  return {
    stdout,
    stderr,
    store,
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
      question: async () => "",
    },
  };
}

function fakeTelegram(overrides: Partial<FireTgClient> = {}): FireTgClient {
  return {
    login: async () => ({ id: "1", firstName: "Test" }),
    logout: async () => {},
    getMe: async () => ({ id: "1", firstName: "Test" }),
    getProfile: async () => ({ id: "1", firstName: "Test" }),
    getChannel: async () => ({ id: "1", title: "Test" }),
    sendMessage: async () => ({ id: 1, date: 1, text: "" }),
    listFolders: async () => [],
    listDialogs: async () => [],
    listMessages: async () => [],
    listReplies: async () => [],
    listPinnedMessages: async () => [],
    disconnect: async () => {},
    ...overrides,
  };
}

async function createStoredAuthStore() {
  const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
  const store = new LocalStore(configHome);
  await store.writeCredentials({ apiId: 123, apiHash: "hash" });
  await writeFile(store.paths.telegram, "sqlite", { mode: 0o600 });

  return {
    store,
    configPath: store.paths.config,
    storagePath: store.paths.telegram,
  };
}

describe("firetg cli", () => {
  test("--help prints module overview", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["--help"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout.join("")).toContain("USAGE");
    expect(harness.stdout.join("")).toContain("COMMAND GROUPS");
    expect(harness.stdout.join("")).toContain("auth");
    expect(harness.stdout.join("")).toContain("messages");
    expect(harness.stdout.join("")).toContain("GETTING STARTED");
    expect(harness.stdout.join("")).toContain("Use \"firetg <module>\"");
    expect(harness.stderr.join("")).toBe("");
  });

  test("module without subcommand prints module help", async () => {
    for (const module of commandModules) {
      const harness = createHarness();

      const exitCode = await runCli([module.scope], {
        store: harness.store,
        io: harness.io,
      });

      expect(exitCode).toBe(0);
      expect(harness.stdout.join("")).toContain(`firetg ${module.scope}`);
      expect(harness.stdout.join("")).toContain("COMMANDS");
      for (const command of module.commands.filter((item) => !item.hidden)) {
        expect(harness.stdout.join("")).toContain(`firetg ${command.usage}`);
      }
      expect(harness.stderr.join("")).toBe("");
    }
  });

  test("module --help prints module help", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["messages", "--help"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout.join("")).toContain("firetg messages");
    expect(harness.stdout.join("")).toContain("send");
    expect(harness.stdout.join("")).toContain("list");
    expect(harness.stdout.join("")).toContain("firetg messages list");
    expect(harness.stderr.join("")).toBe("");
  });

  test("command --help prints command help", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["messages", "list", "--help"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout.join("")).toContain("firetg messages list");
    expect(harness.stdout.join("")).toContain("--chat <peer>");
    expect(harness.stdout.join("")).toContain("--search <query>");
    expect(harness.stdout.join("")).toContain("EXAMPLES");
    expect(harness.stderr.join("")).toBe("");
  });

  test("unknown subcommand includes compact scoped help", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["dialogs", "listdd"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toBe(
      "Unknown command: dialogs listdd.\n\nAvailable dialogs commands:\n" +
        "  firetg dialogs list [--folder <id>] [--limit <n>]\n",
    );
  });

  test("unknown command group includes compact root help", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["listdd"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain("Unknown command: listdd.");
    expect(harness.stdout.join("")).toContain("Available command groups:");
    expect(harness.stdout.join("")).toContain("  dialogs - Chats and dialog lists");
  });

  test("unknown flags fail with usage before Telegram is called", async () => {
    const harness = createHarness();
    let created = false;

    const exitCode = await runCli(["dialogs", "list", "--limt", "2"], {
      store: harness.store,
      io: harness.io,
      createTelegram: async () => {
        created = true;
        return fakeTelegram();
      },
    });

    expect(exitCode).toBe(1);
    expect(created).toBe(false);
    expect(harness.stdout.join("")).toBe(
      "Unknown flag: --limt.\nUsage: firetg dialogs list [--folder <id>] [--limit <n>]\n",
    );
  });

  test("invalid, duplicate, and unbounded limits fail with usage", async () => {
    for (const args of [
      ["dialogs", "list", "--limit", "nope"],
      ["dialogs", "list", "--limit", "0"],
      ["dialogs", "list", "--limit", "101"],
      ["dialogs", "list", "--limit", "2", "--limit", "3"],
    ]) {
      const harness = createHarness();
      const exitCode = await runCli(args, {
        store: harness.store,
        io: harness.io,
      });

      expect(exitCode).toBe(1);
      expect(harness.stdout.join("")).toContain("Usage: firetg dialogs list");
    }
  });

  test("extra positional arguments fail instead of being ignored", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["folders", "list", "ignored"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toBe(
      "Unexpected argument: ignored.\nUsage: firetg folders list\n",
    );

    const aliasHarness = createHarness();
    const aliasExitCode = await runCli(["send", "ignored"], {
      store: aliasHarness.store,
      io: aliasHarness.io,
    });
    expect(aliasExitCode).toBe(1);
    expect(aliasHarness.stdout.join("")).toContain(
      "Unexpected argument: ignored.\nUsage: firetg messages send",
    );
  });

  test("agent command reports missing API config with recovery", async () => {
    const harness = createHarness();
    const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
    const store = new LocalStore(configHome);

    const exitCode = await runCli(["profiles", "me"], {
      store,
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message: `Missing config file at ${store.paths.config}; run firetg auth login interactively`,
      },
    });
    expect(harness.stderr.join("")).toBe("");
  });

  test("agent command reports missing Telegram storage as JSON", async () => {
    const harness = createHarness();
    const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
    const store = new LocalStore(configHome);
    await store.writeCredentials({ apiId: 123, apiHash: "hash" });

    const exitCode = await runCli(["profiles", "me"], {
      store,
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message: `Missing Telegram login at ${store.paths.telegram}; run firetg auth login`,
      },
    });
  });

  test("profiles me emits the current account as JSON", async () => {
    const harness = createHarness();
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(["profiles", "me"], {
      store,
      io: harness.io,
      createTelegram: async () => fakeTelegram({
        getMe: async () => ({
          id: "42",
          username: "agent",
          firstName: "Fire",
          lastName: "TG",
          phone: "+10000000000",
        }),
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      id: "42",
      username: "agent",
      firstName: "Fire",
      lastName: "TG",
    });
    expect(harness.stderr.join("")).toBe("");
  });

  test("profiles view emits a public profile by username as JSON", async () => {
    const harness = createHarness();
    const viewed: string[] = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["profiles", "view", "--username", "firetg"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          getProfile: async (username) => {
            viewed.push(username);
            return {
              id: "42",
              username: "firetg",
              firstName: "Fire",
              lastName: "TG",
              about: "Agent-ready Telegram CLI",
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(viewed).toEqual(["firetg"]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      id: "42",
      username: "firetg",
      firstName: "Fire",
      lastName: "TG",
      about: "Agent-ready Telegram CLI",
    });
    expect(harness.stderr.join("")).toBe("");
  });

  test("profiles view accepts a known user id", async () => {
    const harness = createHarness();
    const viewed: string[] = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["profiles", "view", "--id", "123456789"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          getProfile: async (user) => {
            viewed.push(user);
            return {
              id: "123456789",
              username: "clrdrv",
              firstName: "Kirill",
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(viewed).toEqual(["123456789"]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      id: "123456789",
      username: "clrdrv",
      firstName: "Kirill",
    });
  });

  test("profiles get accepts a positional username", async () => {
    const harness = createHarness();
    const viewed: string[] = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(["profiles", "get", "firetg"], {
      store,
      io: harness.io,
      createTelegram: async () => fakeTelegram({
        getProfile: async (user) => {
          viewed.push(user);
          return {
            id: "42",
            username: "firetg",
            firstName: "Fire",
          };
        },
      }),
    });

    expect(exitCode).toBe(0);
    expect(viewed).toEqual(["firetg"]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      id: "42",
      username: "firetg",
      firstName: "Fire",
    });
  });

  test("flood waits surface as RATE_LIMITED with a retry deadline", async () => {
    const harness = createHarness();
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["profiles", "view", "--username", "PaninaOk"],
      {
        store,
        io: harness.io,
        now: () => new Date("2026-07-01T00:00:00.000Z"),
        createTelegram: async () => fakeTelegram({
          getProfile: async () => {
            throw tl.RpcError.fromTl({
              errorCode: 420,
              errorMessage: "FLOOD_WAIT_53047",
            });
          },
        }),
      },
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message:
          "Telegram rate-limited this action after too many similar requests. Retry at 2026-07-01T14:44:07.000Z (in 14h 44m 7s); avoid retrying it earlier or in parallel",
        blockedUntil: "2026-07-01T14:44:07.000Z",
        remainingSeconds: 53047,
      },
    });
  });

  test("plain errors that mention flood waits are not misclassified", async () => {
    const harness = createHarness();
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["messages", "list", "--chat", "@PaninaOk"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listMessages: async () => {
            throw new Error("FLOOD_WAIT_53047");
          },
        }),
      },
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "TELEGRAM_ERROR",
        message:
          "FLOOD_WAIT_53047. Retry once only if the failure appears transient",
      },
    });
  });

  test("chat slow mode explains its scope and retry deadline", async () => {
    const harness = createHarness();
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["messages", "send", "--username", "alice", "--text", "hello"],
      {
        store,
        io: harness.io,
        now: () => new Date("2026-07-01T00:00:00.000Z"),
        createTelegram: async () =>
          fakeTelegram({
            sendMessage: async () => {
              throw tl.RpcError.fromTl({
                errorCode: 420,
                errorMessage: "SLOWMODE_WAIT_60",
              });
            },
          }),
      },
    );

    expect(exitCode).toBe(2);
    expect(JSON.parse(harness.stdout.join("")).error).toEqual({
      code: "RATE_LIMITED",
      message:
        "This chat has slow mode enabled. Retry at 2026-07-01T00:01:00.000Z (in 1m); other chats are unaffected",
      blockedUntil: "2026-07-01T00:01:00.000Z",
      remainingSeconds: 60,
    });
  });

  test("auth flood waits use the same actionable classification", async () => {
    const harness = createHarness();
    await harness.store.writeCredentials({ apiId: 123, apiHash: "hash" });

    const exitCode = await runCli(["auth", "login"], {
      store: harness.store,
      io: harness.io,
      now: () => new Date("2026-07-01T00:00:00.000Z"),
      createTelegram: async () =>
        fakeTelegram({
          login: async () => {
            throw tl.RpcError.fromTl({
              errorCode: 420,
              errorMessage: "FLOOD_WAIT_30",
            });
          },
        }),
    });

    expect(exitCode).toBe(2);
    expect(JSON.parse(harness.stdout.join("")).error.code).toBe("RATE_LIMITED");
    expect(JSON.parse(harness.stdout.join("")).error.message).toContain(
      "repeated login attempts",
    );
  });

  test("profiles view validates lookup flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["profiles", "view"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toBe(
      "profiles view requires --username or --id.\nUsage: firetg profiles get <username|user-id>\n",
    );
  });

  test("profiles view rejects ambiguous lookup flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      ["profiles", "view", "--username", "firetg", "--id", "42"],
      {
        store: harness.store,
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toBe(
      "profiles view accepts either --username or --id, not both.\nUsage: firetg profiles get <username|user-id>\n",
    );
  });

  test("channels view emits channel details by username as JSON", async () => {
    const harness = createHarness();
    const viewed: string[] = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["channels", "view", "--username", "firetg"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          getChannel: async (channel) => {
            viewed.push(channel);
            return {
              id: "100",
              title: "FireTG",
              username: "firetg",
              description: "Agent-ready Telegram CLI",
              participantsCount: 123,
              pinnedMessage: {
                id: 7,
                date: 1_800_000_003,
                text: "Start here",
                senderId: "42",
                chatId: "100",
                outgoing: false,
              },
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(viewed).toEqual(["firetg"]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      id: "100",
      title: "FireTG",
      username: "firetg",
      description: "Agent-ready Telegram CLI",
      participantsCount: 123,
      pinnedMessage: {
        id: 7,
        date: 1_800_000_003,
        text: "Start here",
        senderId: "42",
        chatId: "100",
        outgoing: false,
      },
    });
    expect(harness.stderr.join("")).toBe("");
  });

  test("channels messages emits channel messages as JSON", async () => {
    const harness = createHarness();
    const calls: Array<{ chat: string; limit: number; search?: string }> = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["channels", "messages", "--username", "example_channel", "--limit", "2"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listMessages: async (options) => {
            calls.push(options);
            return [
              {
                id: 35,
                date: 1_800_000_200,
                text: "latest channel post",
                senderId: "42",
                chatId: "2139391239",
                outgoing: false,
              },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ chat: "example_channel", limit: 2 }]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual([
      {
        id: 35,
        date: 1_800_000_200,
        text: "latest channel post",
        senderId: "42",
        chatId: "2139391239",
        outgoing: false,
      },
    ]);
  });

  test("channels pinned emits pinned channel messages as JSON", async () => {
    const harness = createHarness();
    const calls: Array<{ chat: string; limit: number }> = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["channels", "pinned", "--username", "example_channel", "--limit", "2"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listPinnedMessages: async (options) => {
            calls.push(options);
            return [
              {
                id: 35,
                date: 1_800_000_200,
                text: "latest pin",
                senderId: "42",
                chatId: "2139391239",
                outgoing: false,
              },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ chat: "example_channel", limit: 2 }]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual([
      {
        id: 35,
        date: 1_800_000_200,
        text: "latest pin",
        senderId: "42",
        chatId: "2139391239",
        outgoing: false,
      },
    ]);
  });

  test("messages send accepts a username destination", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["messages", "send", "--username", "telegram", "--text", "hello"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return {
              id: 7,
              date: 1_800_000_000,
              text: typeof message === "string" ? message : message.text ?? "",
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(sent).toEqual([{ to: "telegram", message: "hello" }]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      id: 7,
      date: 1_800_000_000,
    });
  });

  test("messages send accepts a user id destination", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["messages", "send", "--id", "123456789", "--text", "hello"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return {
              id: 8,
              date: 1_800_000_001,
              text: typeof message === "string" ? message : message.text ?? "",
            };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(sent).toEqual([{ to: "123456789", message: "hello" }]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      id: 8,
      date: 1_800_000_001,
    });
  });

  test("messages send accepts ISO scheduled delivery", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { store } = await createStoredAuthStore();
    const scheduleAt = new Date(Date.now() + 3_600_000).toISOString();
    const scheduledAt = Math.floor(Date.parse(scheduleAt) / 1000);

    const exitCode = await runCli(
      [
        "messages",
        "send",
        "--username",
        "telegram",
        "--text",
        "hello later",
        "--schedule-at",
        scheduleAt,
      ],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return { id: 11, date: scheduledAt, text: "hello later" };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(sent).toEqual([
      {
        to: "telegram",
        message: { text: "hello later", scheduledAt },
      },
    ]);
  });

  test("messages send accepts unix scheduled delivery", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { store } = await createStoredAuthStore();
    const scheduledAt = Math.floor(Date.now() / 1000) + 3600;

    const exitCode = await runCli(
      [
        "messages",
        "send",
        "--id",
        "123456789",
        "--text",
        "hello later",
        "--schedule-at",
        String(scheduledAt),
      ],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return { id: 12, date: scheduledAt, text: "hello later" };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(sent).toEqual([
      {
        to: "123456789",
        message: { text: "hello later", scheduledAt },
      },
    ]);
  });

  test("messages send accepts a file attachment with a caption", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { store } = await createStoredAuthStore();
    const directory = await mkdtemp(join(tmpdir(), "firetg-attachment-"));
    const attachment = join(directory, "photo.jpg");
    await writeFile(attachment, "image");

    const exitCode = await runCli(
      [
        "messages",
        "send",
        "--username",
        "telegram",
        "--file",
        attachment,
        "--text",
        "caption",
      ],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return { id: 9, date: 1_800_000_002, text: "caption" };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(sent).toEqual([
      {
        to: "telegram",
        message: {
          text: "caption",
          attachment,
          forceDocument: false,
        },
      },
    ]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      id: 9,
      date: 1_800_000_002,
    });
  });

  test("messages send accepts scheduled file attachments", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { store } = await createStoredAuthStore();
    const directory = await mkdtemp(join(tmpdir(), "firetg-attachment-"));
    const attachment = join(directory, "photo.jpg");
    const scheduledAt = Math.floor(Date.now() / 1000) + 3600;
    await writeFile(attachment, "image");

    const exitCode = await runCli(
      [
        "messages",
        "send",
        "--username",
        "telegram",
        "--file",
        attachment,
        "--schedule-at",
        String(scheduledAt),
      ],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return { id: 13, date: scheduledAt, text: "" };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(sent).toEqual([
      {
        to: "telegram",
        message: {
          text: undefined,
          attachment,
          forceDocument: false,
          scheduledAt,
        },
      },
    ]);
  });

  test("messages send accepts the attachment alias and document mode", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { store } = await createStoredAuthStore();
    const directory = await mkdtemp(join(tmpdir(), "firetg-attachment-"));
    const attachment = join(directory, "report.pdf");
    await writeFile(attachment, "pdf");

    const exitCode = await runCli(
      [
        "messages",
        "send",
        "--username",
        "telegram",
        "--attachment",
        attachment,
        "--document",
      ],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return { id: 10, date: 1_800_000_003, text: "" };
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(sent).toEqual([
      {
        to: "telegram",
        message: {
          text: undefined,
          attachment,
          forceDocument: true,
        },
      },
    ]);
  });

  test("messages send rejects ambiguous destination flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      [
        "messages",
        "send",
        "--username",
        "telegram",
        "--id",
        "123456789",
        "--text",
        "hello",
      ],
      {
        store: harness.store,
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain(
      "messages send accepts only one destination flag.\nUsage: firetg messages send",
    );
  });

  test("messages send rejects invalid scheduled delivery before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      [
        "messages",
        "send",
        "--username",
        "telegram",
        "--text",
        "hello",
        "--schedule-at",
        "not-a-date",
      ],
      {
        store: harness.store,
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain(
      "messages send requires --schedule-at to be ISO-8601 date-time or unix seconds.\nUsage: firetg messages send",
    );
  });

  test("messages send rejects past scheduled delivery before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      [
        "messages",
        "send",
        "--username",
        "telegram",
        "--text",
        "hello",
        "--schedule-at",
        "1",
      ],
      {
        store: harness.store,
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain(
      "messages send requires --schedule-at to be in the future.\nUsage: firetg messages send",
    );
  });

  test("messages send validates required flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["messages", "send"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain(
      "messages send requires --username or --id plus --text or --file.\nUsage: firetg messages send",
    );
  });

  test("messages send rejects ambiguous attachment flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      [
        "messages",
        "send",
        "--username",
        "telegram",
        "--file",
        "a.jpg",
        "--attachment",
        "b.jpg",
      ],
      {
        store: harness.store,
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain(
      "messages send accepts either --file or --attachment, not both.\nUsage: firetg messages send",
    );
  });

  test("messages send rejects missing attachment files before loading config", async () => {
    const harness = createHarness();
    const missing = join(tmpdir(), "firetg-missing-attachment.jpg");

    const exitCode = await runCli(
      ["messages", "send", "--username", "telegram", "--file", missing],
      {
        store: harness.store,
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain(
      `attachment file not found: ${missing}.\nUsage: firetg messages send`,
    );
  });

  test("messages send rejects removed --to flag before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      ["messages", "send", "--to", "me", "--text", "hello"],
      {
        store: harness.store,
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain(
      "messages send does not support --to; use --username or --id.\nUsage: firetg messages send",
    );
  });

  test("folders list emits Telegram folders as JSON", async () => {
    const harness = createHarness();
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(["folders", "list"], {
      store,
      io: harness.io,
      createTelegram: async () => fakeTelegram({
        listFolders: async () => [
          { id: 1, title: "Archive", type: "DialogFilter" },
          { id: 2, title: "Work", type: "DialogFilter", emoticon: "💼" },
        ],
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(harness.stdout.join(""))).toEqual([
      { id: 1, title: "Archive", type: "DialogFilter" },
      { id: 2, title: "Work", type: "DialogFilter", emoticon: "💼" },
    ]);
  });

  test("dialogs list scopes dialogs to a folder and emits JSON", async () => {
    const harness = createHarness();
    const calls: Array<{ limit: number; folder?: number }> = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["dialogs", "list", "--folder", "2", "--limit", "3"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listDialogs: async (options) => {
            calls.push(options);
            return [
              {
                id: "100",
                title: "Ops",
                folderId: 2,
                unreadCount: 4,
                isUser: false,
                isGroup: true,
                isChannel: false,
              },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ limit: 3, folder: 2 }]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual([
      {
        id: "100",
        title: "Ops",
        folderId: 2,
        unreadCount: 4,
        isUser: false,
        isGroup: true,
        isChannel: false,
      },
    ]);
  });

  test("messages list emits chat messages as JSON", async () => {
    const harness = createHarness();
    const calls: Array<{ chat: string; limit: number; search?: string }> = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["messages", "list", "--chat", "me", "--limit", "2", "--search", "deploy"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listMessages: async (options) => {
            calls.push(options);
            return [
              {
                id: 11,
                date: 1_800_000_100,
                text: "deploy done",
                senderId: "42",
                chatId: "me",
                outgoing: false,
              },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ chat: "me", limit: 2, search: "deploy" }]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual([
      {
        id: 11,
        date: 1_800_000_100,
        text: "deploy done",
        senderId: "42",
        chatId: "me",
        outgoing: false,
      },
    ]);
  });

  test("messages search emits hashtag matches", async () => {
    const harness = createHarness();
    const calls: Array<{
      chat: string;
      limit: number;
      search?: string;
    }> = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      [
        "messages",
        "search",
        "--chat",
        "launch-team",
        "--hashtag",
        "#deploy",
        "--limit",
        "50",
      ],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listMessages: async (options) => {
            calls.push(options);
            return [
              {
                id: 101,
                date: 1_800_000_101,
                text: "Ship it #deploy",
                senderId: "7",
                chatId: "100",
                outgoing: false,
              },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      {
        chat: "launch-team",
        limit: 50,
        search: "#deploy",
      },
    ]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual([
      {
        id: 101,
        date: 1_800_000_101,
        text: "Ship it #deploy",
        senderId: "7",
        chatId: "100",
        outgoing: false,
      },
    ]);
  });

  test("messages search emits replies from selected senders", async () => {
    const harness = createHarness();
    const calls: Array<{
      chat: string;
      messageId: number;
      from: string[];
      limit: number;
    }> = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      [
        "messages",
        "search",
        "--chat",
        "launch-team",
        "--reply-to",
        "101",
        "--from",
        "42,alice",
        "--limit",
        "10",
      ],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listReplies: async (options) => {
            calls.push(options);
            return [
              {
                id: 102,
                date: 1_800_000_102,
                text: "confirmed",
                senderId: "42",
                chatId: "100",
                replyToMessageId: 101,
                outgoing: false,
              },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      {
        chat: "launch-team",
        messageId: 101,
        from: ["42", "alice"],
        limit: 10,
      },
    ]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual([
      {
        id: 102,
        date: 1_800_000_102,
        text: "confirmed",
        senderId: "42",
        chatId: "100",
        replyToMessageId: 101,
        outgoing: false,
      },
    ]);
  });

  test("messages search validates required flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["messages", "search", "--chat", "me"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain(
      "messages search requires --hashtag or --reply-to with --from.\nUsage: firetg messages search",
    );
  });

  test("messages list validates --chat before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["messages", "list"], {
      store: harness.store,
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stdout.join("")).toContain(
      "messages list requires --chat.\nUsage: firetg messages list",
    );
  });

  test("messages pinned emits pinned chat messages as JSON", async () => {
    const harness = createHarness();
    const calls: Array<{ chat: string; limit: number }> = [];
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(
      ["messages", "pinned", "--chat", "example_channel", "--limit", "2"],
      {
        store,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listPinnedMessages: async (options) => {
            calls.push(options);
            return [
              {
                id: 35,
                date: 1_800_000_200,
                text: "latest pin",
                senderId: "42",
                chatId: "2139391239",
                outgoing: false,
              },
            ];
          },
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ chat: "example_channel", limit: 2 }]);
    expect(JSON.parse(harness.stdout.join(""))).toEqual([
      {
        id: 35,
        date: 1_800_000_200,
        text: "latest pin",
        senderId: "42",
        chatId: "2139391239",
        outgoing: false,
      },
    ]);
  });

  test("auth login uses QR by default and reports SQLite storage", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const prompts: string[] = [];
    const answers = ["123", "hash"];
    const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
    const store = new LocalStore(configHome);

    const exitCode = await runCli(["auth", "login"], {
      store,
      io: {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
        question: async (prompt) => {
          prompts.push(prompt);
          return answers.shift() ?? "";
        },
      },
      createTelegram: async () => fakeTelegram({
        login: async (params) => {
          if (params.mode !== "qr") throw new Error("Expected QR auth");

          params.qrCode({
            url: "tg://login?token=dG9rZW4",
            expires: new Date(1_800_000_000_000),
          });

          return { id: "42", firstName: "Fire" };
        },
      }),
    });

    expect(exitCode).toBe(0);
    expect(prompts).toEqual(["API ID: ", "API hash: "]);
    expect(stderr.join("")).toContain("tg://login?token=dG9rZW4");
    expect(JSON.parse(stdout.join(""))).toEqual({ loggedIn: true });
    expect(JSON.parse(await readFile(store.paths.config, "utf8"))).toEqual({
      apiId: 123,
      apiHash: "hash",
    });
    expect((await stat(store.paths.config)).mode & 0o777).toBe(0o600);
  });

  test("auth login replaces the previous QR code when Telegram renews it", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const answers = ["123", "hash"];
    const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
    const store = new LocalStore(configHome);

    const exitCode = await runCli(["auth", "login"], {
      store,
      io: {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
        question: async () => answers.shift() ?? "",
      },
      createTelegram: async () => fakeTelegram({
        login: async (params) => {
          if (params.mode !== "qr") throw new Error("Expected QR auth");

          params.qrCode({
            url: "tg://login?token=ZXhwaXJlZA",
            expires: new Date(1_800_000_000_000),
          });
          params.qrCode({
            url: "tg://login?token=cmVuZXdlZA",
            expires: new Date(1_800_000_030_000),
          });

          return { id: "42", firstName: "Fire" };
        },
      }),
    });

    expect(exitCode).toBe(0);
    expect(stderr).toHaveLength(2);
    expect(stderr[0]).toContain("tg://login?token=ZXhwaXJlZA");
    expect(stderr[1]).toMatch(/^\x1b\[\d+A\x1b\[0J/);
    expect(stderr[1]).toContain("tg://login?token=cmVuZXdlZA");
  });

  test("auth login --phone normalizes phone and prompts after code delivery", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const prompts: string[] = [];
    const answers = ["123", "hash", "79886504271", "12345", "hunter2"];
    const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
    const store = new LocalStore(configHome);
    let loginValues: unknown;

    const exitCode = await runCli(["auth", "login", "--phone"], {
      store,
      io: {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
        question: async (prompt) => {
          prompts.push(prompt);
          return answers.shift() ?? "";
        },
      },
      createTelegram: async () => fakeTelegram({
        login: async (params) => {
          if (params.mode !== "phone") throw new Error("Expected phone auth");

          const phoneCode = await params.phoneCode(true);
          const password = await params.password();
          loginValues = { phone: params.phoneNumber, phoneCode, password };
          return { id: "42", firstName: "Fire" };
        },
      }),
    });

    expect(exitCode).toBe(0);
    expect(prompts).toEqual([
      "API ID: ",
      "API hash: ",
      "Phone: ",
      "Code from Telegram app: ",
      "2FA password: ",
    ]);
    expect(loginValues).toEqual({
      phone: "+79886504271",
      phoneCode: "12345",
      password: "hunter2",
    });
    expect(JSON.parse(stdout.join(""))).toEqual({ loggedIn: true });
    expect(stderr.join("")).toBe("");
  });

  test("auth logout removes the stored SQLite files", async () => {
    const harness = createHarness();
    const { store, storagePath } = await createStoredAuthStore();

    const exitCode = await runCli(["auth", "logout"], {
      store,
      io: harness.io,
      createTelegram: async () => fakeTelegram(),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({ loggedOut: true });
    await expect(readFile(storagePath, "utf8")).rejects.toThrow();
    expect(harness.stderr.join("")).toBe("");
  });

  test("message reads use bounded text previews unless full text is requested", async () => {
    const { store } = await createStoredAuthStore();
    const longText = "x".repeat(1500);
    const message = {
      id: 1,
      date: 1_800_000_000,
      text: longText,
      senderId: "42",
      chatId: "100",
      outgoing: false,
    };

    const previewHarness = createHarness();
    await runCli(["messages", "list", "--chat", "me"], {
      store,
      io: previewHarness.io,
      createTelegram: async () => fakeTelegram({
        listMessages: async () => [message],
      }),
    });
    const [preview] = JSON.parse(previewHarness.stdout.join(""));
    expect(preview.text).toHaveLength(1000);
    expect(preview.textTruncated).toBe(true);

    const fullHarness = createHarness();
    await runCli(["messages", "list", "--chat", "me", "--full-text"], {
      store,
      io: fullHarness.io,
      createTelegram: async () => fakeTelegram({
        listMessages: async () => [message],
      }),
    });
    const [full] = JSON.parse(fullHarness.stdout.join(""));
    expect(full.text).toBe(longText);
    expect(full.textTruncated).toBeUndefined();
  });

  test("auth logout revokes the stored Telegram session", async () => {
    const harness = createHarness();
    const { store, storagePath } = await createStoredAuthStore();
    const storagePaths: string[] = [];
    let logoutCalls = 0;

    const exitCode = await runCli(["auth", "logout"], {
      store,
      io: harness.io,
      createTelegram: async (config) => {
        storagePaths.push(config.storagePath);
        return fakeTelegram({
          logout: async () => {
            logoutCalls += 1;
          },
        });
      },
    });

    expect(exitCode).toBe(0);
    expect(storagePaths).toEqual([storagePath]);
    expect(logoutCalls).toBe(1);
    await expect(readFile(storagePath, "utf8")).rejects.toThrow();
    expect(harness.stderr.join("")).toBe("");
  });

  test("Telegram errors become agent-readable JSON", async () => {
    const harness = createHarness();
    const { store } = await createStoredAuthStore();

    const exitCode = await runCli(["profiles", "me"], {
      store,
      io: harness.io,
      createTelegram: async () => fakeTelegram({
        getMe: async () => {
          throw new Error("AUTH_KEY_UNREGISTERED");
        },
      }),
    });

    expect(exitCode).toBe(2);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "TELEGRAM_ERROR",
        message:
          "Telegram session is no longer valid. Run firetg auth login interactively",
      },
    });
  });
});
