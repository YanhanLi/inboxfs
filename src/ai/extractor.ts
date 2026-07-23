import type { Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import type { FileSuggestion } from "../model.js";
import { assertInsideRoot } from "../path-safety.js";
import type { AiFileContext } from "./types.js";
import { extractDocumentText, MAX_DOCUMENT_BYTES, MAX_EXTRACTED_BYTES } from "./document-extractor.js";

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "xml", "yaml", "yml", "sql", "js", "ts", "tsx", "jsx", "py", "java", "go", "rs", "html", "css", "sh"]);
const DOCUMENT_EXTENSIONS = new Set(["pdf", "docx"]);

function matches(metadata: Stats, item: FileSuggestion): boolean {
  return metadata.isFile() && metadata.size === item.size && metadata.mtime.toISOString() === item.modifiedAt;
}

export async function extractFileContext(root: string, item: FileSuggestion, includeText: boolean, signal?: AbortSignal): Promise<AiFileContext> {
  const canonicalRoot = await realpath(root);
  const metadata = await lstat(item.sourcePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== item.size || metadata.mtime.toISOString() !== item.modifiedAt) throw new Error("The file changed since the inbox preview.");
  const canonicalSource = await realpath(item.sourcePath);
  assertInsideRoot(canonicalRoot, canonicalSource);
  const context: AiFileContext = { name: item.name, extension: item.extension, size: item.size, modifiedAt: item.modifiedAt, textBytes: 0 };
  if (!includeText || (!TEXT_EXTENSIONS.has(item.extension) && !DOCUMENT_EXTENSIONS.has(item.extension))) return context;
  if (DOCUMENT_EXTENSIONS.has(item.extension) && metadata.size > MAX_DOCUMENT_BYTES) return context;

  const handle = await open(canonicalSource, "r");
  try {
    const opened = await handle.stat();
    if (!matches(opened, item) || opened.dev !== metadata.dev || opened.ino !== metadata.ino) throw new Error("The file changed since the inbox preview.");
    const length = DOCUMENT_EXTENSIONS.has(item.extension) ? metadata.size : Math.min(MAX_EXTRACTED_BYTES, metadata.size);
    const buffer = Buffer.alloc(length);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      if (signal?.aborted) throw signal.reason;
      const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (!result.bytesRead) break;
      bytesRead += result.bytesRead;
    }
    const contents = buffer.subarray(0, bytesRead);
    if (!matches(await handle.stat(), item)) throw new Error("The file changed during local text extraction.");
    if (DOCUMENT_EXTENSIONS.has(item.extension)) {
      const text = await extractDocumentText(contents, item.extension as "pdf" | "docx", signal);
      if (!text) return context;
      context.text = text;
      context.textBytes = Buffer.byteLength(text, "utf8");
      context.textSource = item.extension as "pdf" | "docx";
      return context;
    }
    if (contents.includes(0)) return context;
    context.text = contents.toString("utf8").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
    context.textBytes = bytesRead;
    context.textSource = "plain-text";
    return context;
  } finally {
    await handle.close();
  }
}
