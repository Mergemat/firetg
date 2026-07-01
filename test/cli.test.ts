import { describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/cli";
import { commandModules } from "../src/cli/commands";
import { resolveStorePaths } from "../src/localStore";
import type { FireTgClient, SendMessageInput } from "../src/telegram";

function createHarness() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
      question: async () => "",
    },
  };
}

function fakeTelegram(overrides: Partial<FireTgClient> = {}): FireTgClient {
  return {
    login: async () => ({ session: "" }),
    logout: async () => {},
    getMe: async () => ({}),
    getProfile: async () => ({}),
    getChannel: async () => ({}),
    sendMessage: async () => ({}),
    listFolders: async () => [],
    listDialogs: async () => [],
    listMessages: async () => [],
    listReplies: async () => [],
    listPinnedMessages: async () => [],
    ...overrides,
  };
}

async function createStoredAuthEnv(session = "session") {
  const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
  const directory = join(configHome, "firetg");
  const configPath = join(directory, "config.json");
  const sessionPath = join(directory, "session");

  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await writeFile(
    configPath,
    `${JSON.stringify({ apiId: 123, apiHash: "hash" }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(configPath, 0o600);
  await writeFile(sessionPath, `${session}\n`, { mode: 0o600 });
  await chmod(sessionPath, 0o600);

  return {
    env: {
      XDG_CONFIG_HOME: configHome,
    },
    configPath,
    sessionPath,
  };
}

describe("firetg cli", () => {
  test("--help prints module overview", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["--help"], {
      env: {},
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
        env: {},
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
      env: {},
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
      env: {},
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout.join("")).toContain("firetg messages list");
    expect(harness.stdout.join("")).toContain("--chat <peer>");
    expect(harness.stdout.join("")).toContain("--search <query>");
    expect(harness.stdout.join("")).toContain("EXAMPLES");
    expect(harness.stderr.join("")).toBe("");
  });

  test("agent command reports missing API config file as JSON", async () => {
    const harness = createHarness();
    const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
    const configPath = join(configHome, "firetg", "config.json");

    const exitCode = await runCli(["profiles", "me"], {
      env: { XDG_CONFIG_HOME: configHome },
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message: `Missing config file at ${configPath}`,
      },
    });
    expect(harness.stderr.join("")).toBe("");
  });

  test("agent command reports missing session file as JSON", async () => {
    const harness = createHarness();
    const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
    const directory = join(configHome, "firetg");
    const configPath = join(directory, "config.json");
    const sessionPath = join(directory, "session");

    await mkdir(directory, { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({ apiId: 123, apiHash: "hash" })}\n`,
    );

    const exitCode = await runCli(["profiles", "me"], {
      env: {
        XDG_CONFIG_HOME: configHome,
      },
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message: `Missing session file at ${sessionPath}`,
      },
    });
  });

  test("profiles me emits the current account as JSON", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(["profiles", "me"], {
      env,
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
      phone: "+10000000000",
    });
    expect(harness.stderr.join("")).toBe("");
  });

  test("profiles view emits a public profile by username as JSON", async () => {
    const harness = createHarness();
    const viewed: string[] = [];
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["profiles", "view", "--username", "firetg"],
      {
        env,
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
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["profiles", "view", "--id", "123456789"],
      {
        env,
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
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(["profiles", "get", "firetg"], {
      env,
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

  test("profiles view records username flood waits", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();
    const now = new Date("2026-07-01T00:00:00.000Z");

    const exitCode = await runCli(
      ["profiles", "view", "--username", "PaninaOk"],
      {
        env,
        io: harness.io,
        now: () => now,
        createTelegram: async () => fakeTelegram({
          getProfile: async () => {
            throw new Error(
              "A wait of 53047 seconds is required (caused by contacts.ResolveUsername)",
            );
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
          "Telegram username resolves are blocked until 2026-07-01T14:44:07.000Z",
        blockedUntil: "2026-07-01T14:44:07.000Z",
        remainingSeconds: 53047,
      },
    });
    expect(
      JSON.parse(
        await readFile(resolveStorePaths(env).resolver, "utf8"),
      ).blockedUntil,
    ).toBe("2026-07-01T14:44:07.000Z");
  });

  test("profiles view skips Telegram while username resolves are flood blocked", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();
    await writeFile(
      resolveStorePaths(env).resolver,
      `${JSON.stringify({
        version: 1,
        blockedUntil: "2026-07-01T14:44:07.000Z",
        queue: [],
      })}\n`,
    );
    let created = false;

    const exitCode = await runCli(
      ["profiles", "view", "--username", "PaninaOk"],
      {
        env,
        io: harness.io,
        now: () => new Date("2026-07-01T00:00:00.000Z"),
        createTelegram: async () => {
          created = true;
          return fakeTelegram();
        },
      },
    );

    expect(exitCode).toBe(2);
    expect(created).toBe(false);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message:
          "Telegram username resolves are blocked until 2026-07-01T14:44:07.000Z",
        blockedUntil: "2026-07-01T14:44:07.000Z",
        remainingSeconds: 53047,
      },
    });
  });

  test("profiles queue stores normalized usernames", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["profiles", "queue", "--username", "@Alice,bob,Alice"],
      {
        env,
        io: harness.io,
        now: () => new Date("2026-07-01T00:00:00.000Z"),
      },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
      blocked: false,
      pending: 2,
      resolved: 0,
      failed: 0,
      enqueued: ["Alice", "bob"],
      skipped: [],
    });
    expect(
      JSON.parse(await readFile(resolveStorePaths(env).resolver, "utf8")).queue,
    ).toMatchObject([
      { username: "Alice", status: "pending", attempts: 0 },
      { username: "bob", status: "pending", attempts: 0 },
    ]);
  });

  test("profiles resolve processes queued usernames", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();
    await runCli(["profiles", "queue", "--username", "alice,bob"], {
      env,
      io: createHarness().io,
      now: () => new Date("2026-07-01T00:00:00.000Z"),
    });

    const exitCode = await runCli(["profiles", "resolve", "--limit", "1"], {
      env,
      io: harness.io,
      now: () => new Date("2026-07-01T00:00:10.000Z"),
      createTelegram: async () => fakeTelegram({
        getProfile: async (username) => ({
          id: username === "alice" ? "1" : "2",
          username,
          firstName: username,
        }),
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
      blocked: false,
      pending: 1,
      resolved: 1,
      failed: 0,
      processed: [
        {
          username: "alice",
          profile: {
            id: "1",
            username: "alice",
            firstName: "alice",
          },
        },
      ],
      errors: [],
    });
    expect(
      JSON.parse(await readFile(resolveStorePaths(env).resolver, "utf8")).queue,
    ).toMatchObject([
      {
        username: "alice",
        status: "resolved",
        attempts: 1,
        profile: { id: "1", username: "alice" },
      },
      { username: "bob", status: "pending", attempts: 0 },
    ]);
  });

  test("profiles resolve can queue and process usernames in one command", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["profiles", "resolve", "@alice", "bob", "--limit", "1"],
      {
        env,
        io: harness.io,
        now: () => new Date("2026-07-01T00:00:10.000Z"),
        createTelegram: async () => fakeTelegram({
          getProfile: async (username) => ({
            id: "1",
            username,
            firstName: username,
          }),
        }),
      },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
      blocked: false,
      pending: 1,
      resolved: 1,
      failed: 0,
      enqueued: ["alice", "bob"],
      skipped: [],
      processed: [
        {
          username: "alice",
          profile: {
            id: "1",
            username: "alice",
            firstName: "alice",
          },
        },
      ],
      errors: [],
    });
  });

  test("profiles status shows resolver state", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();
    await runCli(["profiles", "queue", "--username", "alice"], {
      env,
      io: createHarness().io,
      now: () => new Date("2026-07-01T00:00:00.000Z"),
    });

    const exitCode = await runCli(["profiles", "status"], {
      env,
      io: harness.io,
      now: () => new Date("2026-07-01T00:00:10.000Z"),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
      blocked: false,
      pending: 1,
      resolved: 0,
      failed: 0,
      queue: [
        {
          username: "alice",
          status: "pending",
        },
      ],
    });
  });

  test("profiles resolve saves flood state and leaves current item pending", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();
    await runCli(["profiles", "queue", "--username", "alice"], {
      env,
      io: createHarness().io,
      now: () => new Date("2026-07-01T00:00:00.000Z"),
    });

    const exitCode = await runCli(["profiles", "resolve"], {
      env,
      io: harness.io,
      now: () => new Date("2026-07-01T00:00:10.000Z"),
      createTelegram: async () => fakeTelegram({
        getProfile: async () => {
          throw new Error("FLOOD_WAIT_60");
        },
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
      blocked: true,
      blockedUntil: "2026-07-01T00:01:10.000Z",
      remainingSeconds: 60,
      pending: 1,
      resolved: 0,
      failed: 0,
      processed: [],
      errors: [],
    });
    expect(
      JSON.parse(await readFile(resolveStorePaths(env).resolver, "utf8")),
    ).toMatchObject({
      blockedUntil: "2026-07-01T00:01:10.000Z",
      queue: [
        {
          username: "alice",
          status: "pending",
          attempts: 1,
          error: "FLOOD_WAIT_60",
        },
      ],
    });
  });

  test("profiles view validates lookup flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["profiles", "view"], {
      env: {},
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "profiles view requires --username or --id",
      },
    });
  });

  test("profiles view rejects ambiguous lookup flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      ["profiles", "view", "--username", "firetg", "--id", "42"],
      {
        env: {},
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "profiles view accepts either --username or --id, not both",
      },
    });
  });

  test("channels view emits channel details by username as JSON", async () => {
    const harness = createHarness();
    const viewed: string[] = [];
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["channels", "view", "--username", "firetg"],
      {
        env,
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
      },
    });
    expect(harness.stderr.join("")).toBe("");
  });

  test("channels messages emits channel messages as JSON", async () => {
    const harness = createHarness();
    const calls: Array<{ chat: string; limit: number; search?: string }> = [];
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["channels", "messages", "--username", "example_channel", "--limit", "2"],
      {
        env,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listMessages: async (options) => {
            calls.push(options);
            return [
              {
                id: 35,
                date: 1_800_000_200,
                text: "latest channel post",
                chatId: "2139391239",
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
        chatId: "2139391239",
      },
    ]);
  });

  test("channels pinned emits pinned channel messages as JSON", async () => {
    const harness = createHarness();
    const calls: Array<{ chat: string; limit: number }> = [];
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["channels", "pinned", "--username", "example_channel", "--limit", "2"],
      {
        env,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listPinnedMessages: async (options) => {
            calls.push(options);
            return [
              {
                id: 35,
                date: 1_800_000_200,
                text: "latest pin",
                chatId: "2139391239",
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
        chatId: "2139391239",
      },
    ]);
  });

  test("messages send accepts a username destination", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["messages", "send", "--username", "telegram", "--text", "hello"],
      {
        env,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return {
              id: 7,
              date: 1_800_000_000,
              text: typeof message === "string" ? message : message.text,
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
      text: "hello",
    });
  });

  test("messages send accepts a user id destination", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["messages", "send", "--id", "123456789", "--text", "hello"],
      {
        env,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return {
              id: 8,
              date: 1_800_000_001,
              text: typeof message === "string" ? message : message.text,
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
      text: "hello",
    });
  });

  test("messages send accepts a file attachment with a caption", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { env } = await createStoredAuthEnv();
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
        env,
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
      text: "caption",
    });
  });

  test("messages send accepts the attachment alias and document mode", async () => {
    const harness = createHarness();
    const sent: Array<{ to: string; message: string | SendMessageInput }> = [];
    const { env } = await createStoredAuthEnv();
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
        env,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          sendMessage: async (to, message) => {
            sent.push({ to, message });
            return { id: 10, date: 1_800_000_003 };
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
        env: {},
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "messages send accepts only one destination flag",
      },
    });
  });

  test("messages send validates required flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["messages", "send"], {
      env: {},
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "messages send requires --username or --id plus --text or --file",
      },
    });
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
        env: {},
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "messages send accepts either --file or --attachment, not both",
      },
    });
  });

  test("messages send rejects missing attachment files before loading config", async () => {
    const harness = createHarness();
    const missing = join(tmpdir(), "firetg-missing-attachment.jpg");

    const exitCode = await runCli(
      ["messages", "send", "--username", "telegram", "--file", missing],
      {
        env: {},
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: `attachment file not found: ${missing}`,
      },
    });
  });

  test("messages send rejects removed --to flag before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(
      ["messages", "send", "--to", "me", "--text", "hello"],
      {
        env: {},
        io: harness.io,
      },
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "messages send does not support --to; use --username or --id",
      },
    });
  });

  test("folders list emits Telegram folders as JSON", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(["folders", "list"], {
      env,
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
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["dialogs", "list", "--folder", "2", "--limit", "3"],
      {
        env,
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
                isGroup: true,
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
        isGroup: true,
      },
    ]);
  });

  test("messages list emits chat messages as JSON", async () => {
    const harness = createHarness();
    const calls: Array<{ chat: string; limit: number; search?: string }> = [];
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["messages", "list", "--chat", "me", "--limit", "2", "--search", "deploy"],
      {
        env,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listMessages: async (options) => {
            calls.push(options);
            return [
              {
                id: 11,
                date: 1_800_000_100,
                text: "deploy done",
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
    const { env } = await createStoredAuthEnv();

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
        env,
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
    const { env } = await createStoredAuthEnv();

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
        env,
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
      },
    ]);
  });

  test("messages search validates required flags before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["messages", "search", "--chat", "me"], {
      env: {},
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message:
          "messages search requires --chat plus either --hashtag or --reply-to with --from",
      },
    });
  });

  test("messages list validates --chat before loading config", async () => {
    const harness = createHarness();

    const exitCode = await runCli(["messages", "list"], {
      env: {},
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "messages list requires --chat",
      },
    });
  });

  test("messages pinned emits pinned chat messages as JSON", async () => {
    const harness = createHarness();
    const calls: Array<{ chat: string; limit: number }> = [];
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(
      ["messages", "pinned", "--chat", "example_channel", "--limit", "2"],
      {
        env,
        io: harness.io,
        createTelegram: async () => fakeTelegram({
          listPinnedMessages: async (options) => {
            calls.push(options);
            return [
              {
                id: 35,
                date: 1_800_000_200,
                text: "latest pin",
                chatId: "2139391239",
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
        chatId: "2139391239",
      },
    ]);
  });

  test("auth login uses QR by default and stores the session file", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const prompts: string[] = [];
    const answers = ["123", "hash"];
    const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));
    const configPath = join(configHome, "firetg", "config.json");
    const sessionPath = join(configHome, "firetg", "session");

    const exitCode = await runCli(["auth", "login"], {
      env: {
        XDG_CONFIG_HOME: configHome,
      },
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

          await params.qrCode({
            token: Buffer.from("token"),
            expires: 1_800_000_000,
          });

          return { session: "qr-session" };
        },
      }),
    });

    expect(exitCode).toBe(0);
    expect(prompts).toEqual(["API ID: ", "API hash: "]);
    expect(stderr.join("")).toContain("tg://login?token=dG9rZW4");
    expect(JSON.parse(stdout.join(""))).toEqual({
      configPath,
      sessionPath,
    });
    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
      apiId: 123,
      apiHash: "hash",
    });
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(sessionPath, "utf8")).toBe("qr-session\n");
    expect((await stat(sessionPath)).mode & 0o777).toBe(0o600);
  });

  test("auth login replaces the previous QR code when Telegram renews it", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const answers = ["123", "hash"];
    const configHome = await mkdtemp(join(tmpdir(), "firetg-test-"));

    const exitCode = await runCli(["auth", "login"], {
      env: {
        XDG_CONFIG_HOME: configHome,
      },
      io: {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
        question: async () => answers.shift() ?? "",
      },
      createTelegram: async () => fakeTelegram({
        login: async (params) => {
          if (params.mode !== "qr") throw new Error("Expected QR auth");

          await params.qrCode({
            token: Buffer.from("expired"),
            expires: 1_800_000_000,
          });
          await params.qrCode({
            token: Buffer.from("renewed"),
            expires: 1_800_000_030,
          });

          return { session: "qr-session" };
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
    const configPath = join(configHome, "firetg", "config.json");
    const sessionPath = join(configHome, "firetg", "session");

    const exitCode = await runCli(["auth", "login", "--phone"], {
      env: {
        XDG_CONFIG_HOME: configHome,
      },
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
          const password = await params.password("hint");
          return {
            session: `session:${params.phoneNumber}:${phoneCode}:${password}`,
          };
        },
      }),
    });

    expect(exitCode).toBe(0);
    expect(prompts).toEqual([
      "API ID: ",
      "API hash: ",
      "Phone: ",
      "Code from Telegram app: ",
      "2FA password (hint): ",
    ]);
    expect(await readFile(sessionPath, "utf8")).toBe(
      "session:+79886504271:12345:hunter2\n",
    );
    expect(JSON.parse(stdout.join(""))).toEqual({ configPath, sessionPath });
    expect(stderr.join("")).toBe("");
  });

  test("auth logout removes the stored session file", async () => {
    const harness = createHarness();
    const { env, sessionPath } = await createStoredAuthEnv();

    const exitCode = await runCli(["auth", "logout"], {
      env,
      io: harness.io,
      createTelegram: async () => fakeTelegram(),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(harness.stdout.join(""))).toEqual({
      sessionPath,
    });
    await expect(readFile(sessionPath, "utf8")).rejects.toThrow();
    expect(harness.stderr.join("")).toBe("");
  });

  test("auth logout revokes the stored Telegram session", async () => {
    const harness = createHarness();
    const { env, sessionPath } = await createStoredAuthEnv("stored-session");
    const sessions: Array<string | undefined> = [];
    let logoutCalls = 0;

    const exitCode = await runCli(["auth", "logout"], {
      env,
      io: harness.io,
      createTelegram: async (config) => {
        sessions.push(config.session);
        return fakeTelegram({
          logout: async () => {
            logoutCalls += 1;
          },
        });
      },
    });

    expect(exitCode).toBe(0);
    expect(sessions).toEqual(["stored-session"]);
    expect(logoutCalls).toBe(1);
    await expect(readFile(sessionPath, "utf8")).rejects.toThrow();
    expect(harness.stderr.join("")).toBe("");
  });

  test("Telegram errors become agent-readable JSON", async () => {
    const harness = createHarness();
    const { env } = await createStoredAuthEnv();

    const exitCode = await runCli(["profiles", "me"], {
      env,
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
        message: "AUTH_KEY_UNREGISTERED",
      },
    });
  });
});
