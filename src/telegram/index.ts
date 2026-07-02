export { createTeleprotoClient } from "./client";
export { getChannelDetails } from "./channels";
export { createPeerResolver, withPeer, type PeerResolver } from "./peers";
export { RateLimitedError, parseFloodWaitSeconds } from "./errors";
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
  Profile,
  SendMessageInput,
  SentMessage,
} from "./types";
