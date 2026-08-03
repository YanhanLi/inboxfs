import { describe, expect, it } from "vitest";
import { buildExportedPlan, serializePlanJson, serializePlanMarkdown } from "../web/src/plan-export.js";
import type { Suggestion } from "../web/src/types.js";

const suggestions: Suggestion[] = [
  {
    id: "private-id-b",
    name: "notes.txt",
    extension: ".txt",
    category: "Documents",
    size: 12,
    modifiedAt: "2026-08-03T00:00:00.000Z",
    sourcePath: "/Users/private/Downloads/notes.txt",
    destinationPath: "/Users/private/Downloads/Documents/notes.txt",
    classification: { type: "extension", pattern: "*.txt", explanation: "private explanation" },
    selected: true,
    duplicateOf: "/Users/private/Documents/notes.txt",
    duplicateHash: "private-hash",
  },
  {
    id: "private-id-a",
    name: "alpha.xyzzy",
    extension: ".xyzzy",
    category: "Other",
    size: 5,
    modifiedAt: "2026-08-03T00:00:00.000Z",
    sourcePath: "/Users/private/Downloads/alpha.xyzzy",
    destinationPath: "/Users/private/Downloads/Other/alpha.xyzzy",
    classification: { type: "fallback", pattern: "*.xyzzy", explanation: "private explanation" },
    selected: true,
  },
];

describe("organization plan export", () => {
  it("builds a stable selected-only report without private paths or identifiers", () => {
    const first = buildExportedPlan(suggestions, new Set(suggestions.map((item) => item.id)));
    const second = buildExportedPlan(suggestions.slice().reverse(), new Set(suggestions.map((item) => item.id)));
    expect(first).toEqual(second);
    expect(first).toEqual({
      version: 1,
      generator: "InboxFS",
      summary: { files: 2, totalBytes: 17, destinations: ["Documents", "Other"] },
      items: [
        { name: "alpha.xyzzy", destination: "Other", sizeBytes: 5, basis: "Fallback: *.xyzzy", duplicate: false },
        { name: "notes.txt", destination: "Documents", sizeBytes: 12, basis: "Extension: *.txt", duplicate: true },
      ],
    });
    const serialized = JSON.stringify(first);
    for (const privateValue of ["/Users/private", "private-id", "private-hash", "private explanation"]) expect(serialized).not.toContain(privateValue);
  });

  it("exports only explicitly selected suggestions", () => {
    const report = buildExportedPlan(suggestions, new Set([suggestions[1].id]));
    expect(report.summary).toEqual({ files: 1, totalBytes: 5, destinations: ["Other"] });
    expect(report.items.map((item) => item.name)).toEqual(["alpha.xyzzy"]);
  });

  it("serializes versioned JSON with stable formatting", () => {
    const plan = buildExportedPlan(suggestions, new Set(suggestions.map((item) => item.id)));
    const output = serializePlanJson(plan);
    expect(output.endsWith("\n")).toBe(true);
    expect(JSON.parse(output)).toEqual(plan);
    expect(output).not.toContain("/Users/private");
  });

  it("serializes Markdown while neutralizing active or structural file-name content", () => {
    const malicious: Suggestion = {
      ...suggestions[0],
      id: "malicious",
      name: "<script>alert(1)</script>|`report`\n.pdf",
      category: "Review | Later",
      classification: { type: "custom", pattern: "*.pdf", ruleName: "<img src=x onerror=alert(1)>", explanation: "private" },
    };
    const output = serializePlanMarkdown(buildExportedPlan([malicious], new Set([malicious.id])));
    expect(output).toContain("# InboxFS organization plan");
    expect(output).toContain("Absolute paths and file contents are excluded.");
    expect(output).toContain("&lt;script&gt;alert(1)&lt;/script&gt;\\|\\`report\\`<br>.pdf");
    expect(output).toContain("Review \\| Later");
    expect(output).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(output).not.toContain("<script>");
    expect(output).not.toContain("/Users/private");
  });
});
