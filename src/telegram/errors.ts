export class RateLimitedError extends Error {
  constructor(
    readonly blockedUntil: string,
    readonly remainingSeconds: number,
  ) {
    super(`Telegram username resolves are blocked until ${blockedUntil}`);
    this.name = "RateLimitedError";
  }
}

export function parseFloodWaitSeconds(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match =
    message.match(/FLOOD_WAIT_(\d+)/i) ??
    message.match(/wait of (\d+) seconds/i) ??
    message.match(/(\d+) seconds is required/i);
  if (!match?.[1]) return undefined;

  const seconds = Number(match[1]);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

const PEER_INVALID_ERRORS = [
  "PEER_ID_INVALID",
  "CHANNEL_INVALID",
  "CHAT_ID_INVALID",
  "USER_ID_INVALID",
  "CHANNEL_PRIVATE",
];

export function isPeerInvalidError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return PEER_INVALID_ERRORS.some((code) => error.message.includes(code));
}
