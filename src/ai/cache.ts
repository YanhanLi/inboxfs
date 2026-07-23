import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AiClassification, AiFileContext } from "./types.js";

const CACHE_VERSION = 1;
const PROMPT_VERSION = 1;
const MAX_ENTRIES = 500;
const MAX_CACHE_BYTES = 512 * 1024;

interface CacheEntry extends AiClassification { updatedAt: string }
interface CacheDocument { version: 1; entries: Record<string, CacheEntry> }

function emptyCache(): CacheDocument { return { version: CACHE_VERSION, entries: {} }; }

export function aiCacheKey(root: string, model: string, destinations: string[], context: AiFileContext): string {
  return createHash("sha256").update(JSON.stringify({
    promptVersion: PROMPT_VERSION,
    root: createHash("sha256").update(root).digest("hex"),
    model,
    destinations,
    file: { name: context.name, extension: context.extension, size: context.size, modifiedAt: context.modifiedAt, text: context.text },
  })).digest("hex");
}

export class AiCache {
  private document?: CacheDocument;

  constructor(private readonly cachePath: string) {}

  async get(key: string): Promise<AiClassification | undefined> {
    const entry = (await this.read()).entries[key];
    return entry ? { destination: entry.destination, confidence: entry.confidence, explanation: entry.explanation } : undefined;
  }

  async set(key: string, value: AiClassification): Promise<void> {
    const document = await this.read();
    document.entries[key] = { ...value, updatedAt: new Date().toISOString() };
    const ordered = Object.entries(document.entries).sort(([, first], [, second]) => second.updatedAt.localeCompare(first.updatedAt)).slice(0, MAX_ENTRIES);
    document.entries = Object.fromEntries(ordered);
    await this.write(document);
  }

  private async read(): Promise<CacheDocument> {
    if (this.document) return this.document;
    try {
      const metadata = await lstat(this.cachePath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("AI cache must be a regular file.");
      if (metadata.size > MAX_CACHE_BYTES) throw new Error("AI cache is too large.");
      const parsed = JSON.parse(await readFile(this.cachePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || (parsed as { version?: unknown }).version !== CACHE_VERSION || !(parsed as { entries?: unknown }).entries || typeof (parsed as { entries?: unknown }).entries !== "object" || Array.isArray((parsed as { entries?: unknown }).entries)) {
        throw new Error("AI cache contains an unsupported document.");
      }
      this.document = parsed as CacheDocument;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.document = emptyCache();
    }
    return this.document;
  }

  private async write(document: CacheDocument): Promise<void> {
    await mkdir(path.dirname(this.cachePath), { recursive: true, mode: 0o700 });
    const parent = await realpath(path.dirname(this.cachePath));
    const target = path.join(parent, path.basename(this.cachePath));
    try {
      const metadata = await lstat(target);
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("AI cache must be a regular file.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporary = path.join(parent, `.ai-cache.${process.pid}.${randomUUID()}.tmp`);
    try {
      const contents = `${JSON.stringify(document)}\n`;
      if (Buffer.byteLength(contents) > MAX_CACHE_BYTES) throw new Error("AI cache is too large.");
      await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}
