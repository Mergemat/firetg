import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ApiCredentials = {
  apiId: number;
  apiHash: string;
};

export type StorePaths = {
  directory: string;
  config: string;
  resolver: string;
  session: string;
};

export type FileLookup<T> =
  | { value: T; source: "file"; path: string }
  | { value?: undefined; source: "missing"; path: string };

export function resolveStorePaths(
  env: Record<string, string | undefined>,
): StorePaths {
  const configRoot = env.XDG_CONFIG_HOME ?? join(env.HOME ?? ".", ".config");
  const directory = join(configRoot, "firetg");

  return {
    directory,
    config: join(directory, "config.json"),
    resolver: join(directory, "resolver.json"),
    session: join(directory, "session"),
  };
}

export async function readApiCredentials(
  env: Record<string, string | undefined>,
): Promise<FileLookup<ApiCredentials>> {
  const path = resolveStorePaths(env).config;

  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      apiId?: unknown;
      apiHash?: unknown;
    };

    if (typeof parsed.apiId !== "number" || typeof parsed.apiHash !== "string") {
      return { source: "missing", path };
    }

    return {
      source: "file",
      path,
      value: { apiId: parsed.apiId, apiHash: parsed.apiHash },
    };
  } catch (error) {
    if (isMissingFile(error)) {
      return { source: "missing", path };
    }
    throw error;
  }
}

export async function writeApiCredentials(
  env: Record<string, string | undefined>,
  credentials: ApiCredentials,
): Promise<string> {
  const paths = resolveStorePaths(env);

  await ensureStoreDirectory(paths.directory);
  await writeFile(
    paths.config,
    `${JSON.stringify(credentials, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(paths.config, 0o600);

  return paths.config;
}

export async function readSession(
  env: Record<string, string | undefined>,
): Promise<FileLookup<string>> {
  const path = resolveStorePaths(env).session;

  try {
    const session = (await readFile(path, "utf8")).trim();
    return session
      ? { source: "file", path, value: session }
      : { source: "missing", path };
  } catch (error) {
    if (isMissingFile(error)) {
      return { source: "missing", path };
    }
    throw error;
  }
}

export async function writeSession(
  env: Record<string, string | undefined>,
  session: string,
): Promise<string> {
  const paths = resolveStorePaths(env);

  await ensureStoreDirectory(paths.directory);
  await writeFile(paths.session, `${session}\n`, { mode: 0o600 });
  await chmod(paths.session, 0o600);

  return paths.session;
}

export async function deleteSession(
  env: Record<string, string | undefined>,
): Promise<string> {
  const path = resolveStorePaths(env).session;

  await rm(path, { force: true });
  return path;
}

async function ensureStoreDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
