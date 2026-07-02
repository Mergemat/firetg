import bigInt from "big-integer";
import { Api, type TelegramClient } from "teleproto";
import {
  activeResolveBlock,
  emptyPeerCache,
  findPeerById,
  findPeerByUsername,
  readPeerCache,
  recordResolveFlood,
  upsertPeer,
  writePeerCache,
  type CachedPeer,
  type PeerCache,
  type PeerKind,
} from "../peerStore";
import { isPeerInvalidError, parseFloodWaitSeconds, RateLimitedError } from "./errors";

export type ResolvedPeer = string | Api.TypeInputPeer;

export type ResolveOptions = {
  refresh?: boolean;
  kind?: PeerKind;
};

export type PeerResolver = {
  resolve: (input: string, options?: ResolveOptions) => Promise<ResolvedPeer>;
};

type PeerInput =
  | { kind: "self" }
  | { kind: "id"; value: string; hint?: PeerKind }
  | { kind: "username"; value: string }
  | { kind: "raw"; value: string };

export function createPeerResolver(
  client: TelegramClient,
  cachePath?: string,
  now: () => Date = () => new Date(),
): PeerResolver {
  let cachePromise: Promise<PeerCache> | undefined;

  const loadCache = (): Promise<PeerCache> =>
    (cachePromise ??= cachePath
      ? readPeerCache(cachePath)
      : Promise.resolve(emptyPeerCache()));

  const saveCache = async (cache: PeerCache): Promise<void> => {
    if (cachePath) await writePeerCache(cachePath, cache);
  };

  async function resolve(
    input: string,
    options: ResolveOptions = {},
  ): Promise<ResolvedPeer> {
    const target = parsePeerInput(input, options.kind);

    if (target.kind === "self") return "me";
    if (target.kind === "raw") return target.value;

    const cache = await loadCache();

    if (!options.refresh) {
      const cached =
        target.kind === "id"
          ? findPeerById(cache, target.value, target.hint ?? options.kind)
          : findPeerByUsername(cache, target.value);
      const inputPeer = cached && toInputPeer(cached);
      if (inputPeer) return inputPeer;
    }

    return target.kind === "id"
      ? resolveId(cache, target.value, target.hint ?? options.kind)
      : resolveUsername(cache, target.value);
  }

  async function resolveId(
    cache: PeerCache,
    id: string,
    kind?: PeerKind,
  ): Promise<ResolvedPeer> {
    const me = await client.getMe().catch(() => undefined);
    if (me?.id?.toString() === id) return "me";

    const scanned = await scanDialogs(cache, (peer) => peer.id === id && (!kind || peer.kind === kind));
    if (scanned) return scanned;

    throw new Error(
      `Peer id ${id} is not known to this session. Open a dialog first or use a username.`,
    );
  }

  async function resolveUsername(
    cache: PeerCache,
    username: string,
  ): Promise<ResolvedPeer> {
    if (!activeResolveBlock(cache, now())) {
      try {
        const resolved = await client.invoke(
          new Api.contacts.ResolveUsername({ username }),
        );

        for (const entity of [...resolved.users, ...resolved.chats]) {
          const peer = cachedPeerFromEntity(entity, now());
          if (peer) upsertPeer(cache, peer);
        }
        await saveCache(cache);

        const match =
          findPeerByUsername(cache, username) ??
          findPeerById(cache, peerIdString(resolved.peer) ?? "");
        const inputPeer = match && toInputPeer(match);
        if (inputPeer) return inputPeer;
      } catch (error) {
        const waitSeconds = parseFloodWaitSeconds(error);
        if (waitSeconds === undefined) throw error;

        recordResolveFlood(cache, waitSeconds, now());
        await saveCache(cache);
      }
    }

    const key = username.toLowerCase();
    const scanned = await scanDialogs(cache, (peer) =>
      peer.usernames.includes(key),
    );
    if (scanned) return scanned;

    const block = activeResolveBlock(cache, now());
    if (block) {
      throw new RateLimitedError(block.blockedUntil, block.remainingSeconds);
    }

    throw new Error(`@${username} could not be resolved to a Telegram peer`);
  }

  async function scanDialogs(
    cache: PeerCache,
    matches: (peer: CachedPeer) => boolean,
  ): Promise<Api.TypeInputPeer | undefined> {
    let found: Api.TypeInputPeer | undefined;

    for await (const dialog of client.iterDialogs({})) {
      const peer = cachedPeerFromEntity(dialog.entity, now());
      if (!peer) continue;

      upsertPeer(cache, peer);
      if (matches(peer)) {
        found = dialog.inputEntity ?? toInputPeer(peer);
        break;
      }
    }

    await saveCache(cache);
    return found;
  }

  return { resolve };
}

export async function withPeer<T>(
  resolver: PeerResolver,
  input: string,
  handler: (peer: ResolvedPeer) => Promise<T>,
  options: ResolveOptions = {},
): Promise<T> {
  const peer = await resolver.resolve(input, options);

  try {
    return await handler(peer);
  } catch (error) {
    // Cached access hashes can go stale; re-resolve once and retry.
    if (typeof peer === "string" || !isPeerInvalidError(error)) throw error;

    return handler(await resolver.resolve(input, { ...options, refresh: true }));
  }
}

export function toInputPeer(peer: CachedPeer): Api.TypeInputPeer | undefined {
  if (peer.kind === "chat") {
    return new Api.InputPeerChat({ chatId: bigInt(peer.id) });
  }
  if (!peer.accessHash) return undefined;

  if (peer.kind === "user") {
    return new Api.InputPeerUser({
      userId: bigInt(peer.id),
      accessHash: bigInt(peer.accessHash),
    });
  }

  return new Api.InputPeerChannel({
    channelId: bigInt(peer.id),
    accessHash: bigInt(peer.accessHash),
  });
}

export function cachedPeerFromEntity(
  entity: unknown,
  now: Date,
): CachedPeer | undefined {
  if (entity instanceof Api.User && entity.id) {
    if (!entity.accessHash) return undefined;
    return {
      kind: "user",
      id: entity.id.toString(),
      accessHash: entity.accessHash.toString(),
      usernames: entityUsernames(entity),
      title:
        [entity.firstName, entity.lastName].filter(Boolean).join(" ") ||
        undefined,
      cachedAt: now.toISOString(),
    };
  }

  if (entity instanceof Api.Channel && entity.id) {
    if (!entity.accessHash) return undefined;
    return {
      kind: "channel",
      id: entity.id.toString(),
      accessHash: entity.accessHash.toString(),
      usernames: entityUsernames(entity),
      title: entity.title,
      cachedAt: now.toISOString(),
    };
  }

  if (entity instanceof Api.Chat && entity.id) {
    return {
      kind: "chat",
      id: entity.id.toString(),
      usernames: [],
      title: entity.title,
      cachedAt: now.toISOString(),
    };
  }

  return undefined;
}

function entityUsernames(entity: Api.User | Api.Channel): string[] {
  return [
    entity.username,
    ...(entity.usernames ?? [])
      .filter(
        (username) => username instanceof Api.Username && username.active,
      )
      .map((username) => username.username),
  ]
    .filter((username): username is string => !!username)
    .map((username) => username.toLowerCase());
}

function peerIdString(peer: Api.TypePeer): string | undefined {
  if (peer instanceof Api.PeerUser) return peer.userId.toString();
  if (peer instanceof Api.PeerChat) return peer.chatId.toString();
  if (peer instanceof Api.PeerChannel) return peer.channelId.toString();
  return undefined;
}

function parsePeerInput(input: string, kindHint?: PeerKind): PeerInput {
  const trimmed = input.trim();
  const bare = trimmed.replace(/^@/, "");

  if (["me", "self", "this"].includes(bare.toLowerCase())) {
    return { kind: "self" };
  }

  if (/^-100\d+$/.test(bare)) {
    return { kind: "id", value: bare.slice(4), hint: "channel" };
  }
  if (/^-\d+$/.test(bare)) {
    return { kind: "id", value: bare.slice(1), hint: "chat" };
  }
  if (/^\d+$/.test(bare)) {
    return { kind: "id", value: bare, hint: kindHint };
  }

  if (/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(bare)) {
    return { kind: "username", value: bare.toLowerCase() };
  }

  return { kind: "raw", value: trimmed };
}
