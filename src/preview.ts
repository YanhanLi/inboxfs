import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { explainClassification, extensionOf } from "./classifier.js";
import { configDocument, parseInboxConfig, readInboxConfig, type ConfigDocument, type CustomRule } from "./config.js";
import { ruleConditionKey, ruleMatches, type FileFacts } from "./rules.js";

export interface RuleDiagnostic {
  type: "overlap" | "shadowed";
  message: string;
}

export interface RulePreview {
  index: number;
  name: string;
  enabled: boolean;
  matchCount: number;
  candidateCount: number;
  samples: string[];
  diagnostics: RuleDiagnostic[];
}

export interface ConfigPreview {
  config: ConfigDocument;
  summary: { totalFiles: number; matchedFiles: number; changedFiles: number; unmatchedFiles: number };
  rules: RulePreview[];
  changes: Array<{ name: string; fromDestination: string; toDestination: string; fromRule?: string; toRule?: string }>;
}

async function looseFiles(root: string): Promise<FileFacts[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: FileFacts[] = [];
  for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
    if (!entry.isFile() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    const metadata = await stat(path.join(root, entry.name));
    files.push({ name: entry.name, extension: extensionOf(entry.name), size: metadata.size });
  }
  return files;
}

function staticShadow(rule: CustomRule, earlier: CustomRule[]): boolean {
  const key = ruleConditionKey(rule);
  return rule.enabled && earlier.some((candidate) => candidate.enabled && ruleConditionKey(candidate) === key);
}

export async function previewInboxConfig(root: string, input: unknown): Promise<ConfigPreview> {
  const canonicalRoot = await realpath(root);
  const proposed = parseInboxConfig(input);
  const current = await readInboxConfig(canonicalRoot);
  const files = await looseFiles(canonicalRoot);
  const candidateCounts = proposed.rules.map(() => 0);
  const matchCounts = proposed.rules.map(() => 0);
  const samples = proposed.rules.map((): string[] => []);
  const changes: ConfigPreview["changes"] = [];
  let matchedFiles = 0;
  let changedFiles = 0;

  for (const file of files) {
    proposed.rules.forEach((rule, index) => {
      if (ruleMatches(rule, file)) candidateCounts[index] += 1;
    });
    const before = explainClassification(file.name, current.rules, file.size);
    const after = explainClassification(file.name, proposed.rules, file.size);
    const winner = proposed.rules.findIndex((rule) => rule.name === after.classification.ruleName);
    if (winner >= 0) {
      matchedFiles += 1;
      matchCounts[winner] += 1;
      if (samples[winner].length < 3) samples[winner].push(file.name);
    }
    if (before.category !== after.category) {
      changedFiles += 1;
      if (changes.length < 100) changes.push({ name: file.name, fromDestination: before.category, toDestination: after.category, fromRule: before.classification.ruleName, toRule: after.classification.ruleName });
    }
  }

  const rules = proposed.rules.map((rule, index): RulePreview => {
    const hiddenMatches = candidateCounts[index] - matchCounts[index];
    const diagnostics: RuleDiagnostic[] = [];
    if (staticShadow(rule, proposed.rules.slice(0, index)) || (candidateCounts[index] > 0 && matchCounts[index] === 0)) {
      diagnostics.push({ type: "shadowed", message: "This rule is fully shadowed by a higher-priority rule for the current inbox." });
    } else if (hiddenMatches > 0) {
      diagnostics.push({ type: "overlap", message: `${hiddenMatches} matching file${hiddenMatches === 1 ? " is" : "s are"} captured by higher-priority rules.` });
    }
    return { index, name: rule.name, enabled: rule.enabled, matchCount: matchCounts[index], candidateCount: candidateCounts[index], samples: samples[index], diagnostics };
  });

  return {
    config: configDocument(proposed),
    summary: { totalFiles: files.length, matchedFiles, changedFiles, unmatchedFiles: files.length - matchedFiles },
    rules,
    changes,
  };
}
