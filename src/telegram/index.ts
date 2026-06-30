export { createTeleprotoClient } from "./client";
export { getChannelDetails } from "./channels";
export {
  createTeleprotoDialogSource,
  listDialogSummaries,
  type DialogSource,
  type FilterableDialogSummary,
} from "./dialogs";
export type {
  Account,
  ChannelDetails,
  CreateTelegramClient,
  DialogSummary,
  FireTgClient,
  FolderSummary,
  LoginParams,
  MessageSummary,
  SendMessageInput,
  SentMessage,
} from "./types";
