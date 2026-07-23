import type { CustomRule } from "./config.js";

export interface FileFacts {
  name: string;
  extension: string;
  size: number;
}

export function matchesGlob(name: string, glob: string): boolean {
  if (/[\\/]/.test(name)) return false;
  const input = [...name.toLowerCase()];
  const pattern = [...glob.toLowerCase()];
  let inputIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let starInputIndex = -1;
  while (inputIndex < input.length) {
    if (patternIndex < pattern.length && (pattern[patternIndex] === "?" || pattern[patternIndex] === input[inputIndex])) {
      inputIndex += 1;
      patternIndex += 1;
    } else if (patternIndex < pattern.length && pattern[patternIndex] === "*") {
      starIndex = patternIndex;
      starInputIndex = inputIndex;
      patternIndex += 1;
    } else if (starIndex >= 0) {
      patternIndex = starIndex + 1;
      starInputIndex += 1;
      inputIndex = starInputIndex;
    } else {
      return false;
    }
  }
  while (patternIndex < pattern.length && pattern[patternIndex] === "*") patternIndex += 1;
  return patternIndex === pattern.length;
}

export function ruleMatches(rule: CustomRule, file: FileFacts): boolean {
  if (!rule.enabled) return false;
  if (rule.extensions.size && !rule.extensions.has(file.extension)) return false;
  if (rule.nameGlobs.length && !rule.nameGlobs.some((glob) => matchesGlob(file.name, glob))) return false;
  if (rule.minBytes !== undefined && file.size < rule.minBytes) return false;
  if (rule.maxBytes !== undefined && file.size > rule.maxBytes) return false;
  return true;
}

export function rulePattern(rule: CustomRule): string {
  const parts: string[] = [];
  if (rule.extensions.size) parts.push([...rule.extensions].map((extension) => `*.${extension}`).join(", "));
  if (rule.nameGlobs.length) parts.push(rule.nameGlobs.join(", "));
  if (rule.minBytes !== undefined || rule.maxBytes !== undefined) {
    parts.push(rule.minBytes !== undefined && rule.maxBytes !== undefined ? `${rule.minBytes}-${rule.maxBytes} B` : rule.minBytes !== undefined ? `>= ${rule.minBytes} B` : `<= ${rule.maxBytes} B`);
  }
  return parts.join(" + ");
}

export function ruleConditionKey(rule: CustomRule): string {
  return JSON.stringify({ extensions: [...rule.extensions].sort(), nameGlobs: [...rule.nameGlobs].map((item) => item.toLowerCase()).sort(), minBytes: rule.minBytes, maxBytes: rule.maxBytes });
}
