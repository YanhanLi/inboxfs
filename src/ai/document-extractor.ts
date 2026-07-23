import { SaxesParser } from "saxes";
import { getDocumentProxy } from "unpdf";
import { fromBufferPromise } from "yauzl";

export const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
export const MAX_EXTRACTED_BYTES = 32 * 1024;
export const MAX_DOCX_XML_BYTES = 1024 * 1024;
export const MAX_PDF_PAGES = 8;
const MAX_ZIP_ENTRIES = 2048;

export type DocumentTextSource = "pdf" | "docx";

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Document extraction was cancelled.");
}

function truncateUtf8(value: string): string {
  const buffer = Buffer.from(value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " "), "utf8");
  if (buffer.length <= MAX_EXTRACTED_BYTES) return buffer.toString("utf8");
  return buffer.subarray(0, MAX_EXTRACTED_BYTES).toString("utf8").replace(/\uFFFD$/, "");
}

export async function extractPdfText(buffer: Buffer, signal?: AbortSignal): Promise<string> {
  abortIfNeeded(signal);
  const document = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, MAX_PDF_PAGES); pageNumber += 1) {
      abortIfNeeded(signal);
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        pages.push(content.items.flatMap((item: unknown) => {
          if (!item || typeof item !== "object" || !("str" in item) || typeof item.str !== "string") return [];
          return [item.str, "hasEOL" in item && item.hasEOL ? "\n" : " "];
        }).join(""));
      } finally {
        page.cleanup();
      }
      if (Buffer.byteLength(pages.join("\n"), "utf8") >= MAX_EXTRACTED_BYTES) break;
    }
    return truncateUtf8(pages.join("\n").trim());
  } finally {
    await document.destroy();
  }
}

async function readDocxXml(buffer: Buffer, signal?: AbortSignal): Promise<string> {
  const zip = await fromBufferPromise(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true });
  try {
    if (zip.entryCount > MAX_ZIP_ENTRIES) throw new Error("DOCX contains too many archive entries.");
    for await (const entry of zip.eachEntry()) {
      abortIfNeeded(signal);
      if (entry.fileName !== "word/document.xml") continue;
      if (!entry.canDecodeFileData() || entry.isEncrypted()) throw new Error("DOCX document XML cannot be decoded safely.");
      if (entry.uncompressedSize > MAX_DOCX_XML_BYTES) throw new Error("DOCX document XML exceeds the 1 MiB safety limit.");
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of stream) {
        abortIfNeeded(signal);
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += data.length;
        if (bytes > MAX_DOCX_XML_BYTES) {
          stream.destroy();
          throw new Error("DOCX document XML exceeds the 1 MiB safety limit.");
        }
        chunks.push(data);
      }
      return Buffer.concat(chunks).toString("utf8");
    }
    throw new Error("DOCX does not contain word/document.xml.");
  } finally {
    zip.close();
  }
}

export async function extractDocxText(buffer: Buffer, signal?: AbortSignal): Promise<string> {
  const xml = await readDocxXml(buffer, signal);
  const parser = new SaxesParser({ xmlns: true });
  const text: string[] = [];
  let textDepth = 0;
  parser.on("doctype", () => { throw new Error("DOCX document XML cannot contain a DOCTYPE."); });
  parser.on("opentag", (tag) => {
    if (tag.local === "t") textDepth += 1;
    else if (tag.local === "tab") text.push("\t");
    else if (tag.local === "br" || tag.local === "cr") text.push("\n");
  });
  parser.on("text", (value) => { if (textDepth) text.push(value); });
  parser.on("closetag", (tag) => {
    if (tag.local === "t") textDepth -= 1;
    else if (tag.local === "p") text.push("\n");
  });
  parser.write(xml).close();
  abortIfNeeded(signal);
  return truncateUtf8(text.join("").replace(/\n{3,}/g, "\n\n").trim());
}

export async function extractDocumentText(buffer: Buffer, source: DocumentTextSource, signal?: AbortSignal): Promise<string> {
  if (buffer.length > MAX_DOCUMENT_BYTES) throw new Error("Document exceeds the 16 MiB local extraction limit.");
  return source === "pdf" ? extractPdfText(buffer, signal) : extractDocxText(buffer, signal);
}
