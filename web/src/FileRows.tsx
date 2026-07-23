import { Clock3, Copy, File, FolderClosed, Info } from "lucide-react";
import type { Suggestion } from "./types";

interface FileRowsProps {
  items: Suggestion[];
  selected: Set<string>;
  inspectedId?: string;
  onSelected: (id: string, value: boolean) => void;
  onInspect: (id: string) => void;
}

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const basename = (value: string) => value.split(/[\\/]/).pop() ?? value;

export default function FileRows({ items, selected, inspectedId, onSelected, onInspect }: FileRowsProps) {
  return <>{items.map((item) => <div className={`row${selected.has(item.id) ? " selected" : ""}${inspectedId === item.id ? " inspected" : ""}`} key={item.id}>
    <label className="checkbox-cell"><input aria-label={`Select ${item.name}`} type="checkbox" checked={selected.has(item.id)} onChange={(event) => onSelected(item.id, event.target.checked)} /></label>
    <div className="filename"><span className="file-icon"><File size={18} aria-hidden="true" /></span><span><strong title={item.name}>{item.name}</strong><small><Clock3 size={12} aria-hidden="true" />{new Date(item.modifiedAt).toLocaleDateString()}</small></span></div>
    <div className={item.duplicateOf ? "destination duplicate" : "destination"}>
      <span>{item.duplicateOf ? <Copy size={13} aria-hidden="true" /> : <FolderClosed size={13} aria-hidden="true" />}{item.duplicateOf ? "Duplicate" : item.category}</span>
      {item.duplicateOf && <small title={item.duplicateOf}>{`Matches ${basename(item.duplicateOf)}`}</small>}
    </div>
    <span className="file-size">{formatSize(item.size)}</span>
    <button className="row-action" aria-label={`Inspect ${item.name}`} title="Inspect file" onClick={() => onInspect(item.id)}><Info size={16} /></button>
  </div>)}</>;
}
