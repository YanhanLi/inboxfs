import { createHash } from "node:crypto";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { classify, extensionOf } from "./classifier.js";
import { availableDestination } from "./path-safety.js";
import type { FileSuggestion, ScanResult } from "./model.js";

function suggestionId(sourcePath: string, modifiedMs: number, size: number): string {
  return createHash("sha256").update(`${sourcePath}\0${modifiedMs}\0${size}`).digest("hex").slice(0, 16);
}

export async function scanInbox(root: string): Promise<ScanResult> {
  const canonicalRoot = await realpath(root);
  const entries = await readdir(canonicalRoot, { withFileTypes: true });
  const occupied = new Set(entries.map((entry) => path.join(canonicalRoot, entry.name)));
  const suggestions: FileSuggestion[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const directory = path.join(canonicalRoot, entry.name);
    for (const child of await readdir(directory, { withFileTypes: true })) {
      occupied.add(path.join(directory, child.name));
    }
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    const sourcePath = path.join(canonicalRoot, entry.name);
    const metadata = await stat(sourcePath);
    const category = classify(entry.name);
    const candidate = path.join(canonicalRoot, category, entry.name);
    const destinationPath = availableDestination(candidate, occupied);
    occupied.add(destinationPath);
    suggestions.push({
      id: suggestionId(sourcePath, metadata.mtimeMs, metadata.size),
      name: entry.name,
      extension: extensionOf(entry.name),
      category,
      size: metadata.size,
      modifiedAt: metadata.mtime.toISOString(),
      sourcePath,
      destinationPath,
      selected: true
    });
  }

  return {
    root: canonicalRoot,
    scannedAt: new Date().toISOString(),
    suggestions,
    categoryCounts: suggestions.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, {}),
    totalSize: suggestions.reduce((sum, item) => sum + item.size, 0)
  };
}
