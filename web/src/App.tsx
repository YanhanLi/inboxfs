import { ArchiveRestore, Check, File, FolderInput, History, Inbox, RefreshCw, Search, ShieldCheck, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Suggestion { id: string; name: string; category: string; size: number; modifiedAt: string; destinationPath: string }
interface Scan { root: string; scannedAt: string; suggestions: Suggestion[]; categoryCounts: Record<string, number>; totalSize: number }
interface Record { id: string; createdAt: string; sourcePath: string; destinationPath: string; undoneAt?: string }

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const basename = (value: string) => value.split(/[\\/]/).pop() ?? value;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

export function App() {
  const [scan, setScan] = useState<Scan>();
  const [history, setHistory] = useState<Record[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All files");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [nextScan, nextHistory] = await Promise.all([json<Scan>("/api/scan"), json<Record[]>("/api/history")]);
      setScan(nextScan); setHistory(nextHistory); setSelected(new Set(nextScan.suggestions.map((item) => item.id)));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to scan folder"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => (scan?.suggestions ?? []).filter((item) =>
    (category === "All files" || item.category === category) && item.name.toLowerCase().includes(query.toLowerCase())), [scan, query, category]);
  const categories = ["All files", ...Object.keys(scan?.categoryCounts ?? {})];

  async function organize() {
    if (!selected.size) return;
    setBusy(true); setNotice("");
    try {
      const result = await json<{ moved: Record[] }>("/api/organize", { method: "POST", body: JSON.stringify({ ids: [...selected] }) });
      setNotice(`${result.moved.length} file${result.moved.length === 1 ? "" : "s"} organized.`);
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to organize files"); setBusy(false); }
  }

  async function undo(id: string) {
    setBusy(true); setNotice("");
    try { await json(`/api/undo/${id}`, { method: "POST" }); setNotice("File returned to its original location."); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to undo move"); setBusy(false); }
  }

  return <div className="shell">
    <aside>
      <div className="brand"><span><Inbox size={19} /></span> InboxFS</div>
      <nav>
        <button className="active"><FolderInput size={17} /> Inbox <b>{scan?.suggestions.length ?? 0}</b></button>
        <button onClick={() => document.getElementById("activity")?.scrollIntoView()}><History size={17} /> Activity</button>
      </nav>
      <div className="privacy"><ShieldCheck size={18} /><div><strong>Local by default</strong><small>Files never leave this computer.</small></div></div>
    </aside>
    <main>
      <header><div><h1>File inbox</h1><p title={scan?.root}>{scan?.root ?? "Scanning..."}</p></div><button className="icon" title="Scan again" onClick={() => { setNotice(""); void refresh(); }} disabled={busy}><RefreshCw size={18} className={busy ? "spin" : ""} /></button></header>
      <section className="summary">
        <div><small>Ready to organize</small><strong>{scan?.suggestions.length ?? 0}</strong></div>
        <div><small>Selected size</small><strong>{formatSize((scan?.suggestions ?? []).filter(x => selected.has(x.id)).reduce((n, x) => n + x.size, 0))}</strong></div>
        <div><small>Destinations</small><strong>{Object.keys(scan?.categoryCounts ?? {}).length}</strong></div>
      </section>
      <div className="toolbar">
        <label><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter files" /></label>
        <select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select>
        <button className="primary" disabled={busy || !selected.size} onClick={() => void organize()}><ArchiveRestore size={17} /> Organize {selected.size}</button>
      </div>
      {notice && <div className="notice">{notice}</div>}
      <section className="filelist">
        <div className="listhead"><input type="checkbox" checked={filtered.length > 0 && filtered.every(x => selected.has(x.id))} onChange={e => setSelected(e.target.checked ? new Set([...selected, ...filtered.map(x => x.id)]) : new Set([...selected].filter(id => !filtered.some(x => x.id === id))))} /><span>File</span><span>Destination</span><span>Size</span></div>
        {filtered.map(item => <div className="row" key={item.id}>
          <input type="checkbox" checked={selected.has(item.id)} onChange={() => setSelected(current => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} />
          <div className="filename"><File size={18} /><span><strong>{item.name}</strong><small>{new Date(item.modifiedAt).toLocaleDateString()}</small></span></div>
          <span className="destination"><Check size={14} /> {item.category}</span><span>{formatSize(item.size)}</span>
        </div>)}
        {!busy && !filtered.length && <div className="empty"><Inbox size={28} /><strong>Inbox is clear</strong><span>No loose files match this view.</span></div>}
      </section>
      <section className="activity" id="activity"><div className="section-title"><h2>Recent activity</h2><span>{history.length} moves</span></div>
        {history.slice(0, 8).map(record => <div className="history-row" key={record.id}><div><strong>{basename(record.destinationPath)}</strong><small>{record.undoneAt ? "Returned to inbox" : `Moved to ${basename(record.destinationPath.split(/[\\/]/).slice(0, -1).join("/"))}`}</small></div><time>{new Date(record.createdAt).toLocaleString()}</time><button className="icon" title="Undo move" disabled={busy || Boolean(record.undoneAt)} onClick={() => void undo(record.id)}><Undo2 size={16} /></button></div>)}
        {!history.length && <p className="muted">Organized files will appear here.</p>}
      </section>
    </main>
  </div>;
}
