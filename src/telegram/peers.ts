import type { InputPeerLike } from "@mtcute/bun";

export type PeerKind = "user" | "channel" | "any";

export function normalizePeerInput(
  input: string,
  kind: PeerKind = "any",
): InputPeerLike {
  const value = input.trim();
  const bare = value.replace(/^@/, "");

  if (["me", "self", "this"].includes(bare.toLowerCase())) return "self";

  if (/^-100\d+$/.test(bare) || /^-\d+$/.test(bare)) {
    return safePeerId(bare);
  }

  if (/^\d+$/.test(bare)) {
    return kind === "channel"
      ? safePeerId(`-100${bare}`)
      : safePeerId(bare);
  }

  return bare;
}

function safePeerId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`Telegram peer id is outside JavaScript's safe range: ${value}`);
  }
  return id;
}
