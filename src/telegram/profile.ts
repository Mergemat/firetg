import { Api, type TelegramClient } from "teleproto";
import type { Account, Profile } from "./types";

export async function getCurrentAccount(
  client: TelegramClient,
): Promise<Account> {
  return serializeAccount(await client.getMe());
}

export async function getPublicProfile(
  client: TelegramClient,
  username: string,
): Promise<Profile> {
  const entity = await client.getEntity(normalizeUsername(username));

  if (!(entity instanceof Api.User)) {
    throw new Error(`Username ${username} does not resolve to a user profile`);
  }

  const full = await client.invoke(
    new Api.users.GetFullUser({ id: entity }),
  );

  return serializeProfile(entity, full.fullUser);
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, "");
}

function serializeAccount(user: Api.User): Account {
  return {
    id: user.id?.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
  };
}

function serializeProfile(user: Api.User, full?: Api.TypeUserFull): Profile {
  return {
    ...serializeAccount(user),
    about: full instanceof Api.UserFull ? full.about : undefined,
    bot: user.bot,
    verified: user.verified,
    premium: user.premium,
    restricted: user.restricted,
    scam: user.scam,
    fake: user.fake,
  };
}
