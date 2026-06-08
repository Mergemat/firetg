import type { CreateTelegramClient } from "../telegram";

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  question: (prompt: string) => Promise<string>;
};

export type CliContext = {
  env: Record<string, string | undefined>;
  io: CliIo;
  createTelegram?: CreateTelegramClient;
};
