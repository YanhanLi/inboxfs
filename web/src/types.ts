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
  ruleConfig: { customRuleCount: number; source?: string };
}

export interface MoveRecord {
  id: string;
  createdAt: string;
  sourcePath: string;
  destinationPath: string;
  undoneAt?: string;
}
