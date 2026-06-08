import { createTelegramConfig } from "../../config";
import {
  deleteSession,
  readApiCredentials,
  writeApiCredentials,
  writeSession,
  type ApiCredentials,
} from "../../localStore";
import { createTeleprotoClient, type FireTgClient } from "../../telegram";
import { renderQr } from "../qr";
import { errorMessage, writeError, writeJson } from "../output";
import type { CliContext } from "../types";
import type { CommandSpec } from "./types";

export const authLoginCommand: CommandSpec = {
  id: "auth.login",
  usage: "auth login [--phone]",
  matches: (parsed) =>
    parsed.command === "auth" && parsed.subcommand === "login",
  run: ({ parsed, context }) => runAuthLogin(parsed.flags, context),
};

export const authLogoutCommand: CommandSpec = {
  id: "auth.logout",
  usage: "auth logout",
  matches: (parsed) =>
    parsed.command === "auth" && parsed.subcommand === "logout",
  run: ({ context }) => runAuthLogout(context),
};

async function runAuthLogin(
  flags: Map<string, string>,
  context: CliContext,
): Promise<number> {
  let configPath: string;
  let credentials: ApiCredentials;
  let shouldWriteCredentials: boolean;

  try {
    ({ credentials, configPath, shouldWriteCredentials } =
      await readOrPromptCredentials(context));
  } catch (error) {
    writeError(context, "INPUT_ERROR", errorMessage(error));
    return 1;
  }

  let telegram: FireTgClient | undefined;

  try {
    telegram = await (context.createTelegram ?? createTeleprotoClient)(
      createTelegramConfig(credentials),
    );

    const { session } = flags.has("phone")
      ? await loginWithPhone(telegram, context)
      : await loginWithQr(telegram, context);
    if (shouldWriteCredentials) {
      await writeApiCredentials(context.env, credentials);
    }
    const sessionPath = await writeSession(context.env, session);

    writeJson(context, true, {
      data: { configPath, sessionPath },
    });
    return 0;
  } catch (error) {
    writeError(context, "TELEGRAM_ERROR", errorMessage(error));
    return 2;
  } finally {
    await telegram?.disconnect?.();
  }
}

async function runAuthLogout(context: CliContext): Promise<number> {
  try {
    const sessionPath = await deleteSession(context.env);

    writeJson(context, true, {
      data: { sessionPath },
    });
    return 0;
  } catch (error) {
    writeError(context, "CONFIG_ERROR", errorMessage(error));
    return 1;
  }
}

async function readOrPromptCredentials(
  context: CliContext,
): Promise<{
  credentials: ApiCredentials;
  configPath: string;
  shouldWriteCredentials: boolean;
}> {
  const existing = await readApiCredentials(context.env);
  if (existing.source === "file") {
    return {
      credentials: existing.value,
      configPath: existing.path,
      shouldWriteCredentials: false,
    };
  }

  const apiIdText = await context.io.question("API ID: ");
  const apiHash = await context.io.question("API hash: ");
  const apiId = Number(apiIdText);

  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error("Invalid API credentials");
  }

  const credentials = { apiId, apiHash };
  return {
    credentials,
    configPath: existing.path,
    shouldWriteCredentials: true,
  };
}

async function loginWithPhone(telegram: FireTgClient, context: CliContext) {
  return telegram.login({
    mode: "phone",
    phoneNumber: normalizePhoneNumber(await context.io.question("Phone: ")),
    phoneCode: (isCodeViaApp) =>
      context.io.question(
        isCodeViaApp ? "Code from Telegram app: " : "Code from SMS: ",
      ),
    password: (hint) =>
      context.io.question(
        hint ? `2FA password (${hint}): ` : "2FA password: ",
      ),
  });
}

function loginWithQr(telegram: FireTgClient, context: CliContext) {
  return telegram.login({
    mode: "qr",
    qrCode: async ({ token, expires }) => {
      const url = `tg://login?token=${token.toString("base64url")}`;
      context.io.stderr(
        `Scan this QR code in Telegram. Expires at ${new Date(
          expires * 1000,
        ).toISOString()}.\n${renderQr(url)}\n${url}\n`,
      );
    },
    password: (hint) =>
      context.io.question(
        hint ? `2FA password (${hint}): ` : "2FA password: ",
      ),
  });
}

function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `+${trimmed}`;
  return trimmed;
}
