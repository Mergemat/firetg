import { readTelegramConfig } from "./config";
import {
  activeProfileResolveBlock,
  enqueueProfileUsernames,
  markProfileResolveAttempt,
  markProfileResolveFailure,
  markProfileResolveSuccess,
  parseFloodWaitSeconds,
  pendingProfileResolveItems,
  profileResolveSummary,
  readProfileResolveState,
  readProfileUsernameList,
  recordProfileResolveFlood,
  recordProfileResolveSuccess,
  writeProfileResolveState,
  type ProfileResolveBlock,
  type ProfileResolveQueueItem,
  type ProfileResolveState,
} from "./profileResolver";
import {
  createTeleprotoClient,
  type Account,
  type CreateTelegramClient,
  type FireTgClient,
  type Profile,
} from "./telegram";

export type ProfileRuntime = {
  env: Record<string, string | undefined>;
  createTelegram?: CreateTelegramClient;
  now?: () => Date;
};

export type ProfileLookup =
  | { kind: "username"; value: string }
  | { kind: "id"; value: string };

export type ProfileOperationError =
  | {
      code: "CONFIG_ERROR";
      message: string;
      exitCode: 1;
    }
  | {
      code: "RATE_LIMITED";
      message: string;
      exitCode: 2;
      blockedUntil: string;
      remainingSeconds: number;
    }
  | {
      code: "TELEGRAM_ERROR";
      message: string;
      exitCode: 2;
    };

export type ProfileOperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ProfileOperationError };

export type ProfileStatus = {
  blocked: boolean;
  blockedUntil?: string;
  remainingSeconds?: number;
  pending: number;
  resolved: number;
  failed: number;
  queue: ProfileResolveQueueItem[];
};

export type ProfileResolveResult = ProfileStatus & {
  enqueued?: string[];
  skipped?: string[];
  processed: { username: string; profile: Profile }[];
  errors: { username: string; error: string }[];
};

export function profileLookupFromInput(
  value: string,
  kind?: ProfileLookup["kind"],
): ProfileLookup {
  const lookup = value.trim();

  if (kind) return { kind, value: normalizeLookupValue(lookup, kind) };
  return isNumericId(lookup)
    ? { kind: "id", value: lookup }
    : { kind: "username", value: normalizeLookupValue(lookup, "username") };
}

export function parseProfileUsernames(value?: string): string[] {
  return readProfileUsernameList(value);
}

export async function getOwnProfile(
  runtime: ProfileRuntime,
): Promise<ProfileOperationResult<Account>> {
  return withTelegram(runtime, async (telegram) => telegram.getMe());
}

export async function getPublicProfile(
  runtime: ProfileRuntime,
  lookup: ProfileLookup,
): Promise<ProfileOperationResult<Profile>> {
  if (lookup.kind === "id") {
    return withTelegram(runtime, async (telegram) =>
      telegram.getProfile(lookup.value),
    );
  }

  const block = await blockUsernameResolveIfNeeded(runtime);
  if (block) return rateLimited(block);

  const result = await withTelegram(runtime, async (telegram) =>
    telegram.getProfile(lookup.value),
  );
  if (!result.ok) {
    if (result.error.code !== "TELEGRAM_ERROR") return result;

    const waitSeconds = parseFloodWaitSeconds(result.error.message);
    if (waitSeconds === undefined) return result;

    const state = await readProfileResolveState(runtime.env);
    const block = recordProfileResolveFlood(
      state,
      waitSeconds,
      runtimeNow(runtime),
    );
    await writeProfileResolveState(runtime.env, state);
    return rateLimited(block);
  }

  const state = await readProfileResolveState(runtime.env);
  recordProfileResolveSuccess(
    state,
    lookup.value,
    result.data,
    runtimeNow(runtime),
  );
  await writeProfileResolveState(runtime.env, state);

  return result;
}

export async function queueProfiles(
  runtime: ProfileRuntime,
  usernames: string[],
): Promise<ProfileStatus & { enqueued: string[]; skipped: string[] }> {
  const state = await readProfileResolveState(runtime.env);
  const now = runtimeNow(runtime);
  const queueResult = enqueueProfileUsernames(state, usernames, now);

  await writeProfileResolveState(runtime.env, state);

  return {
    ...profileResolveSummary(state, now),
    ...queueResult,
  };
}

export async function resolveProfiles(
  runtime: ProfileRuntime,
  input: {
    usernames: string[];
    limit: number;
  },
): Promise<ProfileOperationResult<ProfileResolveResult>> {
  const state = await readProfileResolveState(runtime.env);
  const now = runtimeNow(runtime);
  const queueResult = input.usernames.length
    ? enqueueProfileUsernames(state, input.usernames, now)
    : undefined;
  const block = activeProfileResolveBlock(state, now);

  if (block) {
    if (queueResult) await writeProfileResolveState(runtime.env, state);
    return {
      ok: true,
      data: resolveResult(state, now, queueResult),
    };
  }

  await writeProfileResolveState(runtime.env, state);

  const pending = pendingProfileResolveItems(state, input.limit);
  if (pending.length === 0) {
    return {
      ok: true,
      data: resolveResult(state, now, queueResult),
    };
  }

  return withTelegram(runtime, async (telegram) =>
    resolvePendingProfiles(runtime, telegram, state, pending, queueResult),
  );
}

export async function getProfileStatus(
  runtime: ProfileRuntime,
  options: { clearFlood?: boolean } = {},
): Promise<ProfileStatus> {
  const state = await readProfileResolveState(runtime.env);

  if (options.clearFlood) {
    delete state.blockedUntil;
  }

  const now = runtimeNow(runtime);
  activeProfileResolveBlock(state, now);
  await writeProfileResolveState(runtime.env, state);

  return profileResolveSummary(state, now);
}

async function resolvePendingProfiles(
  runtime: ProfileRuntime,
  telegram: FireTgClient,
  state: ProfileResolveState,
  pending: ProfileResolveQueueItem[],
  queueResult?: { enqueued: string[]; skipped: string[] },
): Promise<ProfileResolveResult> {
  const processed: { username: string; profile: Profile }[] = [];
  const errors: { username: string; error: string }[] = [];

  for (const item of pending) {
    markProfileResolveAttempt(item, runtimeNow(runtime));

    try {
      const profile = await telegram.getProfile(item.username);
      markProfileResolveSuccess(item, profile, runtimeNow(runtime));
      processed.push({ username: item.username, profile });
      await writeProfileResolveState(runtime.env, state);
    } catch (error) {
      const waitSeconds = parseFloodWaitSeconds(error);
      if (waitSeconds !== undefined) {
        const floodBlock = recordProfileResolveFlood(
          state,
          waitSeconds,
          runtimeNow(runtime),
        );
        item.error = errorMessage(error);
        await writeProfileResolveState(runtime.env, state);

        return {
          ...resolveResult(state, runtimeNow(runtime), queueResult),
          blocked: true,
          blockedUntil: floodBlock.blockedUntil,
          remainingSeconds: floodBlock.remainingSeconds,
          processed,
          errors,
        };
      }

      const message = errorMessage(error);
      markProfileResolveFailure(item, message, runtimeNow(runtime));
      errors.push({ username: item.username, error: message });
      await writeProfileResolveState(runtime.env, state);
    }
  }

  return {
    ...resolveResult(state, runtimeNow(runtime), queueResult),
    processed,
    errors,
  };
}

async function blockUsernameResolveIfNeeded(
  runtime: ProfileRuntime,
): Promise<ProfileResolveBlock | undefined> {
  const state = await readProfileResolveState(runtime.env);
  const previousBlockedUntil = state.blockedUntil;
  const block = activeProfileResolveBlock(state, runtimeNow(runtime));

  if (previousBlockedUntil && !state.blockedUntil) {
    await writeProfileResolveState(runtime.env, state);
  }

  return block;
}

async function withTelegram<T>(
  runtime: ProfileRuntime,
  handler: (telegram: FireTgClient) => Promise<T>,
): Promise<ProfileOperationResult<T>> {
  const configResult = await readTelegramConfig(runtime.env);

  if (!configResult.config) {
    return {
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message: `Missing ${configResult.missing.join(", ")}`,
        exitCode: 1,
      },
    };
  }

  let telegram: FireTgClient | undefined;

  try {
    telegram = await (runtime.createTelegram ?? createTeleprotoClient)(
      configResult.config,
    );
    return { ok: true, data: await handler(telegram) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "TELEGRAM_ERROR",
        message: errorMessage(error),
        exitCode: 2,
      },
    };
  } finally {
    await telegram?.disconnect?.();
  }
}

function resolveResult(
  state: ProfileResolveState,
  now: Date,
  queueResult?: { enqueued: string[]; skipped: string[] },
): ProfileResolveResult {
  return {
    ...profileResolveSummary(state, now),
    ...(queueResult
      ? {
          enqueued: queueResult.enqueued,
          skipped: queueResult.skipped,
        }
      : {}),
    processed: [],
    errors: [],
  };
}

function rateLimited<T>(
  block: ProfileResolveBlock,
): ProfileOperationResult<T> {
  return {
    ok: false,
    error: {
      code: "RATE_LIMITED",
      message: `Telegram username resolves are blocked until ${block.blockedUntil}`,
      exitCode: 2,
      blockedUntil: block.blockedUntil,
      remainingSeconds: block.remainingSeconds,
    },
  };
}

function runtimeNow(runtime: ProfileRuntime): Date {
  return runtime.now?.() ?? new Date();
}

function normalizeLookupValue(
  value: string,
  kind: ProfileLookup["kind"],
): string {
  return kind === "username" ? value.replace(/^@/, "") : value;
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
