import {
  AlertTriangle,
  ArchiveRestore,
  ArrowUpDown,
  Check,
  ClipboardCheck,
  Copy,
  FolderClosed,
  FolderInput,
  HardDrive,
  History,
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
import type { AiDecision, MoveRecord, RuleDocument, Scan, Suggestion } from "./types";

const RulesDialog = lazy(() => import("./RulesDialog").catch(() => import("./LoadError")));
const Inspector = lazy(() => import("./Inspector").catch(() => import("./LoadError")));
const Summary = lazy(() => import("./Summary").catch(() => import("./LoadError")));
const Activity = lazy(() => import("./Activity").catch(() => import("./LoadError")));
const FileRows = lazy(() => import("./FileRows").catch(() => import("./LoadError")));
const AiDialog = lazy(() => import("./AiDialog").catch(() => import("./LoadError")));
const PlanSummary = lazy(() => import("./PlanSummary").catch(() => import("./LoadError")));

type Theme = "light" | "dark";
type SortOption = "name-asc" | "modified-desc" | "size-desc" | "destination-asc";

const asyncFallback = <div className="async-loading" role="status"><span>Loading</span></div>;

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("inboxfs-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Use the system preference when storage is unavailable. */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const [scan, setScan] = useState<Scan>();
  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All files");
  const [sort, setSort] = useState<SortOption>("name-asc");
  const [inspectedId, setInspectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [scanError, setScanError] = useState("");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [rulesOpen, setRulesOpen] = useState<RuleDocument | boolean>(false);
  const [aiOpen, setAiOpen] = useState(false);
  const aiPlan = useRef<{ jobId: string; decisions: AiDecision[] }>();
  const selectionOverrides = useRef<Map<string, boolean>>(new Map());
  const refreshSequence = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#151719" : "#f4f5f6");
    try { localStorage.setItem("inboxfs-theme", theme); } catch { /* Theme still applies for this session. */ }
  }, [theme]);
  useEffect(() => {
    if (scan && inspectedId && !scan.suggestions.some((item) => item.id === inspectedId)) setInspectedId(undefined);
  }, [scan, inspectedId]);

  const refresh = useCallback(async (preserveSelection = false) => {
    const sequence = ++refreshSequence.current;
    setBusy(true);
    try {
      const [nextScan, nextHistory] = await Promise.all([json<Scan>("/api/scan"), json<MoveRecord[]>("/api/history")]);
      if (sequence !== refreshSequence.current) return;
      setScan(nextScan); setHistory(nextHistory);
      aiPlan.current = undefined;
      setScanError("");
      if (!preserveSelection) selectionOverrides.current.clear();
      const available = new Set(nextScan.suggestions.map((item) => item.id));
      for (const id of selectionOverrides.current.keys()) {
        if (!available.has(id)) selectionOverrides.current.delete(id);
      }
      setSelected(new Set(nextScan.suggestions
        .filter((item) => selectionOverrides.current.get(item.id) ?? item.selected)
        .map((item) => item.id)));
    } catch (error) {
      if (sequence === refreshSequence.current) setScanError(error instanceof Error ? error.message : "Unable to scan folder");
    } finally {
      if (sequence === refreshSequence.current) setBusy(false);
    }
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

  function openRules() {
    setInspectedId(undefined);
    setRulesOpen(true);
  }

  function createRuleFromAi(rule: RuleDocument) {
    setAiOpen(false);
    setRulesOpen(rule);
  }

  function applyAiPlan(nextScan: Scan, jobId: string, decisions: AiDecision[]) {
    aiPlan.current = { jobId, decisions };
    setScan(nextScan);
    setSelected((current) => new Set([...current, ...decisions.map((item) => item.id)]));
    setNotice("Local suggestions added to the plan.");
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
      const ids = [...selected];
      const body = aiPlan.current ? (await import("./ai-plan")).organizeBody(ids, aiPlan.current) : { ids };
      const result = await json<{ moved: MoveRecord[] }>("/api/organize", { method: "POST", body: JSON.stringify(body) });
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
        <button onClick={() => setAiOpen(true)}><ClipboardCheck size={17} aria-hidden="true" /><span>Local AI</span></button>
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
          <button className="icon-button mobile-rules-button" aria-label="Review unmatched files with local AI" title="Local AI review" onClick={() => setAiOpen(true)}><ClipboardCheck size={18} /></button>
          <button className="icon-button" aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`} title="Change theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
          <button className="icon-button" aria-label="Scan folder again" title="Scan again" onClick={() => { setNotice(""); void refresh(); }} disabled={busy}><RefreshCw size={18} className={busy ? "spin" : ""} /></button>
        </div>
      </header>

      <Suspense fallback={<div className="summary summary-loading" role="status" aria-label="Loading inbox summary" />}>
        {scan ? <Summary files={scan.suggestions.length} selectedSize={selectedSize} duplicates={duplicateCount} /> : <div className="summary summary-loading" role="status" aria-label="Loading inbox summary" />}
      </Suspense>

      <section className="workspace" id="files" aria-labelledby="files-heading">
        <div className="section-heading">
          <div><h2 id="files-heading">{category}</h2><p>{filtered.length} of {scan?.suggestions.length ?? 0} files{scan?.ruleConfig.customRuleCount ? ` · ${scan.ruleConfig.customRuleCount} custom rule${scan.ruleConfig.customRuleCount === 1 ? "" : "s"}` : ""}</p></div>
          <label className="mobile-category"><span>View</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="toolbar">
          <label className="search-field"><span className="sr-only">Search files</span><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by file name" /></label>
          <label className="sort-field"><span className="sr-only">Sort files</span><ArrowUpDown size={16} aria-hidden="true" /><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="name-asc">Name A-Z</option><option value="modified-desc">Newest first</option><option value="size-desc">Largest first</option><option value="destination-asc">Destination</option></select></label>
          {selected.size > 0 && <button className="clear-button" onClick={() => setFilteredSelected(false)}>Clear selection</button>}
          <button className="primary" disabled={busy || !selected.size || Boolean(scanError)} onClick={organize}><ArchiveRestore size={17} aria-hidden="true" /><span>Organize {selected.size || "selected"}</span></button>
        </div>

        <Suspense fallback={<div className="plan-summary" aria-hidden="true" />}><PlanSummary suggestions={scan?.suggestions ?? []} selected={selected} selectedSize={selectedSize} duplicates={duplicateCount} /></Suspense>

        {scanError && <div className="scan-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{scanError}</span></div>}
        {notice && <div className="notice" role="status"><Check size={16} aria-hidden="true" /><span>{notice}</span></div>}
        <div className="filelist" aria-busy={busy && !scan}>
          <div className="listhead">
            <label className="checkbox-cell"><input aria-label="Select all visible files" type="checkbox" checked={allFilteredSelected} onChange={(event) => setFilteredSelected(event.target.checked)} /></label>
            <span>File</span><span>Destination</span><span>Size</span><span className="sr-only">Inspect</span>
          </div>
          {!scan && !scanError && [0, 1, 2, 3, 4].map((index) => <div className="row skeleton-row" key={index} aria-hidden="true"><span /><span /><span /><span /></div>)}
          {visible.length > 0 && <Suspense fallback={asyncFallback}><FileRows items={visible} selected={selected} inspectedId={inspectedId} onSelected={setItemSelected} onInspect={setInspectedId} /></Suspense>}
          {scan && !busy && !filtered.length && <div className="empty"><span><Inbox size={25} aria-hidden="true" /></span><strong>{query ? "No matching files" : "Inbox is clear"}</strong><p>{query ? "Try a different name or file view." : "No loose files match this view."}</p>{query && <button onClick={() => setQuery("")}>Clear search</button>}</div>}
          {!scan && scanError && <div className="empty error-empty"><span><AlertTriangle size={25} aria-hidden="true" /></span><strong>Preview unavailable</strong><p>Fix the local rule file, then scan again.</p><button onClick={() => void refresh()}>Scan again</button></div>}
        </div>
      </section>

      <Suspense fallback={asyncFallback}><Activity records={history} busy={busy} onUndo={undo} /></Suspense>
    </main>

    {inspected && <Suspense fallback={asyncFallback}><Inspector item={inspected} included={selected.has(inspected.id)} onClose={() => setInspectedId(undefined)} onSelected={(value) => setItemSelected(inspected.id, value)} /></Suspense>}

    {rulesOpen && <Suspense fallback={asyncFallback}><RulesDialog initialRule={rulesOpen === true ? undefined : rulesOpen} onClose={() => setRulesOpen(false)} onSaved={rulesSaved} /></Suspense>}
    {aiOpen && scan && <Suspense fallback={asyncFallback}><AiDialog scan={scan} selected={selected} onClose={() => setAiOpen(false)} onApplied={applyAiPlan} onCreateRule={createRuleFromAi} /></Suspense>}
  </div>;
}
