import { describe, expect, test } from "bun:test";
import { commandModules, commandSpecs } from "../src/cli/commands";

describe("cli architecture", () => {
  test("commands are declared through scoped modules", () => {
    const modules = commandModules.map((module) => ({
      scope: module.scope,
      commands: module.commands.map((command) => command.id),
    }));

    expect(modules).toEqual([
      { scope: "auth", commands: ["auth.login", "auth.logout"] },
      { scope: "profiles", commands: ["profiles.me"] },
      { scope: "messages", commands: ["messages.send", "messages.list"] },
      { scope: "dialogs", commands: ["dialogs.list"] },
      { scope: "folders", commands: ["folders.list"] },
    ]);
  });

  test("scoped commands are flattened for the CLI runner", () => {
    const ids = commandSpecs.map((command) => command.id);

    expect(ids).toEqual([
      "auth.login",
      "auth.logout",
      "profiles.me",
      "messages.send",
      "messages.list",
      "dialogs.list",
      "folders.list",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(commandSpecs.every((command) => command.usage.length > 0)).toBe(true);
  });
});
