import express from "express";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLedger, resolveLedgerPath } from "./ledger.js";
import { organizeFiles, undoMove } from "./organizer.js";
import { scanInbox } from "./scanner.js";
import { MutationLock } from "./mutation-lock.js";
import { configDocument, readInboxConfig, writeInboxConfig } from "./config.js";

export function createApp(root: string, webRoot?: string) {
  const app = express();
  const mutationLock = new MutationLock();
  app.use(express.json({ limit: "64kb" }));
  app.use((request, response, next) => {
    const host = request.headers.host;
    if (!host || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
      response.status(403).json({ error: "InboxFS only accepts loopback requests." });
      return;
    }
    const origin = request.headers.origin;
    if (request.method !== "GET" && origin && origin !== `http://${host}`) {
      response.status(403).json({ error: "Cross-origin mutations are not allowed." });
      return;
    }
    next();
  });

  app.get("/api/scan", async (_request, response, next) => {
    try { response.json(await scanInbox(root)); } catch (error) { next(error); }
  });
  app.get("/api/history", async (_request, response, next) => {
    try { response.json((await readLedger(await resolveLedgerPath(root))).slice().reverse()); } catch (error) { next(error); }
  });
  app.get("/api/config", async (_request, response, next) => {
    try { response.json(configDocument(await readInboxConfig(root))); } catch (error) { next(error); }
  });
  app.get("/api/events", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    const keepAlive = setInterval(() => response.write(": keep-alive\n\n"), 15_000);
    let timer: NodeJS.Timeout | undefined;
    const watcher = watch(root, { persistent: false }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => response.write("event: changed\ndata: {}\n\n"), 300);
    });
    request.on("close", () => {
      clearInterval(keepAlive);
      clearTimeout(timer);
      watcher.close();
    });
  });
  app.post("/api/organize", async (request, response, next) => {
    try {
      if (!Array.isArray(request.body?.ids) || request.body.ids.some((id: unknown) => typeof id !== "string")) {
        response.status(400).json({ error: "ids must be an array of strings" });
        return;
      }
      response.json({ moved: await mutationLock.run(() => organizeFiles(root, request.body.ids)) });
    } catch (error) { next(error); }
  });
  app.post("/api/undo/:id", async (request, response, next) => {
    try { response.json({ record: await mutationLock.run(() => undoMove(root, request.params.id)) }); } catch (error) { next(error); }
  });
  app.put("/api/config", async (request, response, next) => {
    try {
      const config = await mutationLock.run(() => writeInboxConfig(root, request.body));
      response.json(configDocument(config));
    } catch (error) { next(error); }
  });

  const assets = webRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web-dist");
  app.use(express.static(assets));
  app.get("*splat", (_request, response) => response.sendFile(path.join(assets, "index.html")));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(409).json({ error: error instanceof Error ? error.message : "Unexpected error" });
  });
  return app;
}
