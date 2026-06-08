import { Api } from "teleproto";
import type { FolderSummary } from "./types";

export function listTelegramFolders(
  filters: Api.TypeDialogFilter[],
): FolderSummary[] {
  return filters.map(serializeFolder);
}

function serializeFolder(folder: Api.TypeDialogFilter): FolderSummary {
  if (folder instanceof Api.DialogFilterDefault) {
    return { title: "All chats", type: folder.className };
  }

  return {
    id: folder.id,
    title: textWithEntitiesToString(folder.title),
    type: folder.className,
    emoticon: folder.emoticon,
    color: folder.color,
  };
}

function textWithEntitiesToString(value: Api.TypeTextWithEntities): string {
  return "text" in value ? value.text : "";
}
