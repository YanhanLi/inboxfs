import { createHash } from "node:crypto";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { explainClassification, extensionOf } from "./classifier.js";
import { readInboxConfig } from "./config.js";
import { availableDestination } from "./path-safety.js";
import type { FileSuggestion, ScanResult } from "./model.js";
import { hashFile } from "./file-hash.js";

function suggestionId(sourcePath: string, modifiedMs: number, size: number, destinationPath: string): string {
  return createHash("sha256").update(`${sourcePath}\0${modifiedMs}\0${size}\0${destinationPath}`).digest("hex").slice(0, 16);
}

export async function scanInbox(root: string): Promise<ScanResult> {
  const canonicalRoot = await realpath(root);
  const config = await readInboxConfig(canonicalRoot);
  const entries = await readdir(canonicalRoot, { withFileTypes: true });
  const occupied = new Set(entries.map((entry) => path.join(canonicalRoot, entry.name)));
  const suggestions: FileSuggestion[] = [];
  const candidatesBySize = new Map<number, string[]>();
  const hashCache = new Map<string, Promise<string>>();
  const cachedHash = (filename: string) => {
    const existing = hashCache.get(filename);
    if (existing) return existing;
    const digest = hashFile(filename);
    hashCache.set(filename, digest);
    return digest;
  };

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const directory = path.join(canonicalRoot, entry.name);
    for (const child of await readdir(directory, { withFileTypes: true })) {
      const childPath = path.join(directory, child.name);
      occupied.add(childPath);
      if (!child.isFile() || child.isSymbolicLink()) continue;
      const metadata = await stat(childPath);
      const candidates = candidatesBySize.get(metadata.size) ?? [];
      candidates.push(childPath);
      candidatesBySize.set(metadata.size, candidates);
    }
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    const sourcePath = path.join(canonicalRoot, entry.name);
    const metadata = await stat(sourcePath);
    const { category, classification } = explainClassification(entry.name, config.rules);
    const candidate = path.join(canonicalRoot, category, entry.name);
    const destinationPath = availableDestination(candidate, occupied);
    occupied.add(destinationPath);
    let duplicateOf: string | undefined;
    let duplicateHash: string | undefined;
    const sameSize = candidatesBySize.get(metadata.size) ?? [];
    if (sameSize.length) {
      duplicateHash = await cachedHash(sourcePath);
      for (const existing of sameSize) {
        if (await cachedHash(existing) === duplicateHash) {
          duplicateOf = existing;
          break;
        }
      }
    }
    suggestions.push({
      id: suggestionId(sourcePath, metadata.mtimeMs, metadata.size, destinationPath),
      name: entry.name,
      extension: extensionOf(entry.name),
      category,
      size: metadata.size,
      modifiedAt: metadata.mtime.toISOString(),
      sourcePath,
      destinationPath,
      classification,
      selected: !duplicateOf,
      duplicateOf,
      duplicateHash
    });
    sameSize.push(sourcePath);
    candidatesBySize.set(metadata.size, sameSize);
  }

  return {
    root: canonicalRoot,
    scannedAt: new Date().toISOString(),
    suggestions,
    categoryCounts: suggestions.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, {}),
    totalSize: suggestions.reduce((sum, item) => sum + item.size, 0),
    ruleConfig: { customRuleCount: config.rules.length, source: config.source }
  };
}
