import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type PeerKind = "user" | "chat" | "channel";

export type CachedPeer = {
  kind: PeerKind;
  id: string;
  accessHash?: string;
  usernames: string[];
  title?: string;
  cachedAt: string;
};

export type PeerCache = {
  version: 1;
  resolveBlockedUntil?: string;
  peers: CachedPeer[];
};

export type ResolveBlock = {
  blockedUntil: string;
  remainingSeconds: number;
};

export function emptyPeerCache(): PeerCache {
  return { version: 1, peers: [] };
}

export async function readPeerCache(path: string): Promise<PeerCache> {
  try {
    return normalizePeerCache(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isMissingFile(error)) return emptyPeerCache();
    if (error instanceof SyntaxError) return emptyPeerCache();
    throw error;
  }
}

export async function writePeerCache(
  path: string,
  cache: PeerCache,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export function findPeerByUsername(
  cache: PeerCache,
  username: string,
): CachedPeer | undefined {
  const key = username.toLowerCase();
  return cache.peers.find((peer) => peer.usernames.includes(key));
}

export function findPeerById(
  cache: PeerCache,
  id: string,
  kind?: PeerKind,
): CachedPeer | undefined {
  if (kind) {
    const exact = cache.peers.find(
      (peer) => peer.id === id && peer.kind === kind,
    );
    if (exact) return exact;
  }

  return cache.peers.find((peer) => peer.id === id);
}

export function upsertPeer(cache: PeerCache, peer: CachedPeer): void {
  // A username can move between peers; keep the cache single-owner.
  for (const existing of cache.peers) {
    if (existing.kind === peer.kind && existing.id === peer.id) continue;
    existing.usernames = existing.usernames.filter(
      (username) => !peer.usernames.includes(username),
    );
  }

  const index = cache.peers.findIndex(
    (existing) => existing.kind === peer.kind && existing.id === peer.id,
  );

  if (index === -1) {
    cache.peers.push(peer);
    return;
  }

  cache.peers[index] = peer;
}

export function activeResolveBlock(
  cache: PeerCache,
  now: Date,
): ResolveBlock | undefined {
  if (!cache.resolveBlockedUntil) return undefined;

  const blockedUntilMs = Date.parse(cache.resolveBlockedUntil);
  if (!Number.isFinite(blockedUntilMs) || blockedUntilMs <= now.getTime()) {
    delete cache.resolveBlockedUntil;
    return undefined;
  }

  return {
    blockedUntil: cache.resolveBlockedUntil,
    remainingSeconds: Math.ceil((blockedUntilMs - now.getTime()) / 1000),
  };
}

export function recordResolveFlood(
  cache: PeerCache,
  waitSeconds: number,
  now: Date,
): ResolveBlock {
  const seconds = Math.max(0, waitSeconds);
  const blockedUntil = new Date(now.getTime() + seconds * 1000).toISOString();

  cache.resolveBlockedUntil = blockedUntil;
  return { blockedUntil, remainingSeconds: seconds };
}

function normalizePeerCache(value: unknown): PeerCache {
  if (!isRecord(value)) return emptyPeerCache();

  const cache = emptyPeerCache();

  if (
    typeof value.resolveBlockedUntil === "string" &&
    Number.isFinite(Date.parse(value.resolveBlockedUntil))
  ) {
    cache.resolveBlockedUntil = value.resolveBlockedUntil;
  }

  if (Array.isArray(value.peers)) {
    cache.peers = value.peers.flatMap((peer) => {
      const normalized = normalizeCachedPeer(peer);
      return normalized ? [normalized] : [];
    });
  }

  return cache;
}

function normalizeCachedPeer(value: unknown): CachedPeer | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value.kind !== "user" &&
    value.kind !== "chat" &&
    value.kind !== "channel"
  ) {
    return undefined;
  }
  if (typeof value.id !== "string" || !/^\d+$/.test(value.id)) {
    return undefined;
  }

  const peer: CachedPeer = {
    kind: value.kind,
    id: value.id,
    usernames: Array.isArray(value.usernames)
      ? value.usernames
          .filter((username): username is string => typeof username === "string")
          .map((username) => username.toLowerCase())
      : [],
    cachedAt:
      typeof value.cachedAt === "string" &&
      Number.isFinite(Date.parse(value.cachedAt))
        ? value.cachedAt
        : new Date(0).toISOString(),
  };

  if (typeof value.accessHash === "string") peer.accessHash = value.accessHash;
  if (typeof value.title === "string") peer.title = value.title;

  return peer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
