import express from "express";
import { realpathSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLedger, resolveLedgerPath } from "./ledger.js";
import { organizeFiles, previewDestinationOverrides, undoMove } from "./organizer.js";
import { scanInbox } from "./scanner.js";
import { MutationLock } from "./mutation-lock.js";
import { configDocument, readInboxConfig, writeInboxConfig } from "./config.js";
import { previewInboxConfig } from "./preview.js";
import { AiJobManager } from "./ai/jobs.js";
import { OllamaProvider } from "./ai/ollama.js";
import { defaultAiSettingsPath, readAiSettings, writeAiSettings } from "./ai/settings.js";
import type { AiProvider } from "./ai/types.js";
import { AiCache } from "./ai/cache.js";

export interface AppOptions {
  aiProvider?: AiProvider;
  aiSettingsPath?: string;
  aiCachePath?: string;
  demo?: boolean;
}

export function createApp(root: string, webRoot?: string, options: AppOptions = {}) {
  root = realpathSync(root);
  const app = express();
  const mutationLock = new MutationLock();
  const aiProvider = options.aiProvider ?? new OllamaProvider();
  const aiSettingsPath = options.aiSettingsPath ?? defaultAiSettingsPath();
  const aiCachePath = options.aiCachePath ?? path.join(path.dirname(aiSettingsPath), "ai-cache.json");
  const aiJobs = new AiJobManager(root, aiProvider, new AiCache(aiCachePath));
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
    try { response.json({ ...await scanInbox(root), demo: options.demo === true }); } catch (error) { next(error); }
  });
  app.get("/api/history", async (_request, response, next) => {
    try { response.json((await readLedger(await resolveLedgerPath(root))).slice().reverse()); } catch (error) { next(error); }
  });
  app.get("/api/config", async (_request, response, next) => {
    try { response.json(configDocument(await readInboxConfig(root))); } catch (error) { next(error); }
  });
  app.get("/api/ai/status", async (_request, response, next) => {
    try {
      const settings = await readAiSettings(aiSettingsPath);
      try {
        const models = await aiProvider.listModels(AbortSignal.timeout(3_000));
        response.json({ settings, available: true, models });
      } catch (error) {
        response.json({ settings, available: false, models: [], error: error instanceof Error ? error.message : "Local model service is unavailable." });
      }
    } catch (error) { next(error); }
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
      let overrides = new Map<string, string>();
      if (request.body.aiJobId !== undefined || request.body.aiDecisions !== undefined) {
        if (typeof request.body.aiJobId !== "string") throw new Error("A completed AI review job is required for AI decisions.");
        overrides = aiJobs.validateDecisions(request.body.aiJobId, request.body.aiDecisions);
      }
      response.json({ moved: await mutationLock.run(() => organizeFiles(root, request.body.ids, undefined, undefined, overrides)) });
    } catch (error) { next(error); }
  });
  app.put("/api/ai/settings", async (request, response, next) => {
    try {
      const proposed = request.body;
      if (proposed?.enabled) {
        const models = await aiProvider.listModels(AbortSignal.timeout(5_000));
        if (!models.some((model) => model.name === proposed.model)) throw new Error("The selected model is not installed locally.");
      }
      response.json(await mutationLock.run(() => writeAiSettings(proposed, aiSettingsPath)));
    } catch (error) { next(error); }
  });
  app.post("/api/ai/jobs", async (request, response, next) => {
    try {
      const ids = request.body?.ids;
      if (ids !== undefined && (!Array.isArray(ids) || ids.some((id: unknown) => typeof id !== "string"))) throw new Error("Selected AI review IDs must be an array of strings.");
      response.status(202).json(await aiJobs.start(await scanInbox(root), await readAiSettings(aiSettingsPath), ids));
    } catch (error) { next(error); }
  });
  app.post("/api/ai/plan", async (request, response, next) => {
    try {
      if (typeof request.body?.jobId !== "string") throw new Error("A completed AI review job is required for AI decisions.");
      const overrides = aiJobs.validateDecisions(request.body.jobId, request.body.decisions);
      response.json({ items: await previewDestinationOverrides(root, overrides) });
    } catch (error) { next(error); }
  });
  app.get("/api/ai/jobs/:id", (request, response, next) => {
    try { response.json(aiJobs.get(request.params.id)); } catch (error) { next(error); }
  });
  app.delete("/api/ai/jobs/:id", (request, response, next) => {
    try { response.json(aiJobs.cancel(request.params.id)); } catch (error) { next(error); }
  });
  app.post("/api/config/preview", async (request, response, next) => {
    try { response.json(await previewInboxConfig(root, request.body)); } catch (error) { next(error); }
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
