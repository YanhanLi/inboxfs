import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/server.js";
import type { AiProvider } from "../../src/ai/types.js";

const stateRoot = await mkdtemp(path.join(os.tmpdir(), "inboxfs-e2e-state-"));
const inboxRoot = path.join(stateRoot, "inbox");
await mkdir(inboxRoot);
process.env.HOME = stateRoot;

await Promise.all([
  writeFile(path.join(inboxRoot, "chapter.epub"), "chapter"),
  writeFile(path.join(inboxRoot, "notes.txt"), "notes"),
  writeFile(path.join(inboxRoot, "project-plan.unknown"), "local project plan"),
  writeFile(path.join(inboxRoot, ".inboxfs.json"), `${JSON.stringify({ version: 1, rules: [{ name: "Reading", destination: "Reading", extensions: ["epub", "mobi"] }] }, null, 2)}\n`),
]);

const aiProvider: AiProvider = {
  listModels: async () => [{ name: "fixture-model:1b", size: 1_500_000_000, digest: "fixture-model-digest" }],
  classify: async (input, destinations, _model, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({
      destination: destinations.includes("Projects") ? "Projects" : destinations[0],
      confidence: 0.92,
      explanation: `${input.name} contains project planning material.`,
    }), 250);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Analysis cancelled.")); }, { once: true });
  }),
};

const server = createApp(inboxRoot, undefined, {
  aiProvider,
  aiSettingsPath: path.join(stateRoot, "ai-settings.json"),
  aiCachePath: path.join(stateRoot, "ai-cache.json"),
}).listen(4179, "127.0.0.1");
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
