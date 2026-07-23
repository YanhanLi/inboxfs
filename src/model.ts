export type Category =
  | "Documents"
  | "Images"
  | "Audio"
  | "Video"
  | "Archives"
  | "Installers"
  | "Code & Data"
  | "Fonts"
  | "Other";

export interface ClassificationMatch {
  type: "custom" | "extension" | "fallback";
  pattern: string;
  explanation: string;
  ruleName?: string;
  source?: string;
}

export interface FileSuggestion {
  id: string;
  name: string;
  extension: string;
  category: string;
  size: number;
  modifiedAt: string;
  sourcePath: string;
  destinationPath: string;
  classification: ClassificationMatch;
  selected: boolean;
  duplicateOf?: string;
  duplicateHash?: string;
}

export interface MoveRecord {
  id: string;
  batchId?: string;
  createdAt: string;
  sourcePath: string;
  destinationPath: string;
  contentHash: string;
  undoneAt?: string;
}

export interface ScanResult {
  root: string;
  scannedAt: string;
  suggestions: FileSuggestion[];
  categoryCounts: Record<string, number>;
  totalSize: number;
  ruleConfig: {
    version: 2;
    customRuleCount: number;
    source?: string;
    migratedFromVersion?: 1;
  };
}
