import type { CreateTelegramClient } from "../telegram";
import type { LocalStore } from "../localStore";

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  question: (prompt: string) => Promise<string>;
  secret?: (prompt: string) => Promise<string>;
};

export type CliContext = {
  store: LocalStore;
  io: CliIo;
  createTelegram?: CreateTelegramClient;
  now?: () => Date;
};
