import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import type { TelegramConfig } from "../config";
import type { LoginParams } from "./types";

export async function loginTelegramAccount(
  client: TelegramClient,
  config: TelegramConfig,
  params: LoginParams,
): Promise<{ session: string }> {
  if (params.mode === "qr") {
    await client.connect();
    await client.signInUserWithQrCode(
      { apiId: config.apiId, apiHash: config.apiHash },
      {
        qrCode: params.qrCode,
        password: params.password,
        onError: (error) => {
          throw error;
        },
      },
    );
  } else {
    await client.start({
      phoneNumber: async () => params.phoneNumber,
      phoneCode: params.phoneCode,
      password: params.password,
      onError: (error) => {
        throw error;
      },
    });
  }

  return { session: (client.session as StringSession).save() };
}
