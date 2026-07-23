export interface AiModel {
  name: string;
  size: number;
  digest: string;
}

export interface AiSettings {
  enabled: boolean;
  model: string;
  includeText: boolean;
  destinations: string[];
}

export interface AiFileContext {
  name: string;
  extension: string;
  size: number;
  modifiedAt: string;
  text?: string;
  textBytes: number;
}

export interface AiClassification {
  destination: string;
  confidence: number;
  explanation: string;
}

export interface AiProvider {
  listModels(signal?: AbortSignal): Promise<AiModel[]>;
  classify(input: AiFileContext, destinations: string[], model: string, signal?: AbortSignal): Promise<unknown>;
}

export interface AiReviewItem {
  suggestionId: string;
  name: string;
  originalDestination: string;
  destination?: string;
  confidence?: number;
  explanation?: string;
  model: string;
  textBytes: number;
  cached?: boolean;
  status: "suggested" | "needs-review" | "failed";
  error?: string;
}

export interface AiJobSnapshot {
  id: string;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  createdAt: string;
  completedAt?: string;
  model: string;
  total: number;
  processed: number;
  results: AiReviewItem[];
  error?: string;
}
