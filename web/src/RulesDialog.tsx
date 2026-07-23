import { AlertTriangle, Plus, RefreshCw, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { json } from "./api";

interface RuleDocument { name: string; destination: string; extensions: string[] }
interface ConfigDocument { version: 1; rules: RuleDocument[] }
interface RuleDraft { id: string; name: string; destination: string; extensions: string }
interface RulesDialogProps { onClose: () => void; onSaved: (count: number) => Promise<void> }

let ruleSequence = 0;
const draftRule = (rule?: RuleDocument): RuleDraft => ({ id: `rule-${Date.now()}-${ruleSequence++}`, name: rule?.name ?? "", destination: rule?.destination ?? "", extensions: rule?.extensions.join(", ") ?? "" });

class ConfigReadError extends Error {
  constructor(message: string, readonly replaceAllowed: boolean) { super(message); }
}

async function readConfig(): Promise<ConfigDocument> {
  const response = await fetch("/api/config", { headers: { "Content-Type": "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new ConfigReadError(body.error ?? "Unable to open custom rules", response.status === 409);
  return body as ConfigDocument;
}

export default function RulesDialog({ onClose, onSaved }: RulesDialogProps) {
  const [drafts, setDrafts] = useState<RuleDraft[]>([]);
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [replaceAllowed, setReplaceAllowed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    void load();
  }, []);

  async function load() {
    setBusy(true);
    setError("");
    setReplaceAllowed(false);
    try {
      const config = await readConfig();
      setDrafts(config.rules.map((rule) => draftRule(rule)));
      setDirty(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open custom rules");
      setReplaceAllowed(reason instanceof ConfigReadError && reason.replaceAllowed);
    } finally { setBusy(false); }
  }

  function close() {
    if (dirty && !window.confirm("Discard unsaved rule changes?")) return;
    onClose();
  }

  function updateRule(id: string, field: keyof Omit<RuleDraft, "id">, value: string) {
    setDrafts((current) => current.map((rule) => rule.id === id ? { ...rule, [field]: value } : rule));
    setDirty(true);
    setError("");
  }

  async function save(nextDrafts = drafts) {
    setBusy(true);
    setError("");
    try {
      const config = await json<ConfigDocument>("/api/config", {
        method: "PUT",
        body: JSON.stringify({ version: 1, rules: nextDrafts.map(({ name, destination, extensions }) => ({ name, destination, extensions: extensions.split(",").map((value) => value.trim()).filter(Boolean) })) }),
      });
      setDirty(false);
      await onSaved(config.rules.length);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save custom rules"); }
    finally { setBusy(false); }
  }

  function replaceBrokenConfig() {
    if (window.confirm("Replace the unreadable configuration with an empty rule set?")) void save([]);
  }

  return <dialog className="rules-dialog" ref={dialogRef} aria-labelledby="rules-title" onCancel={(event) => { event.preventDefault(); close(); }} onClose={onClose}>
    <form className="rules-panel" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <header className="rules-header"><div><span>Classification</span><h2 id="rules-title">Custom rules</h2></div><button type="button" className="icon-button" aria-label="Close custom rules" title="Close" onClick={close}><X size={18} /></button></header>
      <div className="rules-body" aria-busy={busy}>
        {busy && !drafts.length && !error && <div className="rules-loading"><RefreshCw className="spin" size={19} aria-hidden="true" /><span>Loading rules</span></div>}
        {error && <div className="rules-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{error}</span>{!drafts.length && <span className="rules-error-actions"><button type="button" onClick={() => void load()}>Try again</button>{replaceAllowed && <button type="button" onClick={replaceBrokenConfig}>Replace configuration</button>}</span>}</div>}
        {!busy && !drafts.length && !error && <div className="rules-empty"><SlidersHorizontal size={24} aria-hidden="true" /><strong>No custom rules</strong><button type="button" onClick={() => { setDrafts([draftRule()]); setDirty(true); }}>Add rule</button></div>}
        {drafts.map((rule, index) => <fieldset className="rule-editor" key={rule.id} disabled={busy}>
          <legend>Rule {index + 1}</legend>
          <button type="button" className="rule-delete" aria-label={`Delete rule ${index + 1}`} title="Delete rule" onClick={() => { setDrafts((current) => current.filter((item) => item.id !== rule.id)); setDirty(true); setError(""); }}><Trash2 size={16} /></button>
          <label><span>Name</span><input value={rule.name} maxLength={80} required onChange={(event) => updateRule(rule.id, "name", event.target.value)} placeholder="Reading" /></label>
          <label><span>Destination</span><input value={rule.destination} maxLength={100} required onChange={(event) => updateRule(rule.id, "destination", event.target.value)} placeholder="Reading" /></label>
          <label className="rule-extensions"><span>Extensions</span><input value={rule.extensions} required onChange={(event) => updateRule(rule.id, "extensions", event.target.value)} placeholder="epub, mobi, pdf" /></label>
        </fieldset>)}
        {drafts.length > 0 && <button type="button" className="add-rule" disabled={busy || drafts.length >= 100} onClick={() => { setDrafts((current) => [...current, draftRule()]); setDirty(true); }}><Plus size={16} aria-hidden="true" />Add rule</button>}
      </div>
      <footer className="rules-footer"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary" disabled={busy || !dirty}><Save size={16} aria-hidden="true" />{busy ? "Saving" : "Save rules"}</button></footer>
    </form>
  </dialog>;
}
