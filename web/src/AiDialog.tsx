import { AlertTriangle, Bot, Check, Database, FileText, Play, RefreshCw, Save, SlidersHorizontal, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { json } from "./api";
import type { AiDecision, AiJob, AiPlanItem, AiReviewItem, AiSettings, AiStatus, RuleDocument, Scan } from "./types";

interface AiDialogProps {
  scan: Scan;
  onClose: () => void;
  onApplied: (scan: Scan, jobId: string, decisions: AiDecision[]) => void;
  onCreateRule: (rule: RuleDocument) => void;
}

const terminal = new Set(["completed", "cancelled", "failed"]);
const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const destinationText = (settings?: AiSettings) => settings?.destinations.join(", ") ?? "";
const parseDestinations = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export default function AiDialog({ scan, onClose, onApplied, onCreateRule }: AiDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initializedJob = useRef("");
  const [status, setStatus] = useState<AiStatus>();
  const [draft, setDraft] = useState<AiSettings>();
  const [destinations, setDestinations] = useState("");
  const [job, setJob] = useState<AiJob>();
  const [choices, setChoices] = useState<Record<string, { accepted: boolean; destination: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const unmatched = useMemo(() => scan.suggestions.filter((item) => item.classification.type === "fallback"), [scan]);
  const settingsDirty = Boolean(status && draft && (JSON.stringify(status.settings) !== JSON.stringify({ ...draft, destinations: parseDestinations(destinations) })));

  useEffect(() => { dialogRef.current?.showModal(); void loadStatus(); }, []);
  useEffect(() => {
    if (!job || terminal.has(job.status)) return;
    const timer = window.setTimeout(async () => {
      try { setJob(await json<AiJob>(`/api/ai/jobs/${job.id}`)); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update local analysis"); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [job]);
  useEffect(() => {
    if (job?.status !== "completed" || initializedJob.current === job.id) return;
    initializedJob.current = job.id;
    setChoices(Object.fromEntries(job.results.filter((item) => item.destination).map((item) => [item.suggestionId, { accepted: (item.confidence ?? 0) >= 0.75, destination: item.destination! }])));
  }, [job]);

  async function loadStatus() {
    setLoading(true); setError("");
    try {
      const next = await json<AiStatus>("/api/ai/status");
      setStatus(next);
      const settings = { ...next.settings, model: next.settings.model || next.models[0]?.name || "" };
      setDraft(settings);
      setDestinations(destinationText(settings));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load local AI settings"); }
    finally { setLoading(false); }
  }

  async function saveSettings() {
    if (!draft) return;
    setSaving(true); setError("");
    try {
      const settings = await json<AiSettings>("/api/ai/settings", { method: "PUT", body: JSON.stringify({ ...draft, destinations: parseDestinations(destinations) }) });
      setDraft(settings);
      setStatus((current) => current ? { ...current, settings } : current);
      setDestinations(destinationText(settings));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save local AI settings"); }
    finally { setSaving(false); }
  }

  async function start() {
    setError(""); setChoices({}); initializedJob.current = "";
    try { setJob(await json<AiJob>("/api/ai/jobs", { method: "POST", body: "{}" })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to start local analysis"); }
  }

  async function cancel() {
    if (!job) return;
    try { setJob(await json<AiJob>(`/api/ai/jobs/${job.id}`, { method: "DELETE" })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to cancel local analysis"); }
  }

  async function apply() {
    if (!job) return;
    const decisions = Object.entries(choices).filter(([, choice]) => choice.accepted).map(([id, choice]) => ({ id, destination: choice.destination }));
    if (!decisions.length) { setError("Select at least one reviewed suggestion to add to the organization plan."); return; }
    setApplying(true); setError("");
    try {
      const response = await json<{ items: AiPlanItem[] }>("/api/ai/plan", { method: "POST", body: JSON.stringify({ jobId: job.id, decisions }) });
      const { mergeAiPlan } = await import("./ai-plan");
      onApplied(mergeAiPlan(scan, response.items, job.results), job.id, decisions);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to apply reviewed suggestions"); }
    finally { setApplying(false); }
  }

  function createRule(item: AiReviewItem) {
    if (!item.destination) return;
    onCreateRule({ name: `${item.name} files`.slice(0, 80), destination: item.destination, enabled: true, match: { nameGlobs: [item.name] } });
  }

  const running = Boolean(job && !terminal.has(job.status));
  const acceptedCount = Object.values(choices).filter((choice) => choice.accepted).length;
  return <dialog className="ai-dialog" ref={dialogRef} aria-labelledby="ai-title" onCancel={(event) => { event.preventDefault(); if (!running) onClose(); }} onClose={onClose}>
    <div className="ai-panel">
      <header className="ai-header"><div><span>Local intelligence</span><h2 id="ai-title">Review unmatched files</h2></div><button className="icon-button" aria-label="Close local AI review" title="Close" disabled={running} onClick={onClose}><X size={18} /></button></header>
      <div className="ai-body" aria-busy={loading || saving || applying}>
        {loading && <div className="ai-loading"><RefreshCw className="spin" size={19} aria-hidden="true" />Checking local model service</div>}
        {error && <div className="ai-error" role="alert"><AlertTriangle size={16} aria-hidden="true" /><span>{error}</span></div>}
        {!loading && status && draft && <>
          <section className={`ai-connection ${status.available ? "available" : "offline"}`} aria-label="Local model status">
            <span><Bot size={18} aria-hidden="true" /></span><div><strong>{status.available ? `${status.models.length} local model${status.models.length === 1 ? "" : "s"} ready` : "Ollama is not available"}</strong><small>{status.available ? "Connected on 127.0.0.1. Files never use a remote endpoint." : status.error}</small></div><button className="icon-button" aria-label="Check local model service again" title="Retry" onClick={() => void loadStatus()}><RefreshCw size={15} /></button>
          </section>
          <section className="ai-settings" aria-labelledby="ai-settings-heading">
            <div className="ai-section-heading"><div><h3 id="ai-settings-heading">Configuration</h3><p>Only files left in Other are analyzed.</p></div><label className="ai-enabled"><input type="checkbox" checked={draft.enabled} disabled={!status.available || running} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span>Enabled</span></label></div>
            <label><span>Local model</span><select value={draft.model} disabled={!status.available || running} onChange={(event) => setDraft({ ...draft, model: event.target.value })}><option value="">Select a model</option>{status.models.map((model) => <option value={model.name} key={model.digest}>{model.name} · {formatSize(model.size)}</option>)}</select></label>
            <label className="ai-destinations"><span>Allowed destinations</span><input value={destinations} disabled={running} onChange={(event) => setDestinations(event.target.value)} placeholder="Projects, Archive" /></label>
            <label className="ai-text-setting"><input type="checkbox" checked={draft.includeText} disabled={running} onChange={(event) => setDraft({ ...draft, includeText: event.target.checked })} /><span><strong>Read supported text locally</strong><small>Up to 32 KB per plain-text file. Extracted text is never cached.</small></span></label>
            {settingsDirty && <button className="secondary-button ai-save-settings" disabled={saving || running || (draft.enabled && !status.available)} onClick={() => void saveSettings()}><Save size={15} aria-hidden="true" />{saving ? "Saving" : "Save configuration"}</button>}
          </section>
          {!job && <section className="ai-start" aria-labelledby="ai-start-heading"><span><Database size={20} aria-hidden="true" /></span><div><h3 id="ai-start-heading">{unmatched.length} unmatched file{unmatched.length === 1 ? "" : "s"}</h3><p>Rules and built-in categories have already run.</p></div><button className="primary" disabled={!draft.enabled || settingsDirty || !unmatched.length || !status.available} onClick={() => void start()}><Play size={16} aria-hidden="true" />Analyze</button></section>}
          {job && <section className="ai-job" aria-labelledby="ai-job-heading">
            <div className="ai-job-heading"><div><h3 id="ai-job-heading">{job.status === "completed" ? "Review suggestions" : job.status === "cancelled" ? "Analysis cancelled" : job.status === "failed" ? "Analysis failed" : "Analyzing locally"}</h3><p>{job.processed} of {job.total} files · {job.model}</p></div>{running && <button className="secondary-button" onClick={() => void cancel()}><Square size={14} aria-hidden="true" />Stop analysis</button>}</div>
            <div className="ai-progress" role="progressbar" aria-label="Local files analyzed" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.processed}><span style={{ width: `${job.total ? job.processed / job.total * 100 : 0}%` }} /></div>
            {job.error && <div className="ai-error" role="alert"><AlertTriangle size={16} /><span>{job.error}</span></div>}
            {job.results.length > 0 && <div className="ai-results">{job.results.map((item) => {
              const choice = choices[item.suggestionId];
              return <article className={`ai-result ${item.status}`} key={item.suggestionId}>
                <label className="ai-result-select"><input type="checkbox" aria-label={`Use suggestion for ${item.name}`} disabled={!item.destination || job.status !== "completed"} checked={choice?.accepted ?? false} onChange={(event) => setChoices({ ...choices, [item.suggestionId]: { accepted: event.target.checked, destination: choice?.destination ?? item.destination ?? "" } })} /><span><strong title={item.name}>{item.name}</strong><small>{item.textBytes ? <><FileText size={12} aria-hidden="true" />{formatSize(item.textBytes)} read locally</> : "Metadata only"}{item.cached ? " · cached" : ""}</small></span></label>
                {item.destination ? <><div className="ai-result-route"><select aria-label={`Destination for ${item.name}`} value={choice?.destination ?? item.destination} disabled={job.status !== "completed"} onChange={(event) => setChoices({ ...choices, [item.suggestionId]: { accepted: choice?.accepted ?? false, destination: event.target.value } })}>{draft.destinations.map((destination) => <option key={destination}>{destination}</option>)}</select><b>{Math.round((item.confidence ?? 0) * 100)}%</b></div><p>{item.explanation}</p><div className="ai-result-actions"><span className={item.status}>{item.status === "suggested" ? <Check size={13} /> : <AlertTriangle size={13} />}{item.status === "suggested" ? "Suggested" : "Review required"}</span><button onClick={() => createRule(item)}><SlidersHorizontal size={13} />Create rule</button></div></> : <p className="ai-result-failure">{item.error}</p>}
              </article>;
            })}</div>}
          </section>}
        </>}
      </div>
      <footer className="ai-footer"><span>{job?.status === "completed" ? `${acceptedCount} suggestion${acceptedCount === 1 ? "" : "s"} selected` : "No file moves occur during analysis"}</span><button className="secondary-button" disabled={running} onClick={onClose}>Cancel</button><button className="primary" disabled={job?.status !== "completed" || !acceptedCount || applying} onClick={() => void apply()}><Check size={16} />{applying ? "Applying" : "Add to plan"}</button></footer>
    </div>
  </dialog>;
}
