import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type ApiCredentials = {
  apiId: number;
  apiHash: string;
};

export type AppPaths = {
  directory: string;
  config: string;
  telegram: string;
  legacySession: string;
  legacyPeers: string;
};

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

export class LocalStore {
  readonly paths: AppPaths;

  constructor(configHome = join(homedir(), ".config")) {
    const directory = join(configHome, "firetg");
    this.paths = {
      directory,
      config: join(directory, "config.json"),
      telegram: join(directory, "telegram.sqlite"),
      legacySession: join(directory, "session"),
      legacyPeers: join(directory, "peers.json"),
    };
  }

  async readCredentials(): Promise<ApiCredentials | undefined> {
    let contents: string;
    try {
      contents = await readFile(this.paths.config, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw new ConfigError(
        `Could not read config file at ${this.paths.config}: ${errorMessage(error)}`,
        this.paths.config,
      );
    }

    let value: unknown;
    try {
      value = JSON.parse(contents);
    } catch {
      throw new ConfigError(
        `Invalid JSON in config file at ${this.paths.config}`,
        this.paths.config,
      );
    }

    if (!isApiCredentials(value)) {
      throw new ConfigError(
        `Invalid Telegram credentials in config file at ${this.paths.config}`,
        this.paths.config,
      );
    }

    return value;
  }

  async writeCredentials(credentials: ApiCredentials): Promise<void> {
    if (!isApiCredentials(credentials)) {
      throw new ConfigError("Invalid Telegram API credentials", this.paths.config);
    }

    await this.ensureDirectory();
    const temporary = `${this.paths.config}.${process.pid}.tmp`;

    try {
      await writeFile(temporary, `${JSON.stringify(credentials, null, 2)}\n`, {
        mode: 0o600,
      });
      await rename(temporary, this.paths.config);
      await chmod(this.paths.config, 0o600);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async hasTelegramStorage(): Promise<boolean> {
    try {
      return (await stat(this.paths.telegram)).isFile();
    } catch (error) {
      if (isMissingFile(error)) return false;
      throw new ConfigError(
        `Could not inspect Telegram storage at ${this.paths.telegram}: ${errorMessage(error)}`,
        this.paths.telegram,
      );
    }
  }

  async readLegacySession(): Promise<string | undefined> {
    try {
      const session = (await readFile(this.paths.legacySession, "utf8")).trim();
      return session || undefined;
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw new ConfigError(
        `Could not read legacy session at ${this.paths.legacySession}: ${errorMessage(error)}`,
        this.paths.legacySession,
      );
    }
  }

  async removeLegacyState(): Promise<void> {
    await Promise.all([
      rm(this.paths.legacySession, { force: true }),
      rm(this.paths.legacyPeers, { force: true }),
    ]);
  }

  async removeTelegramStorage(): Promise<void> {
    await Promise.all(
      ["", "-shm", "-wal"].map((suffix) =>
        rm(`${this.paths.telegram}${suffix}`, { force: true }),
      ),
    );
  }

  async secureTelegramStorage(): Promise<void> {
    await this.ensureDirectory();
    await secureSqliteFiles(this.paths.telegram);
  }

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.paths.directory, { recursive: true, mode: 0o700 });
    await chmod(this.paths.directory, 0o700);
  }
}

export async function secureSqliteFiles(path: string): Promise<void> {
  await Promise.all(
    ["", "-shm", "-wal"].map(async (suffix) => {
      try {
        await chmod(`${path}${suffix}`, 0o600);
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    }),
  );
}

function isApiCredentials(value: unknown): value is ApiCredentials {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(candidate.apiId) &&
    (candidate.apiId as number) > 0 &&
    typeof candidate.apiHash === "string" &&
    candidate.apiHash.trim().length > 0
  );
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
