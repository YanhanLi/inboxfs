import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { organizeFiles, undoMove } from "../src/organizer.js";
import { scanInbox } from "../src/scanner.js";
import { defaultLedgerPath, recordsForRoot } from "../src/ledger.js";
import { configDocument, parseInboxConfig } from "../src/config.js";
import { previewInboxConfig } from "../src/preview.js";
import { matchesGlob } from "../src/rules.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function inbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), "inboxfs-"));
  roots.push(root);
  return root;
}

describe("InboxFS core", () => {
  it("classifies loose files and ignores hidden files", async () => {
    const root = await inbox();
    await Promise.all([writeFile(path.join(root, "paper.pdf"), "paper"), writeFile(path.join(root, "photo.png"), "image"), writeFile(path.join(root, ".secret"), "hidden")]);
    const scan = await scanInbox(root);
    expect(scan.suggestions.map((item) => [item.name, item.category])).toEqual([["paper.pdf", "Documents"], ["photo.png", "Images"]]);
    expect(scan.suggestions[0].classification).toEqual({
      type: "extension",
      pattern: "*.pdf",
      explanation: "The .pdf extension maps to Documents."
    });
  });

  it("explains fallback classification for unknown and extensionless files", async () => {
    const root = await inbox();
    await Promise.all([writeFile(path.join(root, "artifact.xyzzy"), "unknown"), writeFile(path.join(root, "LICENSE"), "text")]);
    const scan = await scanInbox(root);
    expect(scan.suggestions.map((item) => item.classification)).toEqual([
      { type: "fallback", pattern: "*.xyzzy", explanation: "No category rule matches the .xyzzy extension." },
      { type: "fallback", pattern: "No extension", explanation: "Files without an extension use the fallback category." }
    ]);
  });

  it("applies local custom extension rules before built-in rules", async () => {
    const root = await inbox();
    await writeFile(path.join(root, ".inboxfs.json"), JSON.stringify({ version: 1, rules: [{ name: "Research papers", extensions: [".pdf", "epub"], destination: "Research" }] }));
    await writeFile(path.join(root, "paper.pdf"), "paper");
    const scan = await scanInbox(root);
    expect(scan.ruleConfig).toEqual({ version: 2, customRuleCount: 1, source: ".inboxfs.json", migratedFromVersion: 1 });
    expect(scan.suggestions[0]).toMatchObject({
      category: "Research",
      classification: {
        type: "custom",
        pattern: "*.pdf, *.epub",
        ruleName: "Research papers",
        source: ".inboxfs.json"
      }
    });
    expect(scan.suggestions[0].destinationPath.endsWith(path.join("Research", "paper.pdf"))).toBe(true);
  });

  it("migrates v1 rules to normalized v2 documents without losing extensions", () => {
    const config = parseInboxConfig({ version: 1, rules: [{ name: "Reading", destination: "Books", extensions: [".EPUB", "mobi"] }] }, ".inboxfs.json");
    expect(config.migratedFromVersion).toBe(1);
    expect(configDocument(config)).toEqual({
      version: 2,
      rules: [{ name: "Reading", destination: "Books", enabled: true, match: { extensions: ["epub", "mobi"] } }],
    });
  });

  it("rejects executable or unknown fields in legacy configurations", () => {
    expect(() => parseInboxConfig({ version: 1, script: "return true", rules: [] })).toThrow('unsupported field "script"');
    expect(() => parseInboxConfig({
      version: 1,
      rules: [{ name: "Legacy regex", destination: "Unsafe", extensions: ["txt"], regex: ".*" }],
    })).toThrow('unsupported field "regex"');
  });

  it("applies enabled multi-condition rules in explicit array priority", async () => {
    const root = await inbox();
    await writeFile(path.join(root, ".inboxfs.json"), JSON.stringify({
      version: 2,
      rules: [
        { name: "Disabled", destination: "Disabled", enabled: false, match: { extensions: ["pdf"] } },
        { name: "Large invoices", destination: "Finance", enabled: true, match: { extensions: ["pdf"], nameGlobs: ["invoice-*.pdf"], size: { minBytes: 10 } } },
        { name: "Remaining PDFs", destination: "Papers", enabled: true, match: { extensions: ["pdf"] } },
      ],
    }));
    await Promise.all([
      writeFile(path.join(root, "invoice-large.pdf"), "a sufficiently large invoice"),
      writeFile(path.join(root, "invoice-small.pdf"), "tiny"),
      writeFile(path.join(root, "paper.pdf"), "paper"),
    ]);
    const scan = await scanInbox(root);
    expect(scan.suggestions.map((item) => [item.name, item.category, item.classification.ruleName])).toEqual([
      ["invoice-large.pdf", "Finance", "Large invoices"],
      ["invoice-small.pdf", "Papers", "Remaining PDFs"],
      ["paper.pdf", "Papers", "Remaining PDFs"],
    ]);
  });

  it("matches bounded file-name globs without path or regular-expression semantics", () => {
    expect(matchesGlob("Invoice-2026.PDF", "invoice-????.pdf")).toBe(true);
    expect(matchesGlob("invoice-final.pdf", "invoice-*.pdf")).toBe(true);
    expect(matchesGlob("报告.pdf", "??.pdf")).toBe(true);
    expect(matchesGlob("file[1].pdf", "file[1].pdf")).toBe(true);
    expect(matchesGlob("nested/invoice.pdf", "*.pdf")).toBe(false);
    expect(() => parseInboxConfig({ version: 2, rules: [{ name: "Unsafe", destination: "Safe", enabled: true, match: { nameGlobs: ["../*.pdf"] } }] })).toThrow("not a supported file name glob");
    expect(() => parseInboxConfig({ version: 2, rules: [{ name: "Recursive", destination: "Safe", enabled: true, match: { nameGlobs: ["**.pdf"] } }] })).toThrow("not a supported file name glob");
    expect(() => parseInboxConfig({ version: 2, rules: [{ name: "Range", destination: "Safe", enabled: true, match: { size: { minBytes: 20, maxBytes: 10 } } }] })).toThrow("cannot exceed");
    expect(() => parseInboxConfig({ version: 2, rules: [{ name: "Regex", destination: "Safe", enabled: true, match: { regex: ".*" } }] })).toThrow("unsupported field \"regex\"");
    expect(() => parseInboxConfig({ version: 2, rules: [{ name: "Script", destination: "Safe", enabled: true, script: "return true", match: { extensions: ["txt"] } }] })).toThrow("unsupported field \"script\"");
  });

  it("previews impact and priority diagnostics without changing files or configuration", async () => {
    const root = await inbox();
    const configPath = path.join(root, ".inboxfs.json");
    const original = JSON.stringify({ version: 1, rules: [{ name: "Research", destination: "Research", extensions: ["pdf"] }] });
    await writeFile(configPath, original);
    await writeFile(path.join(root, "paper.pdf"), "paper");
    await writeFile(path.join(root, "notes.txt"), "notes");
    const preview = await previewInboxConfig(root, {
      version: 2,
      rules: [
        { name: "Primary PDFs", destination: "Papers", enabled: true, match: { extensions: ["pdf"] } },
        { name: "Shadowed PDFs", destination: "Archive", enabled: true, match: { extensions: ["pdf"] } },
        { name: "Notes", destination: "Notes", enabled: true, match: { nameGlobs: ["*.txt"] } },
      ],
    });
    expect(preview.summary).toEqual({ totalFiles: 2, matchedFiles: 2, changedFiles: 2, unmatchedFiles: 0 });
    expect(preview.rules[0]).toMatchObject({ matchCount: 1, candidateCount: 1, samples: ["paper.pdf"] });
    expect(preview.rules[1]).toMatchObject({ matchCount: 0, candidateCount: 1, diagnostics: [{ type: "shadowed", message: expect.any(String) }] });
    expect(preview.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "paper.pdf", fromDestination: "Research", toDestination: "Papers" }),
      expect.objectContaining({ name: "notes.txt", fromDestination: "Documents", toDestination: "Notes" }),
    ]));
    expect(await readFile(configPath, "utf8")).toBe(original);
    expect(await readFile(path.join(root, "paper.pdf"), "utf8")).toBe("paper");
    expect(await readFile(path.join(root, "notes.txt"), "utf8")).toBe("notes");
  });

  it("rejects unsafe and ambiguous custom rules", async () => {
    const root = await inbox();
    await writeFile(path.join(root, ".inboxfs.json"), JSON.stringify({
      version: 1,
      rules: [
        { name: "First", extensions: ["pdf"], destination: "../Outside" },
        { name: "Second", extensions: ["pdf"], destination: "Research" }
      ]
    }));
    await expect(scanInbox(root)).rejects.toThrow("safe, visible folder name");

    await writeFile(path.join(root, ".inboxfs.json"), JSON.stringify({
      version: 1,
      rules: [
        { name: "First", extensions: ["pdf"], destination: "Research" },
        { name: "Second", extensions: [".pdf"], destination: "Papers" }
      ]
    }));
    await expect(scanInbox(root)).rejects.toThrow("assigned to both");
  });

  it("invalidates a preview when its custom destination rule changes", async () => {
    const root = await inbox();
    const ledger = path.join(root, ".ledger.json");
    const configPath = path.join(root, ".inboxfs.json");
    await writeFile(configPath, JSON.stringify({ version: 1, rules: [{ name: "Research", extensions: ["pdf"], destination: "Research" }] }));
    await writeFile(path.join(root, "paper.pdf"), "paper");
    const scan = await scanInbox(root);
    await writeFile(configPath, JSON.stringify({ version: 1, rules: [{ name: "Papers", extensions: ["pdf"], destination: "Papers" }] }));
    await expect(organizeFiles(root, [scan.suggestions[0].id], ledger)).rejects.toThrow("changed since the preview");
    expect(await readFile(path.join(root, "paper.pdf"), "utf8")).toBe("paper");
  });

  it("invalidates stale suggestions when rule identity changes without changing the destination", async () => {
    const root = await inbox();
    const ledger = path.join(root, ".ledger.json");
    const configPath = path.join(root, ".inboxfs.json");
    await writeFile(configPath, JSON.stringify({ version: 2, rules: [{ name: "First", destination: "Research", enabled: true, match: { extensions: ["pdf"] } }] }));
    await writeFile(path.join(root, "paper.pdf"), "paper");
    const scan = await scanInbox(root);
    await writeFile(configPath, JSON.stringify({ version: 2, rules: [{ name: "Renamed", destination: "Research", enabled: true, match: { extensions: ["pdf"] } }] }));
    await expect(organizeFiles(root, [scan.suggestions[0].id], ledger)).rejects.toThrow("changed since the preview");
  });

  it("rejects malformed or symbolic-link configuration files", async () => {
    const root = await inbox();
    await writeFile(path.join(root, ".inboxfs.json"), "not json");
    await expect(scanInbox(root)).rejects.toThrow("invalid JSON");

    const target = path.join(await inbox(), "rules.json");
    await writeFile(target, JSON.stringify({ version: 1, rules: [] }));
    await rm(path.join(root, ".inboxfs.json"));
    await symlink(target, path.join(root, ".inboxfs.json"));
    await expect(scanInbox(root)).rejects.toThrow("regular file");
  });

  it("moves selected files and restores unchanged content", async () => {
    const root = await inbox();
    const ledger = path.join(root, ".ledger.json");
    await writeFile(path.join(root, "notes.txt"), "hello");
    const scan = await scanInbox(root);
    const [record] = await organizeFiles(root, [scan.suggestions[0].id], ledger);
    expect(await readFile(path.join(root, "Documents", "notes.txt"), "utf8")).toBe("hello");
    await undoMove(root, record.id, ledger);
    expect(await readFile(path.join(root, "notes.txt"), "utf8")).toBe("hello");
  });

  it("refuses undo after the organized file changes", async () => {
    const root = await inbox();
    const ledger = path.join(root, ".ledger.json");
    await writeFile(path.join(root, "data.csv"), "a,b");
    const scan = await scanInbox(root);
    const [record] = await organizeFiles(root, [scan.suggestions[0].id], ledger);
    await writeFile(record.destinationPath, "changed");
    await expect(undoMove(root, record.id, ledger)).rejects.toThrow("changed after it was moved");
  });

  it("chooses a non-conflicting destination name", async () => {
    const root = await inbox();
    await writeFile(path.join(root, "report.pdf"), "new");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(path.join(root, "Documents")));
    await writeFile(path.join(root, "Documents", "report.pdf"), "old");
    const scan = await scanInbox(root);
    expect(scan.suggestions[0].destinationPath.endsWith("report (2).pdf")).toBe(true);
  });

  it("refuses to move through a category directory symlink", async () => {
    const root = await inbox();
    const outside = await inbox();
    const ledger = path.join(root, ".ledger.json");
    await symlink(outside, path.join(root, "Documents"));
    await writeFile(path.join(root, "paper.pdf"), "private");
    const scan = await scanInbox(root);
    await expect(organizeFiles(root, [scan.suggestions[0].id], ledger)).rejects.toThrow("outside the inbox root");
    expect(await readFile(path.join(root, "paper.pdf"), "utf8")).toBe("private");
  });

  it("rolls back earlier files when a batch move fails", async () => {
    const root = await inbox();
    const ledger = path.join(root, ".ledger.json");
    await writeFile(path.join(root, "a.txt"), "first");
    await writeFile(path.join(root, "b.txt"), "second");
    const scan = await scanInbox(root);
    let calls = 0;
    const renameFile = async (source: string, destination: string) => {
      calls += 1;
      if (calls === 2) throw new Error("simulated disk failure");
      await import("node:fs/promises").then(({ rename }) => rename(source, destination));
    };
    await expect(organizeFiles(root, scan.suggestions.map((item) => item.id), ledger, { renameFile })).rejects.toThrow("simulated disk failure");
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("first");
    expect(await readFile(path.join(root, "b.txt"), "utf8")).toBe("second");
  });

  it("detects duplicate content and leaves later copies unselected", async () => {
    const root = await inbox();
    await writeFile(path.join(root, "original.pdf"), "same content");
    await writeFile(path.join(root, "copy.pdf"), "same content");
    const scan = await scanInbox(root);
    expect(scan.suggestions.filter((item) => item.duplicateOf)).toHaveLength(1);
    expect(scan.suggestions.filter((item) => item.selected)).toHaveLength(1);
  });

  it("detects a loose duplicate of an already organized file", async () => {
    const root = await inbox();
    await import("node:fs/promises").then(({ mkdir }) => mkdir(path.join(root, "Documents")));
    await writeFile(path.join(root, "Documents", "saved.pdf"), "same content");
    await writeFile(path.join(root, "download.pdf"), "same content");
    const scan = await scanInbox(root);
    const canonicalRoot = await import("node:fs/promises").then(({ realpath }) => realpath(root));
    expect(scan.suggestions[0].duplicateOf).toBe(path.join(canonicalRoot, "Documents", "saved.pdf"));
    expect(scan.suggestions[0].selected).toBe(false);
  });

  it("uses distinct ledgers for directories with a long shared prefix", () => {
    const prefix = "/tmp/a-very-long-shared-directory-prefix-that-used-to-collide/";
    expect(defaultLedgerPath(`${prefix}first`)).not.toBe(defaultLedgerPath(`${prefix}second`));
  });

  it("filters collided legacy history during migration", () => {
    const root = "/tmp/inbox-a";
    const record = (sourceRoot: string) => ({
      id: sourceRoot,
      createdAt: new Date(0).toISOString(),
      sourcePath: path.join(sourceRoot, "file.txt"),
      destinationPath: path.join(sourceRoot, "Documents", "file.txt"),
      contentHash: "hash"
    });
    expect(recordsForRoot(root, [record(root), record("/tmp/inbox-b")])).toEqual([record(root)]);
  });
});
