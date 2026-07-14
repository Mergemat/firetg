import { readFile, stat } from "node:fs/promises";
import { loadTelegramConfig } from "../../config";
import { ConfigError } from "../../localStore";
import { createMtcuteClient, type FireTgClient } from "../../telegram";
import { errorMessage, writeSuccess } from "../output";
import type { CliContext } from "../types";
import type { CommandSpec } from "./types";

type LocalState = {
  version: string;
  config: {
    path: string;
    state: "valid" | "missing" | "invalid";
    error?: string;
  };
  session: {
    path: string;
    state: "sqlite" | "legacy" | "missing" | "invalid";
    error?: string;
  };
};

type DoctorCheck = {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: string;
};

export const statusCommand: CommandSpec = {
  id: "status",
  usage: "status [--json]",
  help: {
    summary: "Show local configuration and session readiness",
    description:
      "Reports a fast, offline readiness snapshot without contacting Telegram or exposing credentials.",
    examples: [
      {
        command: "firetg status --json --pretty",
        summary: "Inspect local readiness as formatted JSON",
      },
    ],
  },
  matches: (parsed) => parsed.command === "status",
  async run({ context }) {
    const state = await inspectLocalState(context);
    writeSuccess(context, {
      data: {
        version: state.version,
        ready:
          state.config.state === "valid" &&
          (state.session.state === "sqlite" || state.session.state === "legacy"),
        config: state.config,
        session: state.session,
      },
    });
    return 0;
  },
};

export const doctorCommand: CommandSpec = {
  id: "doctor",
  usage: "doctor [--json]",
  help: {
    summary: "Diagnose local setup and Telegram connectivity",
    description:
      "Checks Bun, credentials, session storage, private file permissions, and a live Telegram identity request. Exits 1 when a required check fails.",
    examples: [
      {
        command: "firetg doctor --json --pretty --no-input --timeout 15",
        summary: "Run a bounded machine-readable health check",
      },
    ],
  },
  matches: (parsed) => parsed.command === "doctor",
  async run({ context }) {
    const local = await inspectLocalState(context);
    const checks: DoctorCheck[] = [
      {
        id: "runtime",
        status: process.versions.bun ? "pass" : "fail",
        message: process.versions.bun
          ? `Bun ${process.versions.bun}`
          : "firetg must run with Bun",
        ...(!process.versions.bun
          ? { fix: "Install Bun and run firetg with Bun" }
          : {}),
      },
      configCheck(local),
      sessionCheck(local),
    ];

    await appendPermissionCheck(
      checks,
      "config-permissions",
      local.config.path,
      local.config.state !== "missing",
    );
    await appendPermissionCheck(
      checks,
      "session-permissions",
      local.session.path,
      local.session.state === "sqlite" || local.session.state === "legacy",
    );

    const account = await appendTelegramCheck(checks, context, local);
    const ok = checks.every((check) => check.status !== "fail");
    writeSuccess(context, {
      data: {
        ok,
        version: local.version,
        checks,
        ...(account ? { account } : {}),
      },
    });
    return ok ? 0 : 1;
  },
};

async function inspectLocalState(context: CliContext): Promise<LocalState> {
  const version = await packageVersion();
  let config: LocalState["config"];
  try {
    config = (await context.store.readCredentials())
      ? { path: context.store.paths.config, state: "valid" }
      : { path: context.store.paths.config, state: "missing" };
  } catch (error) {
    config = {
      path: context.store.paths.config,
      state: "invalid",
      error: errorMessage(error),
    };
  }

  let session: LocalState["session"];
  try {
    const sqlite = await context.store.hasTelegramStorage();
    const legacy = sqlite ? false : await context.store.hasLegacySession();
    session = sqlite
      ? { path: context.store.paths.telegram, state: "sqlite" }
      : legacy
        ? { path: context.store.paths.legacySession, state: "legacy" }
        : { path: context.store.paths.telegram, state: "missing" };
  } catch (error) {
    session = {
      path: context.store.paths.telegram,
      state: "invalid",
      error: errorMessage(error),
    };
  }
  return {
    version,
    config,
    session,
  };
}

function configCheck(local: LocalState): DoctorCheck {
  if (local.config.state === "valid") {
    return {
      id: "config",
      status: "pass",
      message: `Valid credentials at ${local.config.path}`,
    };
  }
  return {
    id: "config",
    status: "fail",
    message:
      local.config.state === "missing"
        ? `Missing credentials at ${local.config.path}`
        : local.config.error ?? `Invalid credentials at ${local.config.path}`,
    fix: "Run firetg auth login in a trusted interactive terminal",
  };
}

function sessionCheck(local: LocalState): DoctorCheck {
  if (local.session.state === "sqlite" || local.session.state === "legacy") {
    return {
      id: "session",
      status: "pass",
      message: `${local.session.state === "sqlite" ? "Telegram storage" : "Legacy session"} found at ${local.session.path}`,
    };
  }
  return {
    id: "session",
    status: "fail",
    message:
      local.session.state === "invalid"
        ? local.session.error ?? `Could not inspect ${local.session.path}`
        : `Missing Telegram session at ${local.session.path}`,
    fix: "Run firetg auth login in a trusted interactive terminal",
  };
}

async function appendPermissionCheck(
  checks: DoctorCheck[],
  id: string,
  path: string,
  present: boolean,
): Promise<void> {
  if (!present) return;
  try {
    const mode = (await stat(path)).mode & 0o777;
    const privateFile = (mode & 0o077) === 0;
    checks.push({
      id,
      status: privateFile ? "pass" : "warn",
      message: `${path} has mode ${mode.toString(8).padStart(3, "0")}`,
      ...(!privateFile
        ? { fix: "Restrict this file to owner-only access (mode 0600)" }
        : {}),
    });
  } catch (error) {
    checks.push({
      id,
      status: "fail",
      message: `Could not inspect ${path}: ${errorMessage(error)}`,
    });
  }
}

async function appendTelegramCheck(
  checks: DoctorCheck[],
  context: CliContext,
  local: LocalState,
): Promise<{ id: string; username?: string; firstName: string } | undefined> {
  if (
    local.config.state !== "valid" ||
    (local.session.state !== "sqlite" && local.session.state !== "legacy")
  ) {
    checks.push({
      id: "telegram",
      status: "fail",
      message:
        "Telegram connectivity was not checked because local setup is incomplete",
      fix: "Run firetg auth login in a trusted interactive terminal",
    });
    return undefined;
  }

  let telegram: FireTgClient | undefined;
  const disconnect = () => {
    void telegram?.disconnect().catch(() => undefined);
  };
  context.signal?.addEventListener("abort", disconnect, { once: true });
  try {
    const config = await loadTelegramConfig(context.store);
    telegram = await (context.createTelegram ?? createMtcuteClient)(config);
    if (context.signal?.aborted) throw new Error("Command timed out");
    const account = await telegram.getMe();
    checks.push({
      id: "telegram",
      status: "pass",
      message: `Authenticated as ${account.username ? `@${account.username}` : account.firstName}`,
    });
    return {
      id: account.id,
      ...(account.username ? { username: account.username } : {}),
      firstName: account.firstName,
    };
  } catch (error) {
    checks.push({
      id: "telegram",
      status: "fail",
      message: `Telegram check failed: ${errorMessage(error)}`,
      fix:
        error instanceof ConfigError
          ? "Run firetg auth login in a trusted interactive terminal"
          : "Check connectivity, then run firetg doctor again",
    });
    return undefined;
  } finally {
    context.signal?.removeEventListener("abort", disconnect);
    await telegram?.disconnect().catch(() => undefined);
  }
}

async function packageVersion(): Promise<string> {
  try {
    const contents = await readFile(
      new URL("../../../package.json", import.meta.url),
      "utf8",
    );
    const value = JSON.parse(contents) as { version?: unknown };
    return typeof value.version === "string" ? value.version : "unknown";
  } catch {
    return "unknown";
  }
}
