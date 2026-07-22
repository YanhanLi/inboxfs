#!/usr/bin/env node
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import open from "open";
import { createApp } from "./server.js";

async function main(): Promise<void> {
  const requested = path.resolve(process.argv[2] ?? path.join(process.env.HOME ?? process.cwd(), "Downloads"));
  const root = await realpath(requested);
  if (!(await stat(root)).isDirectory()) throw new Error(`Not a directory: ${root}`);
  const server = createApp(root).listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return;
    const url = `http://127.0.0.1:${address.port}`;
    console.log(`InboxFS is organizing ${root}`);
    console.log(url);
    if (!process.argv.includes("--no-open")) void open(url);
  });
}

main().catch((error) => {
  console.error(`InboxFS: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
