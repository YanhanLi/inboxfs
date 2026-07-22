import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MoveRecord } from "./model.js";

export function defaultLedgerPath(root: string): string {
  const key = Buffer.from(root).toString("base64url").slice(0, 48);
  return path.join(os.homedir(), ".inboxfs", `${key}.json`);
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
