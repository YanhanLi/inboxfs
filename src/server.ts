import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultLedgerPath, readLedger } from "./ledger.js";
import { organizeFiles, undoMove } from "./organizer.js";
import { scanInbox } from "./scanner.js";

export function createApp(root: string, webRoot?: string) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/api/scan", async (_request, response, next) => {
    try { response.json(await scanInbox(root)); } catch (error) { next(error); }
  });
  app.get("/api/history", async (_request, response, next) => {
    try { response.json((await readLedger(defaultLedgerPath(root))).slice().reverse()); } catch (error) { next(error); }
  });
  app.post("/api/organize", async (request, response, next) => {
    try {
      if (!Array.isArray(request.body?.ids) || request.body.ids.some((id: unknown) => typeof id !== "string")) {
        response.status(400).json({ error: "ids must be an array of strings" });
        return;
      }
      response.json({ moved: await organizeFiles(root, request.body.ids) });
    } catch (error) { next(error); }
  });
  app.post("/api/undo/:id", async (request, response, next) => {
    try { response.json({ record: await undoMove(root, request.params.id) }); } catch (error) { next(error); }
  });

  const assets = webRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web-dist");
  app.use(express.static(assets));
  app.get("*splat", (_request, response) => response.sendFile(path.join(assets, "index.html")));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(409).json({ error: error instanceof Error ? error.message : "Unexpected error" });
  });
  return app;
}
