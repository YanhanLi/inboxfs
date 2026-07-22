import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, realpath, rename, stat } from "node:fs/promises";
import path from "node:path";
import { defaultLedgerPath, readLedger, writeLedger } from "./ledger.js";
import { assertInsideRoot } from "./path-safety.js";
import { scanInbox } from "./scanner.js";
import type { MoveRecord } from "./model.js";

export async function hashFile(filename: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

export async function organizeFiles(root: string, suggestionIds: string[], ledgerPath = defaultLedgerPath(root)): Promise<MoveRecord[]> {
  const canonicalRoot = await realpath(root);
  const scan = await scanInbox(canonicalRoot);
  const requested = new Set(suggestionIds);
  const selected = scan.suggestions.filter((item) => requested.has(item.id));
  if (selected.length !== requested.size) throw new Error("One or more files changed since the preview. Refresh and try again.");

  const records = await readLedger(ledgerPath);
  const created: MoveRecord[] = [];
  for (const item of selected) {
    assertInsideRoot(canonicalRoot, item.sourcePath);
    assertInsideRoot(canonicalRoot, item.destinationPath);
    const sourceMetadata = await lstat(item.sourcePath);
    if (!sourceMetadata.isFile() || sourceMetadata.isSymbolicLink()) throw new Error("Only regular files can be organized.");
    await mkdir(path.dirname(item.destinationPath), { recursive: true });
    assertInsideRoot(canonicalRoot, await realpath(path.dirname(item.destinationPath)));
    const contentHash = await hashFile(item.sourcePath);
    await rename(item.sourcePath, item.destinationPath);
    const record: MoveRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      sourcePath: item.sourcePath,
      destinationPath: item.destinationPath,
      contentHash
    };
    records.push(record);
    created.push(record);
  }
  await writeLedger(ledgerPath, records);
  return created;
}

export async function undoMove(root: string, recordId: string, ledgerPath = defaultLedgerPath(root)): Promise<MoveRecord> {
  const canonicalRoot = await realpath(root);
  const records = await readLedger(ledgerPath);
  const record = records.find((item) => item.id === recordId);
  if (!record || record.undoneAt) throw new Error("Move record is missing or has already been undone.");
  assertInsideRoot(canonicalRoot, record.sourcePath);
  assertInsideRoot(canonicalRoot, record.destinationPath);

  const currentHash = await hashFile(record.destinationPath).catch(() => undefined);
  if (currentHash !== record.contentHash) throw new Error("The organized file changed after it was moved. Undo was stopped.");
  try {
    await stat(record.sourcePath);
    throw new Error("The original location is occupied. Undo was stopped.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rename(record.destinationPath, record.sourcePath);
  record.undoneAt = new Date().toISOString();
  await writeLedger(ledgerPath, records);
  return record;
}
