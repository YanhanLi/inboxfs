import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZipFile } from "yazl";
import { extractDocumentText, MAX_DOCUMENT_BYTES, MAX_DOCX_XML_BYTES, MAX_PDF_PAGES } from "../src/ai/document-extractor.js";
import { extractFileContext } from "../src/ai/extractor.js";
import { AiJobManager } from "../src/ai/jobs.js";
import type { AiFileContext, AiProvider } from "../src/ai/types.js";
import { organizeFiles } from "../src/organizer.js";
import { scanInbox } from "../src/scanner.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function pdf(texts: string[]): Buffer {
  const pageIds = texts.map((_, index) => 3 + index * 2);
  const fontId = 3 + texts.length * 2;
  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${texts.length} >>`);
  texts.forEach((text, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const escaped = text.replace(/([\\()])/g, "\\$1");
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = Buffer.byteLength(output);
    output += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

async function docx(xml: string | Buffer): Promise<Buffer> {
  const archive = new ZipFile();
  archive.addBuffer(Buffer.isBuffer(xml) ? xml : Buffer.from(xml), "word/document.xml");
  archive.end();
  const chunks: Buffer[] = [];
  for await (const chunk of archive.outputStream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function wordXml(text: string): string {
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
}

function provider(classify: AiProvider["classify"]): AiProvider {
  return { listModels: async () => [{ name: "local-model:1b", size: 100, digest: "digest" }], classify };
}

describe("bounded document extraction", () => {
  it("extracts PDF text from at most the first eight pages", async () => {
    const text = await extractDocumentText(pdf(Array.from({ length: 10 }, (_, index) => `page-${index + 1}`)), "pdf");
    expect(text).toContain("page-1");
    expect(text).toContain(`page-${MAX_PDF_PAGES}`);
    expect(text).not.toContain("page-9");
  });

  it("extracts DOCX text without reading unrelated archive entries", async () => {
    expect(await extractDocumentText(await docx(wordXml("Project Alpha budget")), "docx")).toBe("Project Alpha budget");
  });

  it("rejects DOCX entity declarations and oversized document XML", async () => {
    await expect(extractDocumentText(await docx(`<!DOCTYPE x [<!ENTITY secret "nope">]>${wordXml("&secret;")}`), "docx")).rejects.toThrow("DOCTYPE");
    await expect(extractDocumentText(await docx(Buffer.alloc(MAX_DOCX_XML_BYTES + 1, 32)), "docx")).rejects.toThrow("1 MiB");
  });

  it("rejects oversized documents and already-cancelled extraction", async () => {
    await expect(extractDocumentText(Buffer.alloc(MAX_DOCUMENT_BYTES + 1), "pdf")).rejects.toThrow("16 MiB");
    const controller = new AbortController();
    controller.abort(new Error("cancelled for test"));
    await expect(extractDocumentText(pdf(["Cancelled"]), "pdf", controller.signal)).rejects.toThrow("cancelled for test");
  });

  it("reviews an explicitly selected built-in PDF with extracted provenance", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "inboxfs-doc-"));
    roots.push(root);
    await writeFile(path.join(root, "proposal.pdf"), pdf(["Project Alpha delivery milestones"]));
    const scan = await scanInbox(root);
    expect(scan.suggestions[0].classification.type).toBe("extension");
    const context = await extractFileContext(root, scan.suggestions[0], true);
    expect(context).toMatchObject({ textSource: "pdf", text: expect.stringContaining("Project Alpha"), textBytes: expect.any(Number) });

    const classify = vi.fn(async (input: AiFileContext) => {
      expect(input.textSource).toBe("pdf");
      return { destination: "Projects", confidence: 0.9, explanation: "Project proposal" };
    });
    const manager = new AiJobManager(root, provider(classify));
    const settings = { enabled: true, model: "local-model:1b", includeText: true, destinations: ["Projects", "Archive"] };
    await expect(manager.start(scan, settings)).rejects.toThrow("No unmatched files");
    const started = await manager.start(scan, settings, [scan.suggestions[0].id]);
    await vi.waitFor(() => expect(manager.get(started.id).status).toBe("completed"));
    expect(manager.get(started.id)).toMatchObject({ scope: "selected", results: [{ textSource: "pdf", status: "suggested" }] });
    expect(classify).toHaveBeenCalledOnce();
    const result = manager.get(started.id).results[0];
    const overrides = manager.validateDecisions(started.id, [{ id: result.suggestionId, destination: "Projects" }]);
    const moved = await organizeFiles(root, [result.suggestionId], path.join(root, "ledger.json"), undefined, overrides);
    expect(moved[0].destinationPath).toBe(path.join(await realpath(root), "Projects", "proposal.pdf"));
  });

  it("rejects empty, duplicate, oversized, and stale selected ID sets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "inboxfs-doc-"));
    roots.push(root);
    await writeFile(path.join(root, "proposal.pdf"), pdf(["Proposal"]));
    const scan = await scanInbox(root);
    const manager = new AiJobManager(root, provider(async () => ({ destination: "Projects", confidence: 0.9, explanation: "Project" })));
    const settings = { enabled: true, model: "local-model:1b", includeText: true, destinations: ["Projects", "Archive"] };
    await expect(manager.start(scan, settings, [])).rejects.toThrow("1 to 100 unique");
    await expect(manager.start(scan, settings, [scan.suggestions[0].id, scan.suggestions[0].id])).rejects.toThrow("unique");
    await expect(manager.start(scan, settings, Array.from({ length: 101 }, (_, index) => `id-${index}`))).rejects.toThrow("1 to 100");
    await expect(manager.start(scan, settings, ["stale-id"])).rejects.toThrow("changed before");
  });
});
