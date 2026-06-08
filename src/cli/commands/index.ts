import { authLoginCommand } from "./auth";
import { dialogsListCommand } from "./dialogs";
import { foldersListCommand } from "./folders";
import { meCommand } from "./me";
import { messagesListCommand } from "./messages";
import { sendCommand } from "./send";
import type { CommandSpec } from "./types";

export const commandSpecs: CommandSpec[] = [
  authLoginCommand,
  meCommand,
  sendCommand,
  foldersListCommand,
  dialogsListCommand,
  messagesListCommand,
];

export type { CommandInput, CommandSpec } from "./types";
