import { AlertTriangle, ArrowDown, ArrowUp, Plus, RefreshCw, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { json } from "./api";
import type { ConfigDocument, ConfigPreview, RuleDocument } from "./types";

interface RuleDraft {
  id: string;
  name: string;
  destination: string;
  enabled: boolean;
  extensions: string;
  nameGlobs: string;
  minBytes: string;
  maxBytes: string;
}
interface RulesDialogProps { onClose: () => void; onSaved: (count: number) => Promise<void>; initialRule?: RuleDocument }

let ruleSequence = 0;
const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const optionalBytes = (value: string) => value.trim() ? Number(value) : undefined;
const draftRule = (rule?: RuleDocument): RuleDraft => ({
  id: `rule-${Date.now()}-${ruleSequence++}`,
  name: rule?.name ?? "",
  destination: rule?.destination ?? "",
  enabled: rule?.enabled ?? true,
  extensions: rule?.match.extensions?.join(", ") ?? "",
  nameGlobs: rule?.match.nameGlobs?.join(", ") ?? "",
  minBytes: rule?.match.size?.minBytes?.toString() ?? "",
  maxBytes: rule?.match.size?.maxBytes?.toString() ?? "",
});

function documentFor(drafts: RuleDraft[]): ConfigDocument {
  return {
    version: 2,
    rules: drafts.map((draft) => {
      const extensions = list(draft.extensions);
      const nameGlobs = list(draft.nameGlobs);
      const minBytes = optionalBytes(draft.minBytes);
      const maxBytes = optionalBytes(draft.maxBytes);
      return {
        name: draft.name,
        destination: draft.destination,
        enabled: draft.enabled,
        match: {
          ...(extensions.length ? { extensions } : {}),
          ...(nameGlobs.length ? { nameGlobs } : {}),
          ...(minBytes === undefined && maxBytes === undefined ? {} : { size: { ...(minBytes === undefined ? {} : { minBytes }), ...(maxBytes === undefined ? {} : { maxBytes }) } }),
        },
      };
    }),
  };
}

function readyToPreview(drafts: RuleDraft[]) {
  return drafts.every((draft) => {
    const minimum = optionalBytes(draft.minBytes);
    const maximum = optionalBytes(draft.maxBytes);
    const hasCondition = list(draft.extensions).length > 0 || list(draft.nameGlobs).length > 0 || minimum !== undefined || maximum !== undefined;
    return draft.name.trim() && draft.destination.trim() && hasCondition && (minimum === undefined || (Number.isSafeInteger(minimum) && minimum >= 0)) && (maximum === undefined || (Number.isSafeInteger(maximum) && maximum >= 0)) && (minimum === undefined || maximum === undefined || minimum <= maximum);
  });
}

class ConfigReadError extends Error {
  constructor(message: string, readonly replaceAllowed: boolean) { super(message); }
}

async function readConfig(): Promise<ConfigDocument> {
  const response = await fetch("/api/config", { headers: { "Content-Type": "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new ConfigReadError(body.error ?? "Unable to open custom rules", response.status === 409);
  return body as ConfigDocument;
}

export default function RulesDialog({ onClose, onSaved, initialRule }: RulesDialogProps) {
  const [drafts, setDrafts] = useState<RuleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [replaceAllowed, setReplaceAllowed] = useState(false);
  const [preview, setPreview] = useState<ConfigPreview>();
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const previewSequence = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    void load();
  }, []);

  useEffect(() => {
    if (loading) return;
    const sequence = ++previewSequence.current;
    if (!readyToPreview(drafts)) {
      setPreview(undefined);
      setPreviewBusy(false);
      setPreviewError(drafts.length ? "Complete each rule and add at least one valid condition." : "");
      return;
    }
    setPreviewBusy(true);
    setPreviewError("");
    const timer = window.setTimeout(async () => {
      try {
        const result = await json<ConfigPreview>("/api/config/preview", { method: "POST", body: JSON.stringify(documentFor(drafts)) });
        if (sequence === previewSequence.current) setPreview(result);
      } catch (reason) {
        if (sequence === previewSequence.current) {
          setPreview(undefined);
          setPreviewError(reason instanceof Error ? reason.message : "Unable to preview custom rules");
        }
      } finally {
        if (sequence === previewSequence.current) setPreviewBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [drafts, loading]);

  async function load() {
    setLoading(true);
    setError("");
    setReplaceAllowed(false);
    setPreview(undefined);
    try {
      const config = await readConfig();
      setDrafts([...config.rules.map((rule) => draftRule(rule)), ...(initialRule ? [draftRule(initialRule)] : [])]);
      setDirty(Boolean(initialRule));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open custom rules");
      setReplaceAllowed(reason instanceof ConfigReadError && reason.replaceAllowed);
    } finally { setLoading(false); }
  }

  function close() {
    if (dirty && !window.confirm("Discard unsaved rule changes?")) return;
    onClose();
  }

  function change(next: RuleDraft[]) {
    setDrafts(next);
    setDirty(true);
    setError("");
  }

  function updateRule(id: string, field: keyof Omit<RuleDraft, "id">, value: string | boolean) {
    change(drafts.map((rule) => rule.id === id ? { ...rule, [field]: value } : rule));
  }

  function moveRule(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    [next[index], next[target]] = [next[target], next[index]];
    change(next);
  }

  async function save(nextDrafts = drafts) {
    setSaving(true);
    setError("");
    try {
      const config = await json<ConfigDocument>("/api/config", { method: "PUT", body: JSON.stringify(documentFor(nextDrafts)) });
      setDirty(false);
      await onSaved(config.rules.length);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save custom rules"); }
    finally { setSaving(false); }
  }

  function replaceBrokenConfig() {
    if (window.confirm("Replace the unreadable configuration with an empty rule set?")) void save([]);
  }

  const blocked = loading || saving;
  return <dialog className="rules-dialog" ref={dialogRef} aria-labelledby="rules-title" onCancel={(event) => { event.preventDefault(); close(); }} onClose={onClose}>
    <form className="rules-panel" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <header className="rules-header"><div><span>Classification</span><h2 id="rules-title">Custom rules</h2></div><button type="button" className="icon-button" aria-label="Close custom rules" title="Close" onClick={close}><X size={18} /></button></header>
      <div className="rules-body" aria-busy={blocked || previewBusy}>
        {loading && !drafts.length && !error && <div className="rules-loading"><RefreshCw className="spin" size={19} aria-hidden="true" /><span>Loading rules</span></div>}
        {error && <div className="rules-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{error}</span>{!drafts.length && <span className="rules-error-actions"><button type="button" onClick={() => void load()}>Try again</button>{replaceAllowed && <button type="button" onClick={replaceBrokenConfig}>Replace configuration</button>}</span>}</div>}
        {!loading && !drafts.length && !error && <div className="rules-empty"><SlidersHorizontal size={24} aria-hidden="true" /><strong>No custom rules</strong><button type="button" onClick={() => change([draftRule()])}>Add rule</button></div>}
        {(preview || previewBusy || previewError) && drafts.length > 0 && <section className="rules-impact" aria-live="polite">
          <div><strong>{preview ? `${preview.summary.matchedFiles} of ${preview.summary.totalFiles} files matched` : previewBusy ? "Updating impact" : "Impact unavailable"}</strong>{preview && <span>{preview.summary.changedFiles} destination change{preview.summary.changedFiles === 1 ? "" : "s"}</span>}</div>
          {previewBusy && <RefreshCw className="spin" size={15} aria-hidden="true" />}
          {previewError && !previewBusy && <small>{previewError}</small>}
          {preview && preview.changes.length > 0 && <ul>{preview.changes.slice(0, 3).map((change) => <li key={change.name}><b>{change.name}</b><span>{change.fromDestination} → {change.toDestination}</span></li>)}</ul>}
        </section>}
        {drafts.map((rule, index) => {
          const result = preview?.rules[index];
          return <fieldset className="rule-editor" key={rule.id} disabled={blocked}>
            <legend>Priority {index + 1}</legend>
            <div className="rule-controls">
              <label className="rule-enabled"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(rule.id, "enabled", event.target.checked)} /><span>Enabled</span></label>
              <button type="button" className="icon-button" aria-label={`Move ${rule.name || `rule ${index + 1}`} up`} title="Move up" disabled={blocked || index === 0} onClick={() => moveRule(index, -1)}><ArrowUp size={15} /></button>
              <button type="button" className="icon-button" aria-label={`Move ${rule.name || `rule ${index + 1}`} down`} title="Move down" disabled={blocked || index === drafts.length - 1} onClick={() => moveRule(index, 1)}><ArrowDown size={15} /></button>
              <button type="button" className="icon-button rule-delete" aria-label={`Delete ${rule.name || `rule ${index + 1}`}`} title="Delete rule" onClick={() => change(drafts.filter((item) => item.id !== rule.id))}><Trash2 size={15} /></button>
            </div>
            <label><span>Name</span><input value={rule.name} maxLength={80} required onChange={(event) => updateRule(rule.id, "name", event.target.value)} placeholder="Large reports" /></label>
            <label><span>Destination</span><input value={rule.destination} maxLength={100} required onChange={(event) => updateRule(rule.id, "destination", event.target.value)} placeholder="Reports" /></label>
            <label className="rule-wide"><span>Extensions</span><input value={rule.extensions} onChange={(event) => updateRule(rule.id, "extensions", event.target.value)} placeholder="pdf, docx" /></label>
            <label className="rule-wide"><span>File name globs</span><input value={rule.nameGlobs} onChange={(event) => updateRule(rule.id, "nameGlobs", event.target.value)} placeholder="report-*.pdf, invoice-????.pdf" /></label>
            <label><span>Minimum bytes</span><input type="number" min="0" step="1" value={rule.minBytes} onChange={(event) => updateRule(rule.id, "minBytes", event.target.value)} placeholder="0" /></label>
            <label><span>Maximum bytes</span><input type="number" min="0" step="1" value={rule.maxBytes} onChange={(event) => updateRule(rule.id, "maxBytes", event.target.value)} placeholder="No limit" /></label>
            {result && <div className="rule-result"><strong>{rule.enabled ? `${result.matchCount} match${result.matchCount === 1 ? "" : "es"}` : "Disabled"}</strong>{result.samples.length > 0 && <span>{result.samples.join(", ")}</span>}{result.diagnostics.map((diagnostic) => <small className={diagnostic.type} key={diagnostic.type}><AlertTriangle size={13} aria-hidden="true" />{diagnostic.message}</small>)}</div>}
          </fieldset>;
        })}
        {drafts.length > 0 && <button type="button" className="add-rule" disabled={blocked || drafts.length >= 100} onClick={() => change([...drafts, draftRule()])}><Plus size={16} aria-hidden="true" />Add rule</button>}
      </div>
      <footer className="rules-footer"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary" disabled={blocked || !dirty || !readyToPreview(drafts)}><Save size={16} aria-hidden="true" />{saving ? "Saving" : "Save rules"}</button></footer>
    </form>
  </dialog>;
}
