import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, stat } from "node:fs/promises";
import path from "node:path";
import { readLedger, resolveLedgerPath, writeLedger } from "./ledger.js";
import { assertInsideRoot } from "./path-safety.js";
import { scanInbox } from "./scanner.js";
import type { MoveRecord } from "./model.js";
import { hashFile } from "./file-hash.js";

interface OrganizerOperations {
  renameFile(source: string, destination: string): Promise<void>;
}

const defaultOperations: OrganizerOperations = { renameFile: rename };

export async function organizeFiles(
  root: string,
  suggestionIds: string[],
  ledgerPath?: string,
  operations: OrganizerOperations = defaultOperations
): Promise<MoveRecord[]> {
  const canonicalRoot = await realpath(root);
  const activeLedgerPath = ledgerPath ?? await resolveLedgerPath(canonicalRoot);
  const scan = await scanInbox(canonicalRoot);
  const requested = new Set(suggestionIds);
  const selected = scan.suggestions.filter((item) => requested.has(item.id));
  if (selected.length !== requested.size) throw new Error("One or more files changed since the preview. Refresh and try again.");

  const records = await readLedger(activeLedgerPath);
  const batchId = randomUUID();
  const prepared: MoveRecord[] = [];
  for (const item of selected) {
    assertInsideRoot(canonicalRoot, item.sourcePath);
    assertInsideRoot(canonicalRoot, item.destinationPath);
    const sourceMetadata = await lstat(item.sourcePath);
    if (!sourceMetadata.isFile() || sourceMetadata.isSymbolicLink()) throw new Error("Only regular files can be organized.");
    await mkdir(path.dirname(item.destinationPath), { recursive: true });
    assertInsideRoot(canonicalRoot, await realpath(path.dirname(item.destinationPath)));
    const contentHash = await hashFile(item.sourcePath);
    prepared.push({
      id: randomUUID(),
      batchId,
      createdAt: new Date().toISOString(),
      sourcePath: item.sourcePath,
      destinationPath: item.destinationPath,
      contentHash
    });
  }

  const moved: MoveRecord[] = [];
  try {
    for (const record of prepared) {
      await operations.renameFile(record.sourcePath, record.destinationPath);
      moved.push(record);
    }
    await writeLedger(activeLedgerPath, [...records, ...prepared]);
    return prepared;
  } catch (error) {
    const rollbackFailures: string[] = [];
    for (const record of moved.reverse()) {
      try {
        await operations.renameFile(record.destinationPath, record.sourcePath);
      } catch {
        rollbackFailures.push(record.destinationPath);
      }
    }
    if (rollbackFailures.length) {
      throw new Error(`Organization failed and rollback was incomplete: ${rollbackFailures.join(", ")}`, { cause: error });
    }
    throw error;
  }
}

export async function undoMove(root: string, recordId: string, ledgerPath?: string): Promise<MoveRecord> {
  const canonicalRoot = await realpath(root);
  const activeLedgerPath = ledgerPath ?? await resolveLedgerPath(canonicalRoot);
  const records = await readLedger(activeLedgerPath);
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
  await writeLedger(activeLedgerPath, records);
  return record;
}
