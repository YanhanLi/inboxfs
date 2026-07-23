import { ClipboardCheck, Copy } from "lucide-react";
import type { Suggestion } from "./types";

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const parentFolder = (value: string) => value.split(/[\\/]/).slice(0, -1).pop() ?? value;

export default function PlanSummary({ suggestions, selected, selectedSize, duplicates }: { suggestions: Suggestion[]; selected: Set<string>; selectedSize: number; duplicates: number }) {
  const destinations = new Set(suggestions.filter((item) => selected.has(item.id)).map((item) => parentFolder(item.destinationPath))).size;
  return <div className="plan-summary" aria-live="polite">
    <ClipboardCheck size={18} aria-hidden="true" />
    <div><strong>{selected.size ? `${selected.size} file${selected.size === 1 ? "" : "s"} in this plan` : "No files selected"}</strong><small>{selected.size ? `${formatSize(selectedSize)} across ${destinations} destination${destinations === 1 ? "" : "s"}` : "Select files to build an organization plan."}</small></div>
    {duplicates > 0 && <span><Copy size={13} aria-hidden="true" />{duplicates} held back</span>}
  </div>;
}
