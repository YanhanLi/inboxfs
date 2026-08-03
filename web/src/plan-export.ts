import type { Suggestion } from "./types";

export interface ExportedPlanItem {
  name: string;
  destination: string;
  sizeBytes: number;
  basis: string;
  duplicate: boolean;
}

export interface ExportedPlan {
  version: 1;
  generator: "InboxFS";
  summary: {
    files: number;
    totalBytes: number;
    destinations: string[];
  };
  items: ExportedPlanItem[];
}

function classificationBasis(item: Suggestion): string {
  const classification = item.classification;
  if (classification.type === "local-ai") {
    const confidence = classification.confidence === undefined ? "" : ` (${Math.round(classification.confidence * 100)}%)`;
    return `Local AI${confidence}`;
  }
  if (classification.type === "custom") return `Custom rule: ${classification.ruleName ?? classification.pattern}`;
  if (classification.type === "fallback") return `Fallback: ${classification.pattern}`;
  return `Extension: ${classification.pattern}`;
}

export function buildExportedPlan(suggestions: Suggestion[], selected: ReadonlySet<string>): ExportedPlan {
  const items = suggestions
    .filter((item) => selected.has(item.id))
    .map((item) => ({
      name: item.name,
      destination: item.category,
      sizeBytes: item.size,
      basis: classificationBasis(item),
      duplicate: Boolean(item.duplicateOf),
    }))
    .sort((first, second) => first.name < second.name ? -1 : first.name > second.name ? 1 : 0);
  return {
    version: 1,
    generator: "InboxFS",
    summary: {
      files: items.length,
      totalBytes: items.reduce((total, item) => total + item.sizeBytes, 0),
      destinations: [...new Set(items.map((item) => item.destination))].sort(),
    },
    items,
  };
}

export function serializePlanJson(plan: ExportedPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

function escapeMarkdownCell(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("`", "\\`")
    .replace(/\r?\n/g, "<br>");
}

export function serializePlanMarkdown(plan: ExportedPlan): string {
  const destinations = plan.summary.destinations.length ? plan.summary.destinations.map(escapeMarkdownCell).join(", ") : "None";
  const rows = plan.items.map((item) =>
    `| ${escapeMarkdownCell(item.name)} | ${escapeMarkdownCell(item.destination)} | ${item.sizeBytes} | ${escapeMarkdownCell(item.basis)} | ${item.duplicate ? "Yes" : "No"} |`);
  return [
    "# InboxFS organization plan",
    "",
    "This report contains file names and planned destinations only. Absolute paths and file contents are excluded.",
    "",
    `- Files: ${plan.summary.files}`,
    `- Total bytes: ${plan.summary.totalBytes}`,
    `- Destinations: ${destinations}`,
    "",
    "| File | Destination | Bytes | Basis | Duplicate |",
    "| --- | --- | ---: | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
