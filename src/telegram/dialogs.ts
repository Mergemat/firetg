import { Api, TelegramClient } from "teleproto";
import { getDisplayName, getPeerId } from "teleproto/Utils";
import type { Entity } from "teleproto/define";
import type { DialogSummary } from "./types";

export type { DialogSummary } from "./types";

type TeleprotoDialog = Awaited<ReturnType<TelegramClient["getDialogs"]>>[number];

export type FilterableDialogSummary = DialogSummary & {
  inputPeer: Api.TypeInputPeer;
  entity?: Entity;
  unreadMarked?: boolean;
  muteUntil?: number;
};

export type DialogSource = {
  getDialogFilters: () => Promise<Api.TypeDialogFilter[]>;
  getDialogSummaries: (options: {
    limit: number;
    folder?: number;
  }) => Promise<DialogSummary[]>;
  getFilterableDialogSummaries: () => Promise<FilterableDialogSummary[]>;
  getPeerDialogSummaries: (
    peers: Api.TypeInputPeer[],
  ) => Promise<DialogSummary[]>;
};

export function createTeleprotoDialogSource(client: TelegramClient): DialogSource {
  return {
    async getDialogFilters() {
      const response = await client.invoke(new Api.messages.GetDialogFilters());
      return response.filters;
    },
    async getDialogSummaries(options) {
      return (await client.getDialogs(options)).map(serializeDialog);
    },
    async getFilterableDialogSummaries() {
      return (await client.getDialogs({})).map(toFilterableDialogSummary);
    },
    async getPeerDialogSummaries(peers) {
      if (peers.length === 0) return [];

      const response = await client.invoke(
        new Api.messages.GetPeerDialogs({
          peers: peers.map((peer) => new Api.InputDialogPeer({ peer })),
        }),
      );
      return peerDialogsToSummaries(response);
    },
  };
}

export async function listDialogSummaries(
  source: DialogSource,
  options: { limit: number; folder?: number },
): Promise<DialogSummary[]> {
  if (options.folder === undefined || isPeerFolderId(options.folder)) {
    return source.getDialogSummaries(options);
  }

  const filter = findDialogFilter(
    await source.getDialogFilters(),
    options.folder,
  );

  if (!filter) {
    throw new Error(
      `Custom folder ${options.folder} not found. Run folders list to see available ids.`,
    );
  }

  const explicitPeers = explicitFilterPeers(filter);
  if (explicitPeers) {
    return source.getPeerDialogSummaries(explicitPeers.slice(0, options.limit));
  }

  return listDialogSummariesByScan(source, filter, options.limit);
}

async function listDialogSummariesByScan(
  source: DialogSource,
  filter: Api.DialogFilter | Api.DialogFilterChatlist,
  limit: number,
): Promise<DialogSummary[]> {
  const dialogs = await source.getFilterableDialogSummaries();
  return dialogs
    .filter((dialog) => matchesDialogFilter(dialog, filter))
    .slice(0, limit)
    .map(cleanDialogSummary);
}

function findDialogFilter(
  filters: Api.TypeDialogFilter[],
  filterId: number,
): Api.DialogFilter | Api.DialogFilterChatlist | undefined {
  return filters.find(
    (filter): filter is Api.DialogFilter | Api.DialogFilterChatlist =>
      (filter instanceof Api.DialogFilter ||
        filter instanceof Api.DialogFilterChatlist) &&
      filter.id === filterId,
  );
}

function explicitFilterPeers(
  filter: Api.DialogFilter | Api.DialogFilterChatlist,
): Api.TypeInputPeer[] | undefined {
  if (!isExplicitOnlyFilter(filter)) return undefined;

  return uniqueInputPeers([
    ...filter.pinnedPeers,
    ...filter.includePeers,
  ]);
}

function isExplicitOnlyFilter(
  filter: Api.DialogFilter | Api.DialogFilterChatlist,
): boolean {
  if (filter instanceof Api.DialogFilterChatlist) return true;

  return (
    filter.excludePeers.length === 0 &&
    !filter.contacts &&
    !filter.nonContacts &&
    !filter.groups &&
    !filter.broadcasts &&
    !filter.bots &&
    !filter.excludeMuted &&
    !filter.excludeRead &&
    !filter.excludeArchived
  );
}

function uniqueInputPeers(peers: Api.TypeInputPeer[]): Api.TypeInputPeer[] {
  const seen = new Set<string>();
  const unique: Api.TypeInputPeer[] = [];

  for (const peer of peers) {
    const key = inputPeerKey(peer);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    unique.push(peer);
  }

  return unique;
}

function toFilterableDialogSummary(
  dialog: TeleprotoDialog,
): FilterableDialogSummary {
  return {
    ...serializeDialog(dialog),
    inputPeer: dialog.inputEntity,
    entity: dialog.entity,
    unreadMarked: dialog.dialog.unreadMark,
    muteUntil: dialog.dialog.notifySettings.muteUntil,
  };
}

function peerDialogsToSummaries(
  response: Api.messages.PeerDialogs,
): DialogSummary[] {
  const entities = entitiesByPeer(response);

  return response.dialogs
    .filter((dialog): dialog is Api.Dialog => dialog instanceof Api.Dialog)
    .map((dialog) => serializePeerDialog(dialog, entities));
}

function entitiesByPeer(
  response: Api.messages.PeerDialogs,
): Map<string, Entity> {
  const entities = new Map<string, Entity>();

  for (const entity of [...response.users, ...response.chats]) {
    if (entity instanceof Api.UserEmpty || entity instanceof Api.ChatEmpty) {
      continue;
    }

    entities.set(getPeerId(entity), entity);
  }

  return entities;
}

function serializeDialog(dialog: TeleprotoDialog): DialogSummary {
  return cleanDialogSummary({
    id: dialog.id?.toString(),
    title: dialog.title,
    folderId: dialog.folderId,
    unreadCount: dialog.unreadCount,
    isUser: dialog.isUser,
    isGroup: dialog.isGroup,
    isChannel: dialog.isChannel,
  });
}

function serializePeerDialog(
  dialog: Api.Dialog,
  entities: Map<string, Entity>,
): DialogSummary {
  const entity = entities.get(getPeerId(dialog.peer));

  return cleanDialogSummary({
    id: entity ? getPeerId(entity) : undefined,
    title: entity ? getDisplayName(entity) : undefined,
    folderId: dialog.folderId,
    unreadCount: dialog.unreadCount,
    isUser: entity instanceof Api.User,
    isGroup: isGroupEntity(entity),
    isChannel: entity instanceof Api.Channel,
  });
}

function cleanDialogSummary(summary: DialogSummary): DialogSummary {
  const result: DialogSummary = {};

  if (summary.id !== undefined) result.id = summary.id;
  if (summary.title !== undefined) result.title = summary.title;
  if (summary.folderId !== undefined) result.folderId = summary.folderId;
  if (summary.unreadCount !== undefined) {
    result.unreadCount = summary.unreadCount;
  }
  if (summary.isUser !== undefined) result.isUser = summary.isUser;
  if (summary.isGroup !== undefined) result.isGroup = summary.isGroup;
  if (summary.isChannel !== undefined) result.isChannel = summary.isChannel;

  return result;
}

function isGroupEntity(entity: Entity | undefined): boolean {
  return (
    entity instanceof Api.Chat ||
    entity instanceof Api.ChatForbidden ||
    (entity instanceof Api.Channel && !!entity.megagroup)
  );
}

function matchesDialogFilter(
  dialog: FilterableDialogSummary,
  filter: Api.DialogFilter | Api.DialogFilterChatlist,
): boolean {
  const peerKey = inputPeerKey(dialog.inputPeer);
  if (!peerKey) return false;

  const excludedPeers =
    filter instanceof Api.DialogFilter
      ? new Set(filter.excludePeers.map(inputPeerKey))
      : new Set<string | undefined>();

  if (excludedPeers.has(peerKey)) return false;

  const includedPeers = new Set([
    ...filter.pinnedPeers.map(inputPeerKey),
    ...filter.includePeers.map(inputPeerKey),
  ]);

  if (includedPeers.has(peerKey)) return true;
  if (filter instanceof Api.DialogFilterChatlist) return false;

  if (filter.excludeArchived && dialog.folderId !== undefined) return false;
  if (
    filter.excludeRead &&
    (dialog.unreadCount ?? 0) <= 0 &&
    !dialog.unreadMarked
  ) {
    return false;
  }
  if (filter.excludeMuted && isMuted(dialog)) return false;

  return matchesDialogFilterCategory(dialog, filter);
}

function matchesDialogFilterCategory(
  dialog: FilterableDialogSummary,
  filter: Api.DialogFilter,
): boolean {
  if (filter.bots && dialog.entity instanceof Api.User && dialog.entity.bot) {
    return true;
  }

  if (
    filter.contacts &&
    dialog.entity instanceof Api.User &&
    !dialog.entity.bot &&
    (dialog.entity.contact || dialog.entity.mutualContact)
  ) {
    return true;
  }

  if (
    filter.nonContacts &&
    dialog.entity instanceof Api.User &&
    !dialog.entity.bot &&
    !dialog.entity.contact &&
    !dialog.entity.mutualContact
  ) {
    return true;
  }

  if (filter.groups && dialog.isGroup) return true;

  return (
    !!filter.broadcasts &&
    dialog.entity instanceof Api.Channel &&
    !!dialog.entity.broadcast
  );
}

function isMuted(dialog: FilterableDialogSummary): boolean {
  return (
    dialog.muteUntil !== undefined &&
    dialog.muteUntil > Math.floor(Date.now() / 1000)
  );
}

function inputPeerKey(inputPeer: Api.TypeInputPeer): string | undefined {
  if (inputPeer instanceof Api.InputPeerUser) {
    return `user:${inputPeer.userId.toString()}`;
  }

  if (inputPeer instanceof Api.InputPeerChat) {
    return `chat:${inputPeer.chatId.toString()}`;
  }

  if (inputPeer instanceof Api.InputPeerChannel) {
    return `channel:${inputPeer.channelId.toString()}`;
  }

  return undefined;
}

function isPeerFolderId(folderId: number): boolean {
  return folderId === 0 || folderId === 1;
}
