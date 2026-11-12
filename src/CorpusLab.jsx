import React, { useRef, useState } from "react";
import { Activity, ArrowUpRight, Database, Download, FilePlus2, FlaskConical, Info,
  LockKeyhole, RefreshCcw, Trash2, UploadCloud, X, ShieldAlert } from "lucide-react";
import { analyzeAudioBuffer } from "./audio.js";
import {
  MAX_RECORDS, makeCorpusRecord, importCorpusManifest, exportCorpusManifest,
  summarizeCorpus, corpusDistanceMatrix, qualityFlags
} from "./corpus.js";
import "./corpus.css";

const initialMetadata = {
  language: "Unspecified", family: "", speaker: "", prompt: "", device: "",
  consent: "unknown", license: "unspecified", signalType: "speech"
};
const MAX_AUDIO_FILE = 25 * 1024 * 1024;
const MAX_IMPORT_FILE = 1024 * 1024;

function uniqueId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return "row_" + crypto.randomUUID().replaceAll("-", "");
  }
  return "row_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
}

function formatDistance(value) {
  return value == null ? "—" : value.toFixed(3);
}

function downloadJSON(content, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function GroupStat({ title, inside, outside }) {
  const comparable = inside.count > 0 && outside.count > 0;
  return <div className="corpus-contrast">
    <h4>{title}</h4>
    <div className="corpus-contrast-rows">
      {[[inside, "Same", "a"], [outside, "Different", "b"]].map(([value, label, variant]) => (
        <div className="corpus-comparison-row" key={variant}>
          <span>{label}</span>
          <div className="corpus-track"><span className={"corpus-track-fill " + variant} style={{ width: ((value.mean ?? 0) * 100) + "%" }} /></div>
          <strong>{formatDistance(value.mean)}</strong>
          <small>n={value.count}</small>
        </div>
      ))}
    </div>
    {!comparable && <div className="corpus-warning-inline">Both comparison groups need at least one pair.</div>}
  </div>;
}

export default function CorpusLab({ clips, onUseRecord }) {
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState(initialMetadata);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("Workspace begins empty. Add two or more real speech clips to start comparing.");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const audioRef = useRef(null);
  const manifestRef = useRef(null);
  const summary = summarizeCorpus(records);
  const matrix = records.length ? corpusDistanceMatrix(records) : [];
  const preview = records.slice(0, 14);
  const previewMatrix = matrix.slice(0, 14).map(row => row.slice(0, 14));
  const hasRealSpeech = summary.speechSamples > 0;

  function updateMeta(key, value) {
    setMeta(previous => ({ ...previous, [key]: value }));
  }

  function addClip(clip) {
    try {
      if (records.length >= MAX_RECORDS) throw new Error("The workspace is full (60 samples).");
      const entry = makeCorpusRecord(clip, meta, uniqueId());
      setRecords(previous => [...previous, entry]);
      setNotice("Added " + entry.name + " as " + entry.signalType + ". No raw audio was copied.");
      setError("");
    } catch (cause) {
      setError(cause?.message || "The sample could not be added.");
    }
  }

  async function addAudioFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (working) return;
    setError("");
    const room = MAX_RECORDS - records.length;
    if (!room || files.length > room) {
      setError("Select no more than " + room + " additional audio files. The workspace limit is 60."); return;
    }
    if (files.some(file => file.size > MAX_AUDIO_FILE || file.size === 0)) {
      setError("Every file must be non-empty and at most 25 MB."); return;
    }
    if (files.length > 12) {
      setError("Analyze no more than 12 files in one batch to avoid browser memory pressure."); return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) { setError("Web Audio API is unavailable in this browser."); return; }
    setWorking(true);
    let context;
    const created = [], failures = [];
    try {
      context = new AudioContextClass();
      for (const file of files) {
        try {
          const audio = await context.decodeAudioData(await file.arrayBuffer());
          const features = analyzeAudioBuffer(audio);
          created.push(makeCorpusRecord({
            ...features, name: file.name, kind: "uploaded", language: meta.language
          }, meta, uniqueId()));
        } catch (cause) {
          failures.push(file.name + ": " + (cause?.message || "could not decode"));
        }
      }
      if (created.length) {
        setRecords(previous => [...previous, ...created]);
        setNotice(created.length + " audio file(s) analyzed locally. All files share the metadata entered above.");
      }
      if (failures.length) setError(failures.slice(0, 3).join(" | ") + (failures.length > 3 ? " and more." : ""));
    } catch (cause) {
      setError(cause?.message || "Audio processing failed.");
    } finally {
      if (context) await context.close().catch(() => {});
      setWorking(false);
    }
  }

  async function loadManifest(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE) { setError("Manifest exceeds 1 MB."); return; }
    if (records.length && !window.confirm("Replace the current corpus workspace with the imported manifest? Export first to keep it.")) return;
    setWorking(true);
    try {
      const data = importCorpusManifest(await file.text());
      setRecords(data);
      setSelected(null);
      setNotice("Imported " + data.length + " feature summaries. Their provenance is self-reported and has not been independently verified.");
      setError("");
    } catch (cause) {
      setError(cause?.message || "Invalid manifest.");
    } finally { setWorking(false); }
  }

  function removeRecord(id) {
    setRecords(previous => previous.filter(row => row.id !== id));
    if (selected === id) setSelected(null);
    setNotice("Removed one record from the in-memory workspace.");
  }

  function clearCorpus() {
    if (!records.length) return;
    if (!window.confirm("Clear all local corpus records? This cannot be undone unless you exported a manifest.")) return;
    setRecords([]);
    setSelected(null);
    setNotice("Corpus cleared. Raw audio was never stored in this workspace.");
  }

  function renderMatrix() {
    if (preview.length < 2) return <p className="corpus-empty-text">Add two records to show their descriptive feature distances.</p>;
    return <div className="corpus-heatmap-scroll">
      <div className="corpus-heatmap" style={{ gridTemplateColumns: "32px repeat(" + preview.length + ", minmax(24px, 1fr))" }}
        role="img" aria-label={"Pairwise normalized acoustic feature distances for " + preview.length + " records"}>
        <span className="corpus-axis">#</span>
        {preview.map((row, i) => <span className="corpus-axis" title={row.name} key={"x" + row.id}>{i + 1}</span>)}
        {previewMatrix.map((line, i) => <React.Fragment key={preview[i].id}>
          <span className="corpus-axis" title={preview[i].name}>{i + 1}</span>
          {line.map((distance, j) => <span key={preview[j].id} className="corpus-cell"
            title={preview[i].name + " ↔ " + preview[j].name + ": " + formatDistance(distance)}
            style={{ background: "rgba(78, 208, 230, " + (0.09 + distance * 0.82).toFixed(3) + ")" }}>
            {distance.toFixed(2)}
          </span>)}
        </React.Fragment>)}
      </div>
    </div>;
  }

  return <section id="corpus" className="corpus-section">
    <div className="container">
      <div className="section-heading corpus-heading">
        <div><span className="kicker">03 / CORPUS RESEARCH</span><h2>Find the signal. <span>Control the noise.</span></h2></div>
        <span className="heading-corner">ULGE / DATASET WORKSPACE V0.2</span>
      </div>
      <p className="corpus-lead">Move beyond A/B demonstrations. Build a labeled dataset of recordings, document confounds, and inspect acoustic distances. The next step toward a hypothesis worth testing is a corpus worth trusting.</p>

      <div className="corpus-shell">
        <div className="corpus-toolbar">
          <div className="corpus-toolbar-title">
            <Database size={19} />
            <div><strong>Local corpus workspace</strong><span>In-memory · feature summaries only · no server upload</span></div>
          </div>
          <div className="corpus-toolbar-actions">
            <button type="button" disabled={working} onClick={() => manifestRef.current?.click()}><UploadCloud size={15} /> Import manifest</button>
            <button type="button" disabled={working || !records.length}
              onClick={() => downloadJSON(exportCorpusManifest(records), "ULGE-corpus-manifest.json")}><Download size={15} /> Export JSON</button>
            <button type="button" disabled={working || !records.length} className="corpus-clear" onClick={clearCorpus}><Trash2 size={15} /> Clear</button>
          </div>
          <input hidden type="file" accept=".json,application/json" ref={manifestRef} onChange={loadManifest} />
        </div>

        <div className="corpus-stat-strip">
          <div><span>RECORDS</span><strong>{summary.total}<small> / {MAX_RECORDS}</small></strong></div>
          <div><span>LABELED SPEECH</span><strong>{summary.speechSamples}</strong></div>
          <div><span>LANGUAGES</span><strong>{summary.languages.length}</strong></div>
          <div><span>FAMILIES</span><strong>{summary.families.filter(f => f.label !== "Unspecified").length}</strong></div>
          <div><span>QC FLAGS</span><strong>{summary.qualityIssues}</strong></div>
        </div>

        <div className="corpus-body">
          <div className="corpus-entry">
            <h3><FilePlus2 size={17} /> 1. Register a recording</h3>
            <p>Metadata applies to every clip added in this action. Use pseudonymous speaker IDs, and only use recordings you have rights to analyze.</p>
            <div className="corpus-fields">
              <label>Language <input maxLength={160} value={meta.language} disabled={working} onChange={e => updateMeta("language", e.target.value)} placeholder="e.g. Swahili" /></label>
              <label>Language family <input maxLength={160} value={meta.family} disabled={working} onChange={e => updateMeta("family", e.target.value)} placeholder="e.g. Bantu" /></label>
              <label>Speaker ID <input maxLength={160} value={meta.speaker} disabled={working} onChange={e => updateMeta("speaker", e.target.value)} placeholder="e.g. spk-001" /></label>
              <label>Prompt or task ID <input maxLength={160} value={meta.prompt} disabled={working} onChange={e => updateMeta("prompt", e.target.value)} placeholder="e.g. prompt-a" /></label>
              <label>Device / channel <input maxLength={160} value={meta.device} disabled={working} onChange={e => updateMeta("device", e.target.value)} placeholder="e.g. headset mic" /></label>
              <label>Signal type <select value={meta.signalType} disabled={working} onChange={e => updateMeta("signalType", e.target.value)}>
                <option value="speech">Speech (self-reported)</option><option value="non-speech">Non-speech control</option><option value="synthetic">Synthetic control</option>
              </select></label>
              <label>Permission <select value={meta.consent} disabled={working} onChange={e => updateMeta("consent", e.target.value)}>
                <option value="unknown">Unknown / unverified</option><option value="self-recorded">Self-recorded</option><option value="documented-permission">Documented permission</option>
              </select></label>
              <label>Usage license <select value={meta.license} disabled={working} onChange={e => updateMeta("license", e.target.value)}>
                <option value="unspecified">Unspecified</option><option value="private-research">Private research only</option><option value="CC0">CC0</option><option value="CC-BY-4.0">CC BY 4.0</option><option value="other">Other / review conditions</option>
              </select></label>
            </div>

            <div className="corpus-action-stack">
              <div className="corpus-add-slots">
                <button type="button" onClick={() => addClip(clips.A)} disabled={working || records.length >= MAX_RECORDS}><FilePlus2 size={15} /> Add sample A</button>
                <button type="button" onClick={() => addClip(clips.B)} disabled={working || records.length >= MAX_RECORDS}><FilePlus2 size={15} /> Add sample B</button>
              </div>
              <button type="button" className="corpus-upload-button" onClick={() => audioRef.current?.click()} disabled={working || records.length >= MAX_RECORDS}>
                <UploadCloud size={16} /> Analyze audio files into corpus
              </button>
              <input hidden ref={audioRef} type="file" multiple accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a" onChange={addAudioFiles} />
              <span className="corpus-smallprint">Batch max: 12 files · 25 MB each. One metadata form is applied to all files. Analysis may be slow for large recordings.</span>
            </div>
            {working && <div className="corpus-notice"><Activity size={14} /> Processing locally…</div>}
            {error && <div className="corpus-notice corpus-error" role="alert"><ShieldAlert size={15} /> {error}</div>}
            {!error && !working && <div className="corpus-notice" aria-live="polite">{notice}</div>}
          </div>

          <div className="corpus-overview">
            <h3><FlaskConical size={17} /> 2. Inspect the corpus</h3>
            <div className="corpus-overview-info">
              <Info size={16} /> No statistical significance is calculated. Shared speakers, recording devices, and prompts can dominate these distances.
            </div>
            {records.length ? <>
              <div className="corpus-table-scroll">
                <table className="corpus-table">
                  <thead><tr><th>Sample</th><th>Language</th><th>Speaker</th><th>QC</th><th>Compare</th><th></th></tr></thead>
                  <tbody>{records.map((row, index) => {
                    const flags = qualityFlags(row);
                    return <tr key={row.id} className={selected === row.id ? "row-selected" : ""}>
                      <td><button className="corpus-row-name" type="button" onClick={() => setSelected(selected === row.id ? null : row.id)} title={row.name}>{String(index + 1).padStart(2, "0")} · {row.name}</button></td>
                      <td>{row.language || "Unspecified"}</td>
                      <td>{row.speaker || "—"}</td>
                      <td><span className={"corpus-qc " + (flags.length ? "warn" : "ok")} title={flags.join("; ") || "No simple metadata flags"}>{flags.length ? flags.length + " flags" : "0 flags"}</span></td>
                      <td className="corpus-row-actions"><button type="button" onClick={() => onUseRecord("A", row)} title="Compare in slot A">A</button><button type="button" onClick={() => onUseRecord("B", row)} title="Compare in slot B">B</button></td>
                      <td><button className="corpus-remove" type="button" onClick={() => removeRecord(row.id)} aria-label={"Remove " + row.name}><X size={14} /></button></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              {selected && records.some(row => row.id === selected) && <div className="corpus-detail">
                <strong>Quality audit: {records.find(row => row.id === selected)?.name}</strong>
                {qualityFlags(records.find(row => row.id === selected)).length ?
                  <ul>{qualityFlags(records.find(row => row.id === selected)).map(flag => <li key={flag}>{flag}</li>)}</ul> :
                  <p>No basic quality flags. This does not verify labels, consent, or recording conditions.</p>}
              </div>}
            </> : <div className="corpus-empty"><Database size={29} /><strong>No corpus recordings yet</strong><span>Your two starter signals are synthetic. Add real speech clips to explore actual measurements.</span></div>}
          </div>
        </div>

        <div className="corpus-results">
          <div className="corpus-results-header"><div><h3>3. Compare structures</h3><p>Simple descriptive analysis of normalized seven-feature vectors.</p></div><span>NO UNIVERSALITY CLAIM</span></div>
          <div className="corpus-results-grid">
            <div className="corpus-matrix-block">
              <div className="corpus-subheading"><strong>PAIRWISE DISTANCE MAP</strong><span>0 = same vector · 1 = maximum possible</span></div>
              {renderMatrix()}
              <p className="corpus-smallprint">Rows and columns match the numbered corpus entries. Showing {preview.length} of {records.length} rows, first 14 maximum. All data is included in JSON export.</p>
            </div>
            <div className="corpus-groups-block">
              <div className="corpus-subheading"><strong>GROUP COMPARISONS</strong><span>Means + number of pairs</span></div>
              <GroupStat title="Language" inside={summary.comparisons.sameLanguage} outside={summary.comparisons.differentLanguage} />
              <GroupStat title="Speaker" inside={summary.comparisons.sameSpeaker} outside={summary.comparisons.differentSpeaker} />
              <GroupStat title="Task / prompt" inside={summary.comparisons.samePrompt} outside={summary.comparisons.differentPrompt} />
              {!hasRealSpeech && <p className="corpus-empty-text">These comparisons exclude synthetic and non-speech controls. Add labeled speech to populate them.</p>}
            </div>
          </div>
          <div className="corpus-ethics"><LockKeyhole size={17} /><p><strong>Scientific and privacy boundary:</strong> imports may contain unverifiable metadata. No audio is uploaded or included in exports. Feature summaries plus speaker labels might still be identifying. Pairwise distances share samples and are not independent observations. This interface does not infer linguistic universals, validate consent, or perform statistical hypothesis testing.</p></div>
        </div>
      </div>

      <div className="corpus-bottom-link">Read the experiment protocol and controls in the <a href="https://github.com/MichaelWave369/ULGE/blob/main/docs/CORPUS_PROTOCOL.md" target="_blank" rel="noreferrer">corpus methodology guide <ArrowUpRight size={15} /></a>.</div>
    </div>
  </section>;
}
