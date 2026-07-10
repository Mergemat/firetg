import type { TelegramClient } from "@mtcute/bun";
import type { Account, LoginParams } from "./types";
import { serializeAccount } from "./profile";

export async function loginTelegramAccount(
  client: TelegramClient,
  params: LoginParams,
): Promise<Account> {
  if (params.mode === "qr") {
    return serializeAccount(
      await client.start({
        qrCodeHandler: (url, expires) => params.qrCode({ url, expires }),
        password: () => params.password(),
      }),
    );
  }

  let isCodeViaApp = false;
  return serializeAccount(
    await client.start({
      phone: params.phoneNumber,
      code: () => params.phoneCode(isCodeViaApp),
      password: () => params.password(),
      codeSentCallback: (sent) => {
        isCodeViaApp = sent.type === "app";
      },
    }),
  );
}
