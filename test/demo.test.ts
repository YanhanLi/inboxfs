import { access, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli.js";
import { createDemoInbox } from "../src/demo.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("safe demo workspace", () => {
  it("creates a private, isolated set of representative loose files", async () => {
    const demo = await createDemoInbox();
    cleanups.push(demo.cleanup);
    expect(demo.root.startsWith(path.join(os.tmpdir(), "inboxfs-demo-"))).toBe(true);
    expect(await readdir(demo.root)).toEqual([
      "app.ts", "meeting-notes.txt", "mystery.xyzzy", "project-brief.pdf", "quarterly-budget.xlsx", "reference.zip", "vacation-photo.jpg",
    ]);
  });

  it("cleans only its own directory and remains safe when called twice", async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), "inboxfs-demo-test-outside-"));
    const marker = path.join(outside, "keep.txt");
    await writeFile(marker, "keep");
    const demo = await createDemoInbox();
    await demo.cleanup();
    await demo.cleanup();
    await expect(access(demo.root)).rejects.toThrow();
    await expect(access(marker)).resolves.toBeUndefined();
    cleanups.push(() => import("node:fs/promises").then(({ rm }) => rm(outside, { recursive: true, force: true })));
  });

  it("parses demo and ordinary invocations without ambiguity", () => {
    expect(parseCliArgs(["--demo", "--no-open"])).toEqual({ demo: true, help: false, noOpen: true, directory: undefined });
    expect(parseCliArgs(["/tmp/inbox", "--no-open"])).toEqual({ demo: false, help: false, noOpen: true, directory: "/tmp/inbox" });
    expect(parseCliArgs(["--help"])).toEqual({ demo: false, help: true, noOpen: false, directory: undefined });
    expect(() => parseCliArgs(["--demo", "/tmp/inbox"])).toThrow("Do not provide");
    expect(() => parseCliArgs(["first", "second"])).toThrow("only one");
    expect(() => parseCliArgs(["--remote"])).toThrow("Unknown option");
  });

  it("serves the demo through the real CLI and removes it on termination", async () => {
    const child = spawn(process.execPath, [path.resolve("dist/cli.js"), "--demo", "--no-open"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    const match = await new Promise<RegExpMatchArray>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`CLI did not start:\n${output}`)), 5_000);
      const inspect = () => {
        const found = output.match(/InboxFS demo is ready in (.+)\n(http:\/\/127\.0\.0\.1:\d+)/);
        if (!found) return;
        clearTimeout(timeout);
        resolve(found);
      };
      child.stdout.on("data", inspect);
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`CLI exited early with ${code}:\n${output}`)));
    });
    const root = match[1];
    const response = await fetch(`${match[2]}/api/scan`);
    expect(response.ok).toBe(true);
    const scan = await response.json();
    expect(scan.demo).toBe(true);
    expect(scan.suggestions).toHaveLength(7);
    const exited = new Promise<void>((resolve, reject) => {
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`CLI exited with ${code}`)));
    });
    child.kill("SIGTERM");
    await exited;
    await expect(access(root)).rejects.toThrow();
  });

  it("prints help without creating or opening an inbox", async () => {
    const child = spawn(process.execPath, [path.resolve("dist/cli.js"), "--help"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    await new Promise<void>((resolve, reject) => child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`CLI exited with ${code}`))));
    expect(output).toContain("inboxfs --demo");
    expect(output).toContain("removes it when InboxFS stops");
  });
});
