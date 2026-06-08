import { authLoginCommand, authLogoutCommand } from "./auth";
import { dialogsListCommand } from "./dialogs";
import { foldersListCommand } from "./folders";
import { meCommand } from "./me";
import { messagesListCommand } from "./messages";
import { sendCommand } from "./send";
import type { CommandModule, CommandSpec } from "./types";

export const commandModules: CommandModule[] = [
  {
    scope: "auth",
    summary: "Login/logout and local session storage",
    description:
      "Authorize Telegram once, store credentials/session, or revoke the stored session.",
    commands: [authLoginCommand, authLogoutCommand],
  },
  {
    scope: "profiles",
    summary: "Current Telegram account",
    description: "Inspect the Telegram account bound to the stored session.",
    commands: [meCommand],
  },
  {
    scope: "messages",
    summary: "Read and send Telegram messages",
    description:
      "Send text messages and read history from a specific Telegram chat.",
    commands: [sendCommand, messagesListCommand],
  },
  {
    scope: "dialogs",
    summary: "Chats and dialog lists",
    description:
      "List Telegram chats, optionally scoped to built-in or custom folders.",
    commands: [dialogsListCommand],
  },
  {
    scope: "folders",
    summary: "Telegram folder metadata",
    description: "List configured Telegram folders/dialog filters.",
    commands: [foldersListCommand],
  },
];

export const commandSpecs: CommandSpec[] = commandModules.flatMap(
  (module) => module.commands,
);

export type { CommandInput, CommandModule, CommandSpec } from "./types";
