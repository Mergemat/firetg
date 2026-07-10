import { tl } from "@mtcute/bun";

export function floodWaitSeconds(error: unknown): number | undefined {
  return tl.RpcError.is(error, "FLOOD_WAIT_%d") ? error.seconds : undefined;
}
