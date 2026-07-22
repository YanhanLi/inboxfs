import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  });

  it("rejects a non-loopback Host header", async () => {
    const { app } = await fixture();
    await request(app).get("/api/scan").set("Host", "malicious.example").expect(403);
  });

  it("rejects cross-origin mutations", async () => {
    const { app } = await fixture();
    await request(app).post("/api/organize").set("Origin", "https://malicious.example").send({ ids: [] }).expect(403);
  });
});
