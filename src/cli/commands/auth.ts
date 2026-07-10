import { loadTelegramConfig } from "../../config";
import type { ApiCredentials } from "../../localStore";
import { createMtcuteClient, type FireTgClient } from "../../telegram";
import { renderQr } from "../qr";
import { errorMessage, writeInputError, writeSuccess } from "../output";
import { writeTelegramError } from "./shared";
import type { CliContext } from "../types";
import type { CommandSpec } from "./types";

export const authLoginCommand: CommandSpec = {
  id: "auth.login",
  usage: "auth login [--phone]",
  help: {
    summary: "Log in and store Telegram credentials/session",
    description:
      "Starts Telegram authorization. QR login is used by default; phone-code login is available with --phone.",
    options: [
      {
        name: "--phone",
        summary: "Use phone-code login instead of QR login",
      },
    ],
    examples: [
      { command: "firetg auth login", summary: "Log in with QR code" },
      {
        command: "firetg auth login --phone",
        summary: "Log in with phone code",
      },
    ],
  },
  matches: (parsed) =>
    parsed.command === "auth" && parsed.subcommand === "login",
  run: ({ parsed, context }) => runAuthLogin(parsed.flags, context),
};

export const authLogoutCommand: CommandSpec = {
  id: "auth.logout",
  usage: "auth logout",
  help: {
    summary: "Revoke and remove the stored Telegram session",
    description:
      "Logs out the stored Telegram session when possible, then deletes the local session database.",
    examples: [
      {
        command: "firetg auth logout",
        summary: "Remove the stored Telegram session",
      },
    ],
  },
  matches: (parsed) =>
    parsed.command === "auth" && parsed.subcommand === "logout",
  run: ({ context }) => runAuthLogout(context),
};

async function runAuthLogin(
  flags: Map<string, string>,
  context: CliContext,
): Promise<number> {
  let telegram: FireTgClient | undefined;

  try {
    const credentials = await readOrPromptCredentials(context);
    await context.store.writeCredentials(credentials);
    let config = await loadTelegramConfig(context.store, {
      requireAuth: false,
    });
    try {
      telegram = await (context.createTelegram ?? createMtcuteClient)(config);
    } catch (error) {
      if (!config.legacySession || context.createTelegram) throw error;

      await context.store.removeLegacyState();
      await context.store.removeTelegramStorage();
      config = await loadTelegramConfig(context.store, { requireAuth: false });
      telegram = await createMtcuteClient(config);
    }

    if (flags.has("phone")) {
      await loginWithPhone(telegram, context);
    } else {
      await loginWithQr(telegram, context);
    }
    await context.store.secureTelegramStorage();

    writeSuccess(context, {
      data: { loggedIn: true },
    });
    return 0;
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      writeInputError(context, authLoginCommand, errorMessage(error));
      return 1;
    }
    return writeTelegramError(context, error, "auth");
  } finally {
    await telegram?.disconnect().catch(() => undefined);
  }
}

async function runAuthLogout(context: CliContext): Promise<number> {
  let telegram: FireTgClient | undefined;

  try {
    const config = await loadTelegramConfig(context.store, {
      requireAuth: false,
    });
    if ((await context.store.hasTelegramStorage()) || config.legacySession) {
      telegram = await (context.createTelegram ?? createMtcuteClient)(config);
      await telegram.logout();
      await telegram.disconnect();
      telegram = undefined;
    }

    await context.store.removeTelegramStorage();
    await context.store.removeLegacyState();
    writeSuccess(context, {
      data: { loggedOut: true },
    });
    return 0;
  } catch (error) {
    return writeTelegramError(context, error, "auth");
  } finally {
    await telegram?.disconnect().catch(() => undefined);
  }
}

async function readOrPromptCredentials(
  context: CliContext,
): Promise<ApiCredentials> {
  const existing = await context.store.readCredentials();
  if (existing) return existing;

  const apiIdText = await context.io.question("API ID: ");
  const apiHash = (await context.io.question("API hash: ")).trim();
  const apiId = Number(apiIdText);

  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new InvalidCredentialsError("Invalid API credentials");
  }

  return { apiId, apiHash };
}

class InvalidCredentialsError extends Error {}

async function loginWithPhone(telegram: FireTgClient, context: CliContext) {
  return telegram.login({
    mode: "phone",
    phoneNumber: normalizePhoneNumber(await context.io.question("Phone: ")),
    phoneCode: (isCodeViaApp) =>
      context.io.question(
        isCodeViaApp ? "Code from Telegram app: " : "Code from SMS: ",
      ),
    password: () => context.io.question("2FA password: "),
  });
}

async function loginWithQr(telegram: FireTgClient, context: CliContext) {
  let previousQrLineCount = 0;

  return telegram.login({
    mode: "qr",
    qrCode: ({ url, expires }) => {
      const qrPrompt = `Scan this QR code in Telegram. Expires at ${expires.toISOString()}.\n${renderQr(url)}\n${url}\n`;
      const clearPreviousQr =
        previousQrLineCount > 0 ? `\x1b[${previousQrLineCount}A\x1b[0J` : "";

      context.io.stderr(`${clearPreviousQr}${qrPrompt}`);
      previousQrLineCount = countTerminalLines(qrPrompt);
    },
    password: () => context.io.question("2FA password: "),
  });
}

function countTerminalLines(text: string): number {
  const newlineCount = text.match(/\n/g)?.length ?? 0;
  return text.endsWith("\n") ? newlineCount : newlineCount + 1;
}

function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return trimmed;
  if (/^\d+$/.test(trimmed)) return `+${trimmed}`;
  return trimmed;
}
