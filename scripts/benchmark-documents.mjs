import { performance } from "node:perf_hooks";
import { ZipFile } from "yazl";
import { extractDocumentText } from "../dist/ai/document-extractor.js";

function pdf(texts) {
  const pageIds = texts.map((_, index) => 3 + index * 2);
  const fontId = 3 + texts.length * 2;
  const objects = new Map([[1, "<< /Type /Catalog /Pages 2 0 R >>"], [2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${texts.length} >>`]]);
  texts.forEach((text, index) => {
    const pageId = pageIds[index];
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    objects.set(pageId + 1, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= fontId; id += 1) { offsets[id] = Buffer.byteLength(output); output += `${id} 0 obj\n${objects.get(id)}\nendobj\n`; }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

async function docx() {
  const archive = new ZipFile();
  const paragraphs = Array.from({ length: 400 }, (_, index) => `<w:p><w:r><w:t>Project milestone ${index + 1} with delivery notes</w:t></w:r></w:p>`).join("");
  archive.addBuffer(Buffer.from(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`), "word/document.xml");
  archive.end();
  const chunks = [];
  for await (const chunk of archive.outputStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function measure(label, samples, budget, operation) {
  for (let index = 0; index < 3; index += 1) await operation();
  const durations = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    if (!(await operation())) throw new Error(`${label} returned no text.`);
    durations.push(performance.now() - started);
  }
  durations.sort((first, second) => first - second);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
  console.log(`${label}: p95 ${p95.toFixed(2)} ms / ${budget} ms budget`);
  if (p95 > budget) throw new Error(`${label} exceeded its ${budget} ms p95 budget.`);
}

const pdfFixture = pdf(Array.from({ length: 8 }, (_, index) => `Page ${index + 1} project delivery schedule`));
const docxFixture = await docx();
await measure("Eight-page PDF extraction", 15, 100, () => extractDocumentText(pdfFixture, "pdf"));
await measure("DOCX extraction", 15, 50, () => extractDocumentText(docxFixture, "docx"));
