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
    type: "custom" | "extension" | "fallback";
    pattern: string;
    explanation: string;
    ruleName?: string;
    source?: string;
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
