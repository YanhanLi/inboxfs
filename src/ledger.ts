import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { MoveRecord } from "./model.js";

export function defaultLedgerPath(root: string): string {
  const key = createHash("sha256").update(root).digest("hex").slice(0, 24);
  const label = path.basename(root).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 32) || "inbox";
  return path.join(os.homedir(), ".inboxfs", `${label}-${key}.json`);
}

export function legacyLedgerPath(root: string): string {
  const key = Buffer.from(root).toString("base64url").slice(0, 48);
  return path.join(os.homedir(), ".inboxfs", `${key}.json`);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function recordsForRoot(root: string, records: MoveRecord[]): MoveRecord[] {
  return records.filter((record) => isInside(root, record.sourcePath) && isInside(root, record.destinationPath));
}

export async function resolveLedgerPath(root: string): Promise<string> {
  const current = defaultLedgerPath(root);
  try {
    await readFile(current, "utf8");
    return current;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const legacy = legacyLedgerPath(root);
  try {
    const records = recordsForRoot(root, await readLedger(legacy));
    if (records.length) await writeLedger(current, records);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return current;
}

export async function readLedger(ledgerPath: string): Promise<MoveRecord[]> {
  try {
    return JSON.parse(await readFile(ledgerPath, "utf8")) as MoveRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function writeLedger(ledgerPath: string, records: MoveRecord[]): Promise<void> {
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  const temporary = `${ledgerPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, ledgerPath);
}
