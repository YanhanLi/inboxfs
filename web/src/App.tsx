import {
  AlertTriangle,
  ArchiveRestore,
  ArrowUpDown,
  Check,
  Clock3,
  ClipboardCheck,
  Copy,
  File,
  Files,
  FolderClosed,
  FolderInput,
  HardDrive,
  History,
  Info,
  Inbox,
  Moon,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { json } from "./api";

const RulesDialog = lazy(() => import("./RulesDialog").then((module) => ({ default: module.RulesDialog })));
const Inspector = lazy(() => import("./Inspector").then((module) => ({ default: module.Inspector })));
const HistoryList = lazy(() => import("./HistoryList").then((module) => ({ default: module.HistoryList })));

interface Suggestion { id: string; name: string; extension: string; category: string; size: number; modifiedAt: string; sourcePath: string; destinationPath: string; classification: { type: "custom" | "extension" | "fallback"; pattern: string; explanation: string; ruleName?: string; source?: string }; selected: boolean; duplicateOf?: string; duplicateHash?: string }
interface Scan { root: string; scannedAt: string; suggestions: Suggestion[]; categoryCounts: Record<string, number>; totalSize: number; ruleConfig: { customRuleCount: number; source?: string } }
interface Record { id: string; createdAt: string; sourcePath: string; destinationPath: string; undoneAt?: string }
type Theme = "light" | "dark";
type SortOption = "name-asc" | "modified-desc" | "size-desc" | "destination-asc";

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const basename = (value: string) => value.split(/[\\/]/).pop() ?? value;
const parentFolder = (value: string) => basename(value.split(/[\\/]/).slice(0, -1).join("/"));

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("inboxfs-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Use the system preference when storage is unavailable. */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const [scan, setScan] = useState<Scan>();
  const [history, setHistory] = useState<Record[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All files");
  const [sort, setSort] = useState<SortOption>("name-asc");
  const [inspectedId, setInspectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [scanError, setScanError] = useState("");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [rulesOpen, setRulesOpen] = useState(false);
  const selectionOverrides = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#151719" : "#f4f5f6");
    try { localStorage.setItem("inboxfs-theme", theme); } catch { /* Theme still applies for this session. */ }
  }, [theme]);
  useEffect(() => {
    if (scan && inspectedId && !scan.suggestions.some((item) => item.id === inspectedId)) setInspectedId(undefined);
  }, [scan, inspectedId]);

  const refresh = useCallback(async (preserveSelection = false) => {
    setBusy(true);
    try {
      const [nextScan, nextHistory] = await Promise.all([json<Scan>("/api/scan"), json<Record[]>("/api/history")]);
      setScan(nextScan); setHistory(nextHistory);
      setScanError("");
      if (!preserveSelection) selectionOverrides.current.clear();
      const available = new Set(nextScan.suggestions.map((item) => item.id));
      for (const id of selectionOverrides.current.keys()) {
        if (!available.has(id)) selectionOverrides.current.delete(id);
      }
      setSelected(new Set(nextScan.suggestions
        .filter((item) => selectionOverrides.current.get(item.id) ?? item.selected)
        .map((item) => item.id)));
    } catch (error) { setScanError(error instanceof Error ? error.message : "Unable to scan folder"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("changed", () => void refresh(true));
    return () => events.close();
  }, [refresh]);

  const filtered = useMemo(() => (scan?.suggestions ?? []).filter((item) =>
    (category === "All files" || (category === "Duplicates" ? Boolean(item.duplicateOf) : item.category === category)) && item.name.toLowerCase().includes(query.toLowerCase())), [scan, query, category]);
  const visible = useMemo(() => filtered.slice().sort((first, second) => {
    if (sort === "modified-desc") return new Date(second.modifiedAt).getTime() - new Date(first.modifiedAt).getTime();
    if (sort === "size-desc") return second.size - first.size || first.name.localeCompare(second.name);
    if (sort === "destination-asc") return first.category.localeCompare(second.category) || first.name.localeCompare(second.name);
    return first.name.localeCompare(second.name);
  }), [filtered, sort]);
  const duplicateCount = scan?.suggestions.filter((item) => item.duplicateOf).length ?? 0;
  const categories = ["All files", ...(duplicateCount ? ["Duplicates"] : []), ...Object.keys(scan?.categoryCounts ?? {})];
  const selectedSize = (scan?.suggestions ?? []).filter((item) => selected.has(item.id)).reduce((total, item) => total + item.size, 0);
  const selectedDestinations = new Set((scan?.suggestions ?? []).filter((item) => selected.has(item.id)).map((item) => parentFolder(item.destinationPath))).size;
  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));
  const inspected = scan?.suggestions.find((item) => item.id === inspectedId);

  function categoryCount(item: string) {
    if (item === "All files") return scan?.suggestions.length ?? 0;
    if (item === "Duplicates") return duplicateCount;
    return scan?.categoryCounts[item] ?? 0;
  }

  function setItemSelected(id: string, value: boolean) {
    selectionOverrides.current.set(id, value);
    setSelected((current) => {
      const next = new Set(current);
      value ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function setFilteredSelected(value: boolean) {
    for (const item of filtered) selectionOverrides.current.set(item.id, value);
    setSelected((current) => {
      const next = new Set(current);
      for (const item of filtered) value ? next.add(item.id) : next.delete(item.id);
      return next;
    });
  }

  function toggleTheme() {
    setTheme((current) => current === "light" ? "dark" : "light");
  }

  function openRules() {
    setInspectedId(undefined);
    setRulesOpen(true);
  }

  async function rulesSaved(count: number) {
    setRulesOpen(false);
    setNotice(`${count} custom rule${count === 1 ? "" : "s"} saved.`);
    await refresh(true);
  }

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
    <a className="skip-link" href="#main-content">Skip to files</a>
    <aside className="sidebar">
      <div className="brand"><span><Inbox size={18} aria-hidden="true" /></span><div>InboxFS<small>Local file desk</small></div></div>
      <nav aria-label="File views">
        <p className="nav-label">Library</p>
        {categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => { setCategory(item); document.getElementById("files")?.scrollIntoView(); }}>
          {item === "All files" ? <FolderInput size={17} aria-hidden="true" /> : item === "Duplicates" ? <Copy size={17} aria-hidden="true" /> : <FolderClosed size={17} aria-hidden="true" />}
          <span>{item}</span><b>{categoryCount(item)}</b>
        </button>)}
        <p className="nav-label nav-label-secondary">Workspace</p>
        <button onClick={openRules}><SlidersHorizontal size={17} aria-hidden="true" /><span>Rules</span><b>{scan?.ruleConfig.customRuleCount ?? 0}</b></button>
        <button onClick={() => document.getElementById("activity")?.scrollIntoView()}><History size={17} aria-hidden="true" /><span>Activity</span></button>
      </nav>
      <div className="privacy"><ShieldCheck size={18} aria-hidden="true" /><div><strong>On-device only</strong><small>Nothing is uploaded.</small></div></div>
    </aside>

    <main id="main-content">
      <header className="topbar">
        <div className="page-title"><span className="eyebrow">Workspace</span><h1>File inbox</h1><p title={scan?.root}><HardDrive size={14} aria-hidden="true" />{scan?.root ?? "Scanning folder..."}</p></div>
        <div className="scan-status">
          <span className="status-dot" aria-hidden="true" />
          <div><strong>{busy ? "Scanning" : "Watching"}</strong><small>{scan ? `Updated ${new Date(scan.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Connecting"}</small></div>
          <button className="icon-button mobile-rules-button" aria-label="Edit classification rules" title="Edit rules" onClick={openRules}><SlidersHorizontal size={18} /></button>
          <button className="icon-button" aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`} title={`Use ${theme === "light" ? "dark" : "light"} theme`} onClick={toggleTheme}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
          <button className="icon-button" aria-label="Scan folder again" title="Scan again" onClick={() => { setNotice(""); void refresh(); }} disabled={busy}><RefreshCw size={18} className={busy ? "spin" : ""} /></button>
        </div>
      </header>

      <section className="summary" aria-label="Inbox summary">
        <div><span className="metric-icon metric-ready"><Files size={18} aria-hidden="true" /></span><span><small>Ready</small><strong>{scan?.suggestions.length ?? 0}<em> files</em></strong></span></div>
        <div><span className="metric-icon metric-size"><HardDrive size={18} aria-hidden="true" /></span><span><small>Selected</small><strong>{formatSize(selectedSize)}</strong></span></div>
        <div><span className={`metric-icon metric-duplicate${duplicateCount ? "" : " is-empty"}`}><Copy size={18} aria-hidden="true" /></span><span><small>Held back</small><strong>{duplicateCount}<em> duplicates</em></strong></span></div>
      </section>

      <section className="workspace" id="files" aria-labelledby="files-heading">
        <div className="section-heading">
          <div><h2 id="files-heading">{category}</h2><p>{filtered.length} of {scan?.suggestions.length ?? 0} files{scan?.ruleConfig.customRuleCount ? ` · ${scan.ruleConfig.customRuleCount} custom rule${scan.ruleConfig.customRuleCount === 1 ? "" : "s"}` : ""}</p></div>
          <label className="mobile-category"><span>View</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="toolbar">
          <label className="search-field"><span className="sr-only">Search files</span><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by file name" /></label>
          <label className="sort-field"><span className="sr-only">Sort files</span><ArrowUpDown size={16} aria-hidden="true" /><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="name-asc">Name A-Z</option><option value="modified-desc">Newest first</option><option value="size-desc">Largest first</option><option value="destination-asc">Destination</option></select></label>
          {selected.size > 0 && <button className="clear-button" onClick={() => setFilteredSelected(false)}>Clear selection</button>}
          <button className="primary" disabled={busy || !selected.size || Boolean(scanError)} onClick={() => void organize()}><ArchiveRestore size={17} aria-hidden="true" /><span>Organize {selected.size || "selected"}</span></button>
        </div>

        <div className="plan-summary" aria-live="polite">
          <ClipboardCheck size={18} aria-hidden="true" />
          <div><strong>{selected.size ? `${selected.size} file${selected.size === 1 ? "" : "s"} in this plan` : "No files selected"}</strong><small>{selected.size ? `${formatSize(selectedSize)} across ${selectedDestinations} destination${selectedDestinations === 1 ? "" : "s"}` : "Select files to build an organization plan."}</small></div>
          {duplicateCount > 0 && <span><Copy size={13} aria-hidden="true" />{duplicateCount} held back</span>}
        </div>

        {scanError && <div className="scan-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{scanError}</span></div>}
        {notice && <div className="notice" role="status"><Check size={16} aria-hidden="true" /><span>{notice}</span></div>}
        <div className="filelist" aria-busy={busy && !scan}>
          <div className="listhead">
            <label className="checkbox-cell"><input aria-label="Select all visible files" type="checkbox" checked={allFilteredSelected} onChange={(event) => setFilteredSelected(event.target.checked)} /></label>
            <span>File</span><span>Destination</span><span>Size</span><span className="sr-only">Inspect</span>
          </div>
          {!scan && !scanError && Array.from({ length: 5 }, (_, index) => <div className="row skeleton-row" key={index} aria-hidden="true"><span /><span /><span /><span /></div>)}
          {visible.map((item) => <div className={`row${selected.has(item.id) ? " selected" : ""}${inspectedId === item.id ? " inspected" : ""}`} key={item.id}>
            <label className="checkbox-cell"><input aria-label={`Select ${item.name}`} type="checkbox" checked={selected.has(item.id)} onChange={(event) => setItemSelected(item.id, event.target.checked)} /></label>
            <div className="filename"><span className="file-icon"><File size={18} aria-hidden="true" /></span><span><strong title={item.name}>{item.name}</strong><small><Clock3 size={12} aria-hidden="true" />{new Date(item.modifiedAt).toLocaleDateString()}</small></span></div>
            <div className={item.duplicateOf ? "destination duplicate" : "destination"}>
              <span>{item.duplicateOf ? <Copy size={13} aria-hidden="true" /> : <FolderClosed size={13} aria-hidden="true" />}{item.duplicateOf ? "Duplicate" : item.category}</span>
              {item.duplicateOf && <small title={item.duplicateOf}>{`Matches ${basename(item.duplicateOf)}`}</small>}
            </div>
            <span className="file-size">{formatSize(item.size)}</span>
            <button className="row-action" aria-label={`Inspect ${item.name}`} title="Inspect file" onClick={() => setInspectedId(item.id)}><Info size={16} /></button>
          </div>)}
          {scan && !busy && !filtered.length && <div className="empty"><span><Inbox size={25} aria-hidden="true" /></span><strong>{query ? "No matching files" : "Inbox is clear"}</strong><p>{query ? "Try a different name or file view." : "No loose files match this view."}</p>{query && <button onClick={() => setQuery("")}>Clear search</button>}</div>}
          {!scan && scanError && <div className="empty error-empty"><span><AlertTriangle size={25} aria-hidden="true" /></span><strong>Preview unavailable</strong><p>Fix the local rule file, then scan again.</p><button onClick={() => void refresh()}>Scan again</button></div>}
        </div>
      </section>

      <section className="activity" id="activity" aria-labelledby="activity-heading">
        <div className="section-heading"><div><h2 id="activity-heading">Recent activity</h2><p>{history.length} moves recorded</p></div></div>
        <div className="history-list">
          {history.length > 0 && <Suspense fallback={null}><HistoryList records={history} busy={busy} onUndo={(id) => void undo(id)} /></Suspense>}
          {!history.length && <div className="activity-empty"><History size={18} aria-hidden="true" /><span>Organized files will appear here.</span></div>}
        </div>
      </section>
    </main>

    {inspected && <Suspense fallback={null}><Inspector item={inspected} included={selected.has(inspected.id)} onClose={() => setInspectedId(undefined)} onSelected={(value) => setItemSelected(inspected.id, value)} /></Suspense>}

    {rulesOpen && <Suspense fallback={null}><RulesDialog onClose={() => setRulesOpen(false)} onSaved={rulesSaved} /></Suspense>}
  </div>;
}
