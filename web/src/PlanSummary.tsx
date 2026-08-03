import { ClipboardCheck, Copy, Download } from "lucide-react";
import { useState } from "react";
import { buildExportedPlan, serializePlanJson, serializePlanMarkdown } from "./plan-export";
import type { Suggestion } from "./types";

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const parentFolder = (value: string) => value.split(/[\\/]/).slice(0, -1).pop() ?? value;

export default function PlanSummary({ suggestions, selected, selectedSize, duplicates }: { suggestions: Suggestion[]; selected: Set<string>; selectedSize: number; duplicates: number }) {
  const [format, setFormat] = useState<"markdown" | "json">("markdown");
  const destinations = new Set(suggestions.filter((item) => selected.has(item.id)).map((item) => parentFolder(item.destinationPath))).size;

  function downloadPlan() {
    const plan = buildExportedPlan(suggestions, selected);
    const markdown = format === "markdown";
    const content = markdown ? serializePlanMarkdown(plan) : serializePlanJson(plan);
    const url = URL.createObjectURL(new Blob([content], { type: markdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `inboxfs-plan.${markdown ? "md" : "json"}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return <div className="plan-summary" aria-live="polite">
    <ClipboardCheck size={18} aria-hidden="true" />
    <div className="plan-copy"><strong>{selected.size ? `${selected.size} file${selected.size === 1 ? "" : "s"} in this plan` : "No files selected"}</strong><small>{selected.size ? `${formatSize(selectedSize)} across ${destinations} destination${destinations === 1 ? "" : "s"}` : "Select files to build an organization plan."}</small></div>
    {duplicates > 0 && <span><Copy size={13} aria-hidden="true" />{duplicates} held back</span>}
    <div className="plan-export">
      <label><span className="sr-only">Plan export format</span><select aria-label="Plan export format" value={format} disabled={!selected.size} onChange={(event) => setFormat(event.target.value as "markdown" | "json")}><option value="markdown">Markdown</option><option value="json">JSON</option></select></label>
      <button type="button" disabled={!selected.size} onClick={downloadPlan}><Download size={14} aria-hidden="true" />Export</button>
    </div>
  </div>;
}
