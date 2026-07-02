import {
  readApiCredentials,
  readSession,
  resolveStorePaths,
  type ApiCredentials,
} from "./localStore";

export type TelegramConfig = {
  apiId: number;
  apiHash: string;
  session?: string;
  sessionPath?: string;
  peersPath?: string;
};

export async function readTelegramConfig(
  env: Record<string, string | undefined>,
  options: { requireSession?: boolean } = {},
): Promise<{
  config?: TelegramConfig;
  missing: string[];
}> {
  const credentialsLookup = await readApiCredentials(env);
  if (credentialsLookup.source === "missing") {
    return { missing: [`config file at ${credentialsLookup.path}`] };
  }

  const sessionLookup = await readSession(env);
  if ((options.requireSession ?? true) && sessionLookup.source === "missing") {
    return { missing: [`session file at ${sessionLookup.path}`] };
  }

  return {
    missing: [],
    config: {
      apiId: credentialsLookup.value.apiId,
      apiHash: credentialsLookup.value.apiHash,
      session: sessionLookup.value,
      sessionPath:
        sessionLookup.source === "file" ? sessionLookup.path : undefined,
      peersPath: resolveStorePaths(env).peers,
    },
  };
}

export function createTelegramConfig(
  credentials: ApiCredentials,
  session?: string,
): TelegramConfig {
  return {
    apiId: credentials.apiId,
    apiHash: credentials.apiHash,
    session,
  };
}
