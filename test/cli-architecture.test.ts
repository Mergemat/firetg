import { describe, expect, test } from "bun:test";
import { commandSpecs } from "../src/cli/commands";

describe("cli architecture", () => {
  test("commands are declared through a registry", () => {
    const ids = commandSpecs.map((command) => command.id);

    expect(ids).toEqual([
      "auth.login",
      "me",
      "send",
      "folders.list",
      "dialogs.list",
      "messages.list",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(commandSpecs.every((command) => command.usage.length > 0)).toBe(true);
  });
});
