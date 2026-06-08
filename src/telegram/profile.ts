import { Api, type TelegramClient } from "teleproto";
import type { Account } from "./types";

export async function getCurrentAccount(
  client: TelegramClient,
): Promise<Account> {
  return serializeUser(await client.getMe());
}

function serializeUser(user: Api.User): Account {
  return {
    id: user.id?.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
  };
}
