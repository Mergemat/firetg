import { ConfigError, type LocalStore } from "./localStore";

export type TelegramConfig = {
  apiId: number;
  apiHash: string;
  storagePath: string;
  legacySession?: string;
  legacySessionPath?: string;
  legacyPeersPath?: string;
};

export async function loadTelegramConfig(
  store: LocalStore,
  options: { requireAuth?: boolean } = {},
): Promise<TelegramConfig> {
  const credentials = await store.readCredentials();
  if (!credentials) {
    throw new ConfigError(
      `Missing config file at ${store.paths.config}`,
      store.paths.config,
    );
  }

  const legacySession = await store.readLegacySession();
  if (
    (options.requireAuth ?? true) &&
    !(await store.hasTelegramStorage()) &&
    !legacySession
  ) {
    throw new ConfigError(
      `Missing Telegram login at ${store.paths.telegram}; run firetg auth login`,
      store.paths.telegram,
    );
  }

  return {
    ...credentials,
    storagePath: store.paths.telegram,
    ...(legacySession
      ? {
          legacySession,
          legacySessionPath: store.paths.legacySession,
          legacyPeersPath: store.paths.legacyPeers,
        }
      : {}),
  };
}
