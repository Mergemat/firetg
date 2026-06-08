import { describe, expect, test } from "bun:test";
import { commandModules, commandSpecs } from "../src/cli/commands";

describe("cli architecture", () => {
  test("commands are declared through scoped modules", () => {
    const modules = commandModules.map((module) => ({
      scope: module.scope,
      summary: module.summary,
      commands: module.commands.map((command) => command.id),
    }));

    expect(modules).toEqual([
      {
        scope: "auth",
        summary: "Login/logout and local session storage",
        commands: ["auth.login", "auth.logout"],
      },
      {
        scope: "profiles",
        summary: "Telegram account and user profiles",
        commands: ["profiles.me", "profiles.view"],
      },
      {
        scope: "channels",
        summary: "Telegram channel details",
        commands: ["channels.view"],
      },
      {
        scope: "messages",
        summary: "Read and send Telegram messages",
        commands: ["messages.send", "messages.list"],
      },
      {
        scope: "dialogs",
        summary: "Chats and dialog lists",
        commands: ["dialogs.list"],
      },
      {
        scope: "folders",
        summary: "Telegram folder metadata",
        commands: ["folders.list"],
      },
    ]);
  });

  test("scoped commands are flattened for the CLI runner", () => {
    const ids = commandSpecs.map((command) => command.id);

    expect(ids).toEqual([
      "auth.login",
      "auth.logout",
      "profiles.me",
      "profiles.view",
      "channels.view",
      "messages.send",
      "messages.list",
      "dialogs.list",
      "folders.list",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(commandSpecs.every((command) => command.usage.length > 0)).toBe(true);
    expect(commandSpecs.every((command) => command.help.summary.length > 0)).toBe(
      true,
    );
  });
});
