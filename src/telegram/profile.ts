import type { FullUser, TelegramClient, User } from "@mtcute/bun";
import type { Account, Profile } from "./types";
import { normalizePeerInput } from "./peers";

export async function getCurrentAccount(
  client: TelegramClient,
): Promise<Account> {
  return serializeAccount(await client.getMe());
}

export async function getPublicProfile(
  client: TelegramClient,
  user: string,
): Promise<Profile> {
  return serializeProfile(
    await client.getFullUser(normalizePeerInput(user, "user")),
  );
}

export function serializeAccount(user: User): Account {
  return {
    id: String(user.id),
    firstName: user.firstName,
    ...(user.username ? { username: user.username } : {}),
    ...(user.lastName ? { lastName: user.lastName } : {}),
    ...(user.phoneNumber ? { phone: user.phoneNumber } : {}),
  };
}

function serializeProfile(user: FullUser): Profile {
  return {
    ...serializeAccount(user),
    ...(user.bio ? { about: user.bio } : {}),
    bot: user.isBot,
    verified: user.isVerified,
    premium: user.isPremium,
    restricted: user.isRestricted,
    scam: user.isScam,
    fake: user.isFake,
  };
}
