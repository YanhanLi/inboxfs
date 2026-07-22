import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { organizeFiles, undoMove } from "../src/organizer.js";
import { scanInbox } from "../src/scanner.js";

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
});
