import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "inboxfs-http-"));
  roots.push(root);
  await writeFile(path.join(root, "notes.txt"), "hello");
  return { root, app: createApp(root) };
}

describe("local HTTP boundary", () => {
  it("serves scans to loopback requests", async () => {
    const { app } = await fixture();
    const response = await request(app).get("/api/scan").expect(200);
    expect(response.body.suggestions).toHaveLength(1);
    expect(response.body.suggestions[0].classification.pattern).toBe("*.txt");
  });

  it("uses one ledger identity when the inbox is opened through a symbolic link", async () => {
    const { root } = await fixture();
    const alias = `${root}-alias`;
    roots.push(alias);
    await symlink(root, alias, "dir");
    const app = createApp(alias);
    const scan = await request(app).get("/api/scan").expect(200);
    await request(app).post("/api/organize").send({ ids: [scan.body.suggestions[0].id] }).expect(200);
    const history = await request(app).get("/api/history").expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].sourcePath).toBe(path.join(await realpath(root), "notes.txt"));
  });

  it("returns a clear conflict response for invalid local rules", async () => {
    const { root, app } = await fixture();
    await writeFile(path.join(root, ".inboxfs.json"), "invalid json");
    const response = await request(app).get("/api/scan").expect(409);
    expect(response.body.error).toBe(".inboxfs.json contains invalid JSON.");
  });

  it("reads and atomically saves normalized custom rules", async () => {
    const { root, app } = await fixture();
    await request(app).get("/api/config").expect(200, { version: 1, rules: [] });

    const response = await request(app).put("/api/config").send({
      version: 1,
      rules: [{ name: "Reading", destination: "Reading", extensions: [".TXT", "pdf"] }],
    }).expect(200);

    expect(response.body.rules[0].extensions).toEqual(["txt", "pdf"]);
    expect(JSON.parse(await readFile(path.join(root, ".inboxfs.json"), "utf8"))).toEqual(response.body);
    const scan = await request(app).get("/api/scan").expect(200);
    expect(scan.body.suggestions[0].category).toBe("Reading");
  });

  it("rejects unsafe rule writes", async () => {
    const { app } = await fixture();
    const response = await request(app).put("/api/config").send({
      version: 1,
      rules: [{ name: "Escape", destination: "../outside", extensions: ["txt"] }],
    }).expect(409);
    expect(response.body.error).toContain("safe, visible folder name");
  });

  it("does not replace a symbolic-link configuration", async () => {
    const { root, app } = await fixture();
    const target = path.join(root, "target.json");
    await writeFile(target, "unchanged");
    await symlink(target, path.join(root, ".inboxfs.json"));
    await request(app).put("/api/config").send({ version: 1, rules: [] }).expect(409);
    expect(await readFile(target, "utf8")).toBe("unchanged");
  });

  it("rejects a non-loopback Host header", async () => {
    const { app } = await fixture();
    await request(app).get("/api/scan").set("Host", "malicious.example").expect(403);
  });

  it("rejects cross-origin mutations", async () => {
    const { app } = await fixture();
    await request(app).post("/api/organize").set("Origin", "https://malicious.example").send({ ids: [] }).expect(403);
    await request(app).put("/api/config").set("Origin", "https://malicious.example").send({ version: 1, rules: [] }).expect(403);
  });
});
