import { History, Undo2 } from "lucide-react";

interface MoveRecord { id: string; createdAt: string; sourcePath: string; destinationPath: string; undoneAt?: string }
interface HistoryListProps { records: MoveRecord[]; busy: boolean; onUndo: (id: string) => void }

const basename = (value: string) => value.split(/[\\/]/).pop() ?? value;
const parentFolder = (value: string) => basename(value.split(/[\\/]/).slice(0, -1).join("/"));

export function HistoryList({ records, busy, onUndo }: HistoryListProps) {
  return <>{records.slice(0, 8).map((record) => <div className="history-row" key={record.id}>
    <span className="history-icon"><History size={16} aria-hidden="true" /></span>
    <div><strong>{basename(record.destinationPath)}</strong><small>{record.undoneAt ? "Returned to inbox" : `Moved to ${parentFolder(record.destinationPath)}`}</small></div>
    <time>{new Date(record.createdAt).toLocaleString()}</time>
    <button className="icon-button" aria-label={`Undo move of ${basename(record.destinationPath)}`} title="Undo move" disabled={busy || Boolean(record.undoneAt)} onClick={() => onUndo(record.id)}><Undo2 size={16} /></button>
  </div>)}</>;
}
