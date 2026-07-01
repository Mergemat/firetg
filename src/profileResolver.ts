import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveStorePaths } from "./localStore";
import type { Profile } from "./telegram/types";

export type ProfileResolveStatus = "pending" | "resolved" | "failed";

export type ProfileResolveQueueItem = {
  username: string;
  status: ProfileResolveStatus;
  queuedAt: string;
  attempts: number;
  lastAttemptAt?: string;
  resolvedAt?: string;
  failedAt?: string;
  error?: string;
  profile?: Profile;
};

export type ProfileResolveState = {
  version: 1;
  blockedUntil?: string;
  queue: ProfileResolveQueueItem[];
};

export type ProfileResolveBlock = {
  blockedUntil: string;
  remainingSeconds: number;
};

export function emptyProfileResolveState(): ProfileResolveState {
  return {
    version: 1,
    queue: [],
  };
}

export async function readProfileResolveState(
  env: Record<string, string | undefined>,
): Promise<ProfileResolveState> {
  const path = resolveStorePaths(env).resolver;

  try {
    return normalizeProfileResolveState(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isMissingFile(error)) return emptyProfileResolveState();
    throw error;
  }
}

export async function writeProfileResolveState(
  env: Record<string, string | undefined>,
  state: ProfileResolveState,
): Promise<string> {
  const paths = resolveStorePaths(env);

  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  await chmod(paths.directory, 0o700);
  await writeFile(
    paths.resolver,
    `${JSON.stringify(normalizeProfileResolveState(state), null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(paths.resolver, 0o600);

  return paths.resolver;
}

export function normalizeProfileUsername(username: string): string {
  return username.trim().replace(/^@/, "");
}

export function readProfileUsernameList(value?: string): string[] {
  const seen = new Set<string>();
  const usernames: string[] = [];

  for (const entry of (value ?? "").split(",")) {
    const username = normalizeProfileUsername(entry);
    const key = profileUsernameKey(username);
    if (!username || seen.has(key)) continue;

    seen.add(key);
    usernames.push(username);
  }

  return usernames;
}

export function enqueueProfileUsernames(
  state: ProfileResolveState,
  usernames: string[],
  now: Date,
): { enqueued: string[]; skipped: string[] } {
  const enqueued: string[] = [];
  const skipped: string[] = [];

  for (const username of usernames) {
    const existing = findQueueItem(state, username);

    if (existing?.status === "pending" || existing?.status === "resolved") {
      skipped.push(username);
      continue;
    }

    if (existing?.status === "failed") {
      existing.status = "pending";
      existing.queuedAt = now.toISOString();
      delete existing.failedAt;
      delete existing.error;
      enqueued.push(username);
      continue;
    }

    state.queue.push({
      username,
      status: "pending",
      queuedAt: now.toISOString(),
      attempts: 0,
    });
    enqueued.push(username);
  }

  return { enqueued, skipped };
}

export function activeProfileResolveBlock(
  state: ProfileResolveState,
  now: Date,
): ProfileResolveBlock | undefined {
  const blockedUntil = state.blockedUntil;
  if (!blockedUntil) return undefined;

  const blockedUntilMs = Date.parse(blockedUntil);
  if (!Number.isFinite(blockedUntilMs) || blockedUntilMs <= now.getTime()) {
    delete state.blockedUntil;
    return undefined;
  }

  return {
    blockedUntil,
    remainingSeconds: Math.ceil((blockedUntilMs - now.getTime()) / 1000),
  };
}

export function recordProfileResolveFlood(
  state: ProfileResolveState,
  waitSeconds: number,
  now: Date,
): ProfileResolveBlock {
  const blockedUntil = new Date(
    now.getTime() + Math.max(0, waitSeconds) * 1000,
  ).toISOString();

  state.blockedUntil = blockedUntil;
  return {
    blockedUntil,
    remainingSeconds: Math.max(0, waitSeconds),
  };
}

export function parseFloodWaitSeconds(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match =
    message.match(/FLOOD_WAIT_(\d+)/i) ??
    message.match(/wait of (\d+) seconds/i) ??
    message.match(/(\d+) seconds is required/i);
  if (!match?.[1]) return undefined;

  const seconds = Number(match[1]);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

export function markProfileResolveAttempt(
  item: ProfileResolveQueueItem,
  now: Date,
) {
  item.attempts += 1;
  item.lastAttemptAt = now.toISOString();
}

export function markProfileResolveSuccess(
  item: ProfileResolveQueueItem,
  profile: Profile,
  now: Date,
) {
  item.status = "resolved";
  item.resolvedAt = now.toISOString();
  item.profile = profile;
  delete item.failedAt;
  delete item.error;
}

export function markProfileResolveFailure(
  item: ProfileResolveQueueItem,
  error: string,
  now: Date,
) {
  item.status = "failed";
  item.failedAt = now.toISOString();
  item.error = error;
}

export function pendingProfileResolveItems(
  state: ProfileResolveState,
  limit: number,
): ProfileResolveQueueItem[] {
  return state.queue
    .filter((item) => item.status === "pending")
    .slice(0, limit);
}

export function profileResolveSummary(
  state: ProfileResolveState,
  now: Date,
): {
  blocked: boolean;
  blockedUntil?: string;
  remainingSeconds?: number;
  pending: number;
  resolved: number;
  failed: number;
  queue: ProfileResolveQueueItem[];
} {
  const block = activeProfileResolveBlock(state, now);

  return {
    blocked: Boolean(block),
    blockedUntil: block?.blockedUntil,
    remainingSeconds: block?.remainingSeconds,
    pending: countQueueItems(state, "pending"),
    resolved: countQueueItems(state, "resolved"),
    failed: countQueueItems(state, "failed"),
    queue: state.queue,
  };
}

function normalizeProfileResolveState(value: unknown): ProfileResolveState {
  if (!isRecord(value)) return emptyProfileResolveState();

  const state = emptyProfileResolveState();
  if (
    typeof value.blockedUntil === "string" &&
    Number.isFinite(Date.parse(value.blockedUntil))
  ) {
    state.blockedUntil = value.blockedUntil;
  }

  if (Array.isArray(value.queue)) {
    state.queue = value.queue.flatMap((item) => {
      const normalized = normalizeQueueItem(item);
      return normalized ? [normalized] : [];
    });
  }

  return state;
}

function normalizeQueueItem(value: unknown): ProfileResolveQueueItem | undefined {
  if (!isRecord(value) || typeof value.username !== "string") {
    return undefined;
  }

  const username = normalizeProfileUsername(value.username);
  if (!username) return undefined;

  const status = normalizeStatus(value.status);
  const queuedAt =
    typeof value.queuedAt === "string" &&
    Number.isFinite(Date.parse(value.queuedAt))
      ? value.queuedAt
      : new Date(0).toISOString();
  const attempts =
    typeof value.attempts === "number" &&
    Number.isInteger(value.attempts) &&
    value.attempts >= 0
      ? value.attempts
      : 0;
  const item: ProfileResolveQueueItem = {
    username,
    status,
    queuedAt,
    attempts,
  };

  copyOptionalDate(value, item, "lastAttemptAt");
  copyOptionalDate(value, item, "resolvedAt");
  copyOptionalDate(value, item, "failedAt");
  if (typeof value.error === "string") item.error = value.error;
  if (isRecord(value.profile)) item.profile = value.profile as Profile;

  return item;
}

function copyOptionalDate(
  source: Record<string, unknown>,
  target: ProfileResolveQueueItem,
  key: "lastAttemptAt" | "resolvedAt" | "failedAt",
) {
  const value = source[key];
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    target[key] = value;
  }
}

function normalizeStatus(value: unknown): ProfileResolveStatus {
  return value === "resolved" || value === "failed" ? value : "pending";
}

function findQueueItem(
  state: ProfileResolveState,
  username: string,
): ProfileResolveQueueItem | undefined {
  const key = profileUsernameKey(username);
  return state.queue.find((item) => profileUsernameKey(item.username) === key);
}

function profileUsernameKey(username: string): string {
  return normalizeProfileUsername(username).toLowerCase();
}

function countQueueItems(
  state: ProfileResolveState,
  status: ProfileResolveStatus,
): number {
  return state.queue.filter((item) => item.status === status).length;
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
