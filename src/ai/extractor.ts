import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import type { FileSuggestion } from "../model.js";
import { assertInsideRoot } from "../path-safety.js";
import type { AiFileContext } from "./types.js";

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "xml", "yaml", "yml", "sql", "js", "ts", "tsx", "jsx", "py", "java", "go", "rs", "html", "css", "sh"]);
const MAX_TEXT_BYTES = 32 * 1024;

export async function extractFileContext(root: string, item: FileSuggestion, includeText: boolean): Promise<AiFileContext> {
  const canonicalRoot = await realpath(root);
  assertInsideRoot(canonicalRoot, item.sourcePath);
  const metadata = await lstat(item.sourcePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== item.size || metadata.mtime.toISOString() !== item.modifiedAt) throw new Error("The file changed since the inbox preview.");
  const context: AiFileContext = { name: item.name, extension: item.extension, size: item.size, modifiedAt: item.modifiedAt, textBytes: 0 };
  if (!includeText || !TEXT_EXTENSIONS.has(item.extension)) return context;

  const handle = await open(item.sourcePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(MAX_TEXT_BYTES, metadata.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const contents = buffer.subarray(0, bytesRead);
    if (contents.includes(0)) return context;
    context.text = contents.toString("utf8").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
    context.textBytes = bytesRead;
    return context;
  } finally {
    await handle.close();
  }
}
