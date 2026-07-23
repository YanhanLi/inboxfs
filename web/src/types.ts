export interface Suggestion {
  id: string;
  name: string;
  extension: string;
  category: string;
  size: number;
  modifiedAt: string;
  sourcePath: string;
  destinationPath: string;
  classification: {
    type: "custom" | "extension" | "fallback" | "local-ai";
    pattern: string;
    explanation: string;
    ruleName?: string;
    source?: string;
    confidence?: number;
    textBytes?: number;
    cached?: boolean;
  };
  selected: boolean;
  duplicateOf?: string;
  duplicateHash?: string;
}

export interface Scan {
  root: string;
  scannedAt: string;
  suggestions: Suggestion[];
  categoryCounts: Record<string, number>;
  totalSize: number;
  ruleConfig: { version: 2; customRuleCount: number; source?: string; migratedFromVersion?: 1 };
}

export interface RuleMatchDocument {
  extensions?: string[];
  nameGlobs?: string[];
  size?: { minBytes?: number; maxBytes?: number };
}

export interface RuleDocument {
  name: string;
  destination: string;
  enabled: boolean;
  match: RuleMatchDocument;
}

export interface ConfigDocument { version: 2; rules: RuleDocument[] }

export interface ConfigPreview {
  config: ConfigDocument;
  summary: { totalFiles: number; matchedFiles: number; changedFiles: number; unmatchedFiles: number };
  rules: Array<{
    index: number;
    name: string;
    enabled: boolean;
    matchCount: number;
    candidateCount: number;
    samples: string[];
    diagnostics: Array<{ type: "overlap" | "shadowed"; message: string }>;
  }>;
  changes: Array<{ name: string; fromDestination: string; toDestination: string; fromRule?: string; toRule?: string }>;
}

export interface MoveRecord {
  id: string;
  createdAt: string;
  sourcePath: string;
  destinationPath: string;
  undoneAt?: string;
}

export interface AiSettings {
  enabled: boolean;
  model: string;
  includeText: boolean;
  destinations: string[];
}

export interface AiStatus {
  settings: AiSettings;
  available: boolean;
  models: Array<{ name: string; size: number; digest: string }>;
  error?: string;
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

export interface AiJob {
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

export interface AiDecision { id: string; destination: string }
export interface AiPlanItem extends AiDecision { destinationPath: string }
