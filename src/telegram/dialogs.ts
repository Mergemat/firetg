import type { Dialog, TelegramClient } from "@mtcute/bun";
import type { DialogSummary } from "./types";

export async function listDialogSummaries(
  client: TelegramClient,
  options: { limit: number; folder?: number },
): Promise<DialogSummary[]> {
  const params =
    options.folder === 1
      ? { limit: options.limit, archived: "only" as const }
      : options.folder === undefined || options.folder === 0
        ? { limit: options.limit }
        : { limit: options.limit, folder: options.folder };
  const summaries: DialogSummary[] = [];

  for await (const dialog of client.iterDialogs(params)) {
    summaries.push(serializeDialog(dialog));
  }

  return summaries;
}

function serializeDialog(dialog: Dialog): DialogSummary {
  const peer = dialog.peer;
  const isChat = peer.type === "chat";
  return {
    id: unmarkPeerId(peer.id),
    title: peer.displayName,
    ...(dialog.raw.folderId === undefined
      ? {}
      : { folderId: dialog.raw.folderId }),
    unreadCount: dialog.unreadCount,
    isUser: peer.type === "user",
    isGroup: isChat && peer.isGroup,
    isChannel: isChat && peer.chatType === "channel",
  };
}

function unmarkPeerId(id: number): string {
  const value = String(id);
  if (value.startsWith("-100")) return value.slice(4);
  if (value.startsWith("-")) return value.slice(1);
  return value;
}
