import { randomUUID } from "node:crypto";
import type { ScanResult } from "../model.js";
import { extractFileContext } from "./extractor.js";
import type { AiClassification, AiJobSnapshot, AiProvider, AiReviewItem, AiSettings } from "./types.js";
import { AiCache, aiCacheKey } from "./cache.js";

const MAX_JOB_FILES = 100;
const LOW_CONFIDENCE = 0.75;
const FILE_TIMEOUT_MS = 60_000;

interface StoredJob extends AiJobSnapshot {
  controller: AbortController;
  destinations: string[];
}

function validateClassification(input: unknown, destinations: string[]): AiClassification {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Local model returned an invalid result object.");
  const value = input as Record<string, unknown>;
  const unsupported = Object.keys(value).find((key) => !["destination", "confidence", "explanation"].includes(key));
  if (unsupported) throw new Error(`Local model returned unsupported field "${unsupported}".`);
  if (typeof value.destination !== "string" || !destinations.includes(value.destination)) throw new Error("Local model selected a destination outside the allowed list.");
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new Error("Local model returned an invalid confidence value.");
  if (typeof value.explanation !== "string" || !value.explanation.trim() || value.explanation.trim().length > 160 || /\p{Cc}/u.test(value.explanation)) throw new Error("Local model explanation must be 1 to 160 visible characters.");
  return { destination: value.destination, confidence: value.confidence, explanation: value.explanation.trim() };
}

function snapshot(job: StoredJob): AiJobSnapshot {
  const { controller: _controller, destinations: _destinations, ...publicJob } = job;
  return structuredClone(publicJob);
}

export class AiJobManager {
  private readonly jobs = new Map<string, StoredJob>();

  constructor(private readonly root: string, private readonly provider: AiProvider, private readonly cache?: AiCache) {}

  async start(scan: ScanResult, settings: AiSettings): Promise<AiJobSnapshot> {
    if (!settings.enabled) throw new Error("Enable local AI review before starting an analysis.");
    const models = await this.provider.listModels(AbortSignal.timeout(5_000));
    if (!models.some((model) => model.name === settings.model)) throw new Error("The selected model is not installed locally.");
    const candidates = scan.suggestions.filter((item) => item.classification.type === "fallback").slice(0, MAX_JOB_FILES);
    if (!candidates.length) throw new Error("No unmatched files are available for local AI review.");
    const job: StoredJob = {
      id: randomUUID(),
      status: "queued",
      createdAt: new Date().toISOString(),
      model: settings.model,
      total: candidates.length,
      processed: 0,
      results: [],
      controller: new AbortController(),
      destinations: [...settings.destinations],
    };
    this.jobs.set(job.id, job);
    while (this.jobs.size > 10) this.jobs.delete(this.jobs.keys().next().value as string);
    void this.run(job, candidates, settings);
    return snapshot(job);
  }

  get(id: string): AiJobSnapshot {
    const job = this.jobs.get(id);
    if (!job) throw new Error("AI review job was not found.");
    return snapshot(job);
  }

  cancel(id: string): AiJobSnapshot {
    const job = this.jobs.get(id);
    if (!job) throw new Error("AI review job was not found.");
    if (job.status === "queued" || job.status === "running") {
      job.status = "cancelled";
      job.completedAt = new Date().toISOString();
      job.controller.abort();
    }
    return snapshot(job);
  }

  validateDecisions(id: string, decisions: unknown): Map<string, string> {
    const job = this.jobs.get(id);
    if (!job || job.status !== "completed") throw new Error("AI review must complete before its suggestions can be used.");
    if (!Array.isArray(decisions) || decisions.length > job.results.length) throw new Error("AI decisions must be an array of reviewed suggestions.");
    const results = new Map(job.results.map((item) => [item.suggestionId, item]));
    const overrides = new Map<string, string>();
    for (const decision of decisions) {
      if (!decision || typeof decision !== "object" || Array.isArray(decision)) throw new Error("Each AI decision must contain an id and destination.");
      const value = decision as Record<string, unknown>;
      const result = typeof value.id === "string" ? results.get(value.id) : undefined;
      if (!result || result.status === "failed" || typeof value.destination !== "string" || !job.destinations.includes(value.destination)) throw new Error("AI decision does not match the completed review job.");
      if (overrides.has(value.id)) throw new Error("AI decisions cannot contain duplicate files.");
      overrides.set(value.id, value.destination);
    }
    return overrides;
  }

  private async run(job: StoredJob, candidates: ScanResult["suggestions"], settings: AiSettings): Promise<void> {
    job.status = "running";
    try {
      for (const item of candidates) {
        if (job.controller.signal.aborted) break;
        let result: AiReviewItem;
        try {
          const context = await extractFileContext(this.root, item, settings.includeText);
          if (job.controller.signal.aborted) break;
          const key = aiCacheKey(this.root, settings.model, settings.destinations, context);
          const cachedInput = await this.cache?.get(key);
          const cached = cachedInput ? validateClassification(cachedInput, settings.destinations) : undefined;
          const signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(FILE_TIMEOUT_MS)]);
          const classification = cached ?? validateClassification(await this.provider.classify(context, settings.destinations, settings.model, signal), settings.destinations);
          if (!cached) await this.cache?.set(key, classification);
          result = {
            suggestionId: item.id,
            name: item.name,
            originalDestination: item.category,
            destination: classification.destination,
            confidence: classification.confidence,
            explanation: classification.explanation,
            model: settings.model,
            textBytes: context.textBytes,
            cached: Boolean(cached),
            status: classification.confidence < LOW_CONFIDENCE ? "needs-review" : "suggested",
          };
        } catch (error) {
          if (job.controller.signal.aborted) break;
          result = {
            suggestionId: item.id,
            name: item.name,
            originalDestination: item.category,
            model: settings.model,
            textBytes: 0,
            status: "failed",
            error: error instanceof Error ? error.message : "Local analysis failed.",
          };
        }
        job.results.push(result);
        job.processed += 1;
      }
      job.status = job.controller.signal.aborted ? "cancelled" : "completed";
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Local AI review failed.";
    } finally {
      job.completedAt = new Date().toISOString();
    }
  }
}
