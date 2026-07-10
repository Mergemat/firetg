import type { TelegramClient, tl } from "@mtcute/bun";
import type { FolderSummary } from "./types";

export async function listTelegramFolders(
  client: TelegramClient,
): Promise<FolderSummary[]> {
  return (await client.getFolders()).filters.map(serializeFolder);
}

function serializeFolder(folder: tl.TypeDialogFilter): FolderSummary {
  if (folder._ === "dialogFilterDefault") {
    return { title: "All chats", type: folder._ };
  }

  return {
    id: folder.id,
    title: folder.title.text,
    type: folder._,
    ...(folder.emoticon ? { emoticon: folder.emoticon } : {}),
    ...(folder.color === undefined ? {} : { color: folder.color }),
  };
}
