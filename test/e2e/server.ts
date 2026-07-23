import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/server.js";

const stateRoot = await mkdtemp(path.join(os.tmpdir(), "inboxfs-e2e-state-"));
const inboxRoot = path.join(stateRoot, "inbox");
await mkdir(inboxRoot);
process.env.HOME = stateRoot;

await Promise.all([
  writeFile(path.join(inboxRoot, "chapter.epub"), "chapter"),
  writeFile(path.join(inboxRoot, "notes.txt"), "notes"),
  writeFile(path.join(inboxRoot, ".inboxfs.json"), `${JSON.stringify({ version: 1, rules: [{ name: "Reading", destination: "Reading", extensions: ["epub", "mobi"] }] }, null, 2)}\n`),
]);

const server = createApp(inboxRoot).listen(4179, "127.0.0.1");
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(stateRoot, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void close().finally(() => process.exit(0)));
}
