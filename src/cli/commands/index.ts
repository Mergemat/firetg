import { authLoginCommand, authLogoutCommand } from "./auth";
import {
  channelMessagesCommand,
  channelPinnedCommand,
  channelViewCommand,
} from "./channels";
import { dialogsListCommand } from "./dialogs";
import { doctorCommand, statusCommand } from "./diagnostics";
import { foldersListCommand } from "./folders";
import { meCommand, profileViewCommand } from "./me";
import {
  messagesListCommand,
  messagesPinnedCommand,
  messagesSearchCommand,
} from "./messages";
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
    summary: "Telegram account and user profiles",
    description:
      "Inspect the stored session account or a public Telegram user profile.",
    commands: [meCommand, profileViewCommand],
  },
  {
    scope: "channels",
    summary: "Telegram channel details",
    description:
      "Inspect Telegram channel metadata, messages, and pinned messages.",
    commands: [channelViewCommand, channelMessagesCommand, channelPinnedCommand],
  },
  {
    scope: "messages",
    summary: "Read and send Telegram messages",
    description:
      "Send text messages and read history from a specific Telegram chat.",
    commands: [
      sendCommand,
      messagesListCommand,
      messagesSearchCommand,
      messagesPinnedCommand,
    ],
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

export const topLevelCommands: CommandSpec[] = [statusCommand, doctorCommand];

export const commandSpecs: CommandSpec[] = [
  ...topLevelCommands,
  ...commandModules.flatMap((module) => module.commands),
];

export type {
  CommandModule,
  CommandOption,
  CommandSpec,
} from "./types";
