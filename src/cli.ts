#!/usr/bin/env node
import { realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import open from "open";
import { createDemoInbox } from "./demo.js";
import { createApp } from "./server.js";

export interface CliOptions {
  demo: boolean;
  help: boolean;
  noOpen: boolean;
  directory?: string;
}

export function parseCliArgs(args: string[]): CliOptions {
  let demo = false;
  let help = false;
  let noOpen = false;
  let directory: string | undefined;
  for (const arg of args) {
    if (arg === "--demo") demo = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--no-open") noOpen = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (directory) throw new Error("Provide only one inbox directory.");
    else directory = arg;
  }
  if (demo && directory) throw new Error("Do not provide an inbox directory with --demo.");
  return { demo, help, noOpen, directory };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: inboxfs [directory] [--no-open]\n       inboxfs --demo [--no-open]\n\n--demo opens an isolated sample inbox and removes it when InboxFS stops.");
    return;
  }
  const demo = options.demo ? await createDemoInbox() : undefined;
  const requested = path.resolve(options.directory ?? path.join(process.env.HOME ?? process.cwd(), "Downloads"));
  const root = demo?.root ?? await realpath(requested);
  if (!demo && !(await stat(root)).isDirectory()) throw new Error(`Not a directory: ${root}`);
  const server = createApp(root, undefined, { demo: options.demo }).listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return;
    const url = `http://127.0.0.1:${address.port}`;
    console.log(options.demo ? `InboxFS demo is ready in ${root}` : `InboxFS is organizing ${root}`);
    console.log(url);
    if (!options.noOpen) void open(url);
  });
  if (demo) {
    const shutdown = () => {
      server.close();
      server.closeAllConnections();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    server.once("close", () => {
      process.removeListener("SIGINT", shutdown);
      process.removeListener("SIGTERM", shutdown);
      void demo.cleanup();
    });
    server.once("error", () => void demo.cleanup());
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`InboxFS: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
