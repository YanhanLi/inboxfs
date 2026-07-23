import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const demoFiles: ReadonlyArray<readonly [string, string]> = [
  ["app.ts", "export const ready = true;\n"],
  ["meeting-notes.txt", "Project Atlas kickoff notes\n"],
  ["mystery.xyzzy", "Unmatched demo file\n"],
  ["project-brief.pdf", "InboxFS demo document\n"],
  ["quarterly-budget.xlsx", "InboxFS demo spreadsheet\n"],
  ["reference.zip", "InboxFS demo archive\n"],
  ["vacation-photo.jpg", "InboxFS demo image\n"],
];

export interface DemoInbox {
  root: string;
  cleanup: () => Promise<void>;
}

export async function createDemoInbox(): Promise<DemoInbox> {
  const root = await mkdtemp(path.join(os.tmpdir(), "inboxfs-demo-"));
  await Promise.all(demoFiles.map(([name, content]) => writeFile(path.join(root, name), content, { flag: "wx", mode: 0o600 })));
  let removed = false;
  return {
    root,
    cleanup: async () => {
      if (removed) return;
      removed = true;
      await rm(root, { recursive: true, force: true });
    },
  };
}
