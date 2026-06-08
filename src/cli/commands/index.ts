import { authLoginCommand, authLogoutCommand } from "./auth";
import { dialogsListCommand } from "./dialogs";
import { foldersListCommand } from "./folders";
import { meCommand } from "./me";
import { messagesListCommand } from "./messages";
import { sendCommand } from "./send";
import type { CommandModule, CommandSpec } from "./types";

export const commandModules: CommandModule[] = [
  { scope: "auth", commands: [authLoginCommand, authLogoutCommand] },
  { scope: "profiles", commands: [meCommand] },
  { scope: "messages", commands: [sendCommand, messagesListCommand] },
  { scope: "dialogs", commands: [dialogsListCommand] },
  { scope: "folders", commands: [foldersListCommand] },
];

export const commandSpecs: CommandSpec[] = commandModules.flatMap(
  (module) => module.commands,
);

export type { CommandInput, CommandModule, CommandSpec } from "./types";
