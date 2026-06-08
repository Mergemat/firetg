import { describe, expect, test } from "bun:test";
import bigInt from "big-integer";
import { Api } from "teleproto";
import {
  type FilterableDialogSummary,
  listDialogSummaries,
  type DialogSummary,
  type DialogSource,
} from "../src/telegram/dialogs";

const title = new Api.TextWithEntities({ text: "Managers", entities: [] });

function inputUser(id: number): Api.InputPeerUser {
  return new Api.InputPeerUser({
    userId: bigInt(id),
    accessHash: bigInt(id * 10),
  });
}

describe("telegram dialog listing", () => {
  test("explicit custom folders fetch only their peers", async () => {
    const first = inputUser(1);
    const second = inputUser(2);
    const peerFetches: Api.TypeInputPeer[][] = [];

    const source: DialogSource = {
      getDialogFilters: async () => [
        new Api.DialogFilter({
          id: 78,
          title,
          pinnedPeers: [],
          includePeers: [first, second],
          excludePeers: [],
        }),
      ],
      getDialogSummaries: async () => {
        throw new Error("standard folders should not be used");
      },
      getFilterableDialogSummaries: async () => {
        throw new Error("explicit folders should not scan every dialog");
      },
      getPeerDialogSummaries: async (peers) => {
        peerFetches.push(peers);
        return peers.map<DialogSummary>((peer, index) => ({
          id: `user-${index + 1}`,
          title: `User ${index + 1}`,
          isUser: peer instanceof Api.InputPeerUser,
        }));
      },
    };

    await expect(
      listDialogSummaries(source, { folder: 78, limit: 1000 }),
    ).resolves.toEqual([
      { id: "user-1", title: "User 1", isUser: true },
      { id: "user-2", title: "User 2", isUser: true },
    ]);
    expect(peerFetches).toEqual([[first, second]]);
  });

  test("category custom folders scan filterable dialogs", async () => {
    const source: DialogSource = {
      getDialogFilters: async () => [
        new Api.DialogFilter({
          id: 12,
          title,
          groups: true,
          pinnedPeers: [],
          includePeers: [],
          excludePeers: [],
        }),
      ],
      getDialogSummaries: async () => {
        throw new Error("standard folders should not be used");
      },
      getFilterableDialogSummaries: async () => [
        {
          id: "1",
          title: "General",
          isGroup: true,
          inputPeer: new Api.InputPeerChat({ chatId: bigInt(1) }),
        } satisfies FilterableDialogSummary,
        {
          id: "2",
          title: "Alice",
          isUser: true,
          inputPeer: inputUser(2),
        } satisfies FilterableDialogSummary,
      ],
      getPeerDialogSummaries: async () => {
        throw new Error("category folders cannot be fetched peer-only");
      },
    };

    await expect(
      listDialogSummaries(source, { folder: 12, limit: 10 }),
    ).resolves.toEqual([
      {
        id: "1",
        title: "General",
        isGroup: true,
      },
    ]);
  });

  test("explicit custom folders surface peer fetch failures", async () => {
    const first = inputUser(1);

    const source: DialogSource = {
      getDialogFilters: async () => [
        new Api.DialogFilter({
          id: 78,
          title,
          pinnedPeers: [],
          includePeers: [first],
          excludePeers: [],
        }),
      ],
      getDialogSummaries: async () => {
        throw new Error("standard folders should not be used");
      },
      getFilterableDialogSummaries: async () => [
        {
          id: "1",
          title: "Recovered",
          inputPeer: first,
        } satisfies FilterableDialogSummary,
      ],
      getPeerDialogSummaries: async () => {
        throw new Error("peer fetch failed");
      },
    };

    await expect(
      listDialogSummaries(source, { folder: 78, limit: 10 }),
    ).rejects.toThrow("peer fetch failed");
  });
});
