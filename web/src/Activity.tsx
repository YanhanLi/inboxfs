import { History } from "lucide-react";
import HistoryList from "./HistoryList";
import type { MoveRecord } from "./types";

interface ActivityProps { records: MoveRecord[]; busy: boolean; onUndo: (id: string) => void }

export default function Activity({ records, busy, onUndo }: ActivityProps) {
  return <section className="activity" id="activity" aria-labelledby="activity-heading">
    <div className="section-heading"><div><h2 id="activity-heading">Recent activity</h2><p>{records.length} moves recorded</p></div></div>
    <div className="history-list">
      {records.length > 0 && <HistoryList records={records} busy={busy} onUndo={onUndo} />}
      {!records.length && <div className="activity-empty"><History size={18} aria-hidden="true" /><span>Organized files will appear here.</span></div>}
    </div>
  </section>;
}
