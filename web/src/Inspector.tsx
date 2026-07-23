import { Clock3, Copy, File, FileSearch, FolderClosed, Hash, MapPin, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Suggestion } from "./types";

interface InspectorProps {
  item: Suggestion;
  included: boolean;
  onClose: () => void;
  onSelected: (value: boolean) => void;
}

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default function Inspector({ item, included, onClose, onSelected }: InspectorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);

  return <dialog className="inspector" ref={dialogRef} aria-labelledby="inspector-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <div className="inspector-panel">
      <header className="inspector-header"><div><span>File review</span><h2 id="inspector-title">Details</h2></div><button className="icon-button" aria-label="Close file details" title="Close" onClick={onClose}><X size={18} /></button></header>
      <div className="inspector-file"><span><FileSearch size={22} aria-hidden="true" /></span><div><strong title={item.name}>{item.name}</strong><small>{item.category} · {formatSize(item.size)}</small></div></div>

      <section className="inspector-section" aria-labelledby="location-heading"><h3 id="location-heading">Location</h3><dl>
        <div><dt><MapPin size={14} aria-hidden="true" />Source</dt><dd title={item.sourcePath}>{item.sourcePath}</dd></div>
        <div><dt><FolderClosed size={14} aria-hidden="true" />Destination</dt><dd title={item.destinationPath}>{item.destinationPath}</dd></div>
        <div><dt><Clock3 size={14} aria-hidden="true" />Modified</dt><dd>{new Date(item.modifiedAt).toLocaleString()}</dd></div>
      </dl></section>

      <section className="inspector-section rule-section" aria-labelledby="rule-heading"><div className="inspector-section-title"><h3 id="rule-heading">Classification rule</h3><span className={`rule-badge ${item.classification.type}`}>{item.classification.pattern}</span></div><p>{item.classification.explanation}</p>{item.classification.source && <small className="rule-source"><File size={13} aria-hidden="true" />{item.classification.ruleName} · {item.classification.source}</small>}</section>

      {item.classification.type === "local-ai" && <section className="inspector-section ai-provenance" aria-labelledby="ai-provenance-heading"><h3 id="ai-provenance-heading">Local analysis</h3><p>{item.classification.textBytes ? `${formatSize(item.classification.textBytes)} of ${item.classification.textSource === "pdf" ? "PDF" : item.classification.textSource === "docx" ? "DOCX" : "plain-text"} text was extracted on this device.` : "Only file metadata was used."}{item.classification.cached ? " This result came from the private local cache." : " No file content was stored in the result cache."}</p></section>}

      {item.duplicateOf && <section className="inspector-section duplicate-section" aria-labelledby="duplicate-heading"><h3 id="duplicate-heading">Duplicate match</h3><p title={item.duplicateOf}>{item.duplicateOf}</p>{item.duplicateHash && <code><Hash size={13} aria-hidden="true" />{item.duplicateHash}</code>}</section>}

      <section className="inspector-section plan-control" aria-labelledby="plan-heading"><div><h3 id="plan-heading">Organization plan</h3><p>{included ? "Included in the next organization run." : item.duplicateOf ? "Held back because identical content already exists." : "Not included in the next organization run."}</p></div><label><span>{included ? "Included" : "Excluded"}</span><input type="checkbox" checked={included} onChange={(event) => onSelected(event.target.checked)} /></label></section>
    </div>
  </dialog>;
}
