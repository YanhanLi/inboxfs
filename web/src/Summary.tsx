import { Copy, Files, HardDrive } from "lucide-react";

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default function Summary({ files, selectedSize, duplicates }: { files: number; selectedSize: number; duplicates: number }) {
  return <section className="summary" aria-label="Inbox summary">
    <div><span className="metric-icon metric-ready"><Files size={18} aria-hidden="true" /></span><span><small>Ready</small><strong>{files}<em> files</em></strong></span></div>
    <div><span className="metric-icon metric-size"><HardDrive size={18} aria-hidden="true" /></span><span><small>Selected</small><strong>{formatSize(selectedSize)}</strong></span></div>
    <div><span className={`metric-icon metric-duplicate${duplicates ? "" : " is-empty"}`}><Copy size={18} aria-hidden="true" /></span><span><small>Held back</small><strong>{duplicates}<em> duplicates</em></strong></span></div>
  </section>;
}
