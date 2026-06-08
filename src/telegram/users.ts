import { Api, type TelegramClient } from "teleproto";

export function normalizeUser(user: string): string {
  return user.trim().replace(/^@/, "");
}

export function isUserId(user: string): boolean {
  return /^\d+$/.test(user);
}

export async function getKnownUserEntityById(
  client: TelegramClient,
  userId: string,
): Promise<Api.User> {
  try {
    const entity = await client.getEntity(userId);
    if (entity instanceof Api.User) return entity;
  } catch {
    // Numeric IDs resolve directly only when Teleproto already knows the entity.
  }

  const currentAccount = await client.getMe();
  if (currentAccount.id?.toString() === userId) return currentAccount;

  const dialog = (await client.getDialogs({})).find(
    (candidate) =>
      candidate.entity instanceof Api.User &&
      candidate.entity.id?.toString() === userId,
  );

  if (dialog?.entity instanceof Api.User) return dialog.entity;

  throw new Error(
    `User id ${userId} is not known to this session. Open a dialog first or use a username.`,
  );
}
