import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { organizeFiles, undoMove } from "../src/organizer.js";
import { scanInbox } from "../src/scanner.js";
import { defaultLedgerPath, recordsForRoot } from "../src/ledger.js";

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
    expect(scan.ruleConfig).toEqual({ customRuleCount: 1, source: ".inboxfs.json" });
    expect(scan.suggestions[0]).toMatchObject({
      category: "Research",
      classification: {
        type: "custom",
        pattern: "*.pdf",
        ruleName: "Research papers",
        source: ".inboxfs.json"
      }
    });
    expect(scan.suggestions[0].destinationPath.endsWith(path.join("Research", "paper.pdf"))).toBe(true);
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
