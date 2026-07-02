import { Api, type TelegramClient } from "teleproto";
import type { Account, Profile } from "./types";
import { withPeer, type PeerResolver } from "./peers";

export async function getCurrentAccount(
  client: TelegramClient,
): Promise<Account> {
  return serializeAccount(await client.getMe());
}

export async function getPublicProfile(
  client: TelegramClient,
  resolver: PeerResolver,
  user: string,
): Promise<Profile> {
  return withPeer(
    resolver,
    user,
    async (peer) => {
      const inputUser = toInputUser(peer);
      if (!inputUser) {
        throw new Error(`${user} does not resolve to a user profile`);
      }

      const full = await client.invoke(
        new Api.users.GetFullUser({ id: inputUser }),
      );
      const entity = full.users.find(
        (candidate): candidate is Api.User =>
          candidate instanceof Api.User &&
          candidate.id.toString() === full.fullUser.id.toString(),
      );

      if (!entity) {
        throw new Error(`${user} does not resolve to a user profile`);
      }

      return serializeProfile(entity, full.fullUser);
    },
    { kind: "user" },
  );
}

function toInputUser(peer: unknown): Api.TypeInputUser | undefined {
  if (peer === "me") return new Api.InputUserSelf();
  if (peer instanceof Api.InputPeerUser) {
    return new Api.InputUser({
      userId: peer.userId,
      accessHash: peer.accessHash,
    });
  }

  return undefined;
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
