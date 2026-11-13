import React, { useMemo, useRef, useState } from "react";
import {
  Activity, ArrowUpRight, BarChart3, BookOpen, CheckCircle2, Download, FileAudio,
  FileCheck2, FileJson, FlaskConical, Info, Play, ShieldAlert, Trash2, UploadCloud
} from "lucide-react";
import { analyzeSpectrumAudioBuffer } from "./spectrum.js";
import {
  BENCHMARK_LIMIT, MAX_AUDIO_FILE_BYTES, MAX_BATCH_AUDIO_BYTES,
  MAX_REFERENCE_JSON_BYTES, benchmarkTemplate, parseBenchmarkManifest,
  evaluateBenchmarkEntry, aggregateBenchmark, prepareBenchmarkExport, warningsForEntry
} from "./benchmark.js";
import "./benchmark.css";

const format=(n,digits=2)=>typeof n==="number"&&Number.isFinite(n)?n.toFixed(digits):"—";
const pct=(n)=>typeof n==="number"&&Number.isFinite(n)?(n*100).toFixed(1)+"%":"—";
function saveJSON(name,data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const groupDimensions=[
  {value:"language",label:"Language"},
  {value:"family",label:"Language family"},
  {value:"speaker",label:"Speaker"},
  {value:"device",label:"Recording device"},
  {value:"prompt",label:"Prompt / task"},
  {value:"eventType",label:"Event type"}
];

function MetricTile({label,value,foot}){
  return <div className="benchmark-metric">
    <span>{label}</span><strong>{value}</strong>{foot&&<small>{foot}</small>}
  </div>;
}
function ScoreSummary({data}){
  if(!data)return <div className="benchmark-empty"><BarChart3 size={27}/><strong>No human benchmark results</strong>
    <span>Load a reference manifest and matching local audio files to measure against actual independent annotations.</span>
  </div>;
  return <div className="benchmark-summary">
    <MetricTile label="EVALUATED CLIPS" value={data.clips} foot={data.uniqueSpeakers+" named speaker IDs"}/>
    <MetricTile label="VOICING F1" value={pct(data.voicingF1)} foot={data.pitchReferencePoints+" reference points"}/>
    <MetricTile label="PITCH ERROR" value={data.macroMeanClipMedianAbsoluteCents==null?"—":format(data.macroMeanClipMedianAbsoluteCents,1)+" ¢"} foot="Macro mean of per-clip median cents"/>
    <MetricTile label="EVENT F1" value={pct(data.eventF1)} foot={data.eventReferences+" annotated events"}/>
    <MetricTile label="TIMING ERROR" value={data.macroMeanClipMatchedTimingErrorMs==null?"—":format(data.macroMeanClipMatchedTimingErrorMs,1)+" ms"} foot="Macro mean of matched-event errors"/>
    <MetricTile label="QUALITY FLAGS" value={data.clipsWithWarnings} foot="Clips missing research metadata"/>
  </div>;
}
function readStatus(entry,files,results,failures){
  const key=entry.fileName.toLowerCase();
  if(results.some(r=>r.fileName.toLowerCase()===key))return "scored";
  if(failures.some(r=>r.fileName.toLowerCase()===key))return "failed";
  return files.some(f=>f.name.toLowerCase()===key)?"matched":"missing";
}
function RowStatus({status}){
  return <span className={"benchmark-row-status "+status}>{
    status==="scored"?"SCORED":status==="matched"?"READY":status==="failed"?"ISSUE":"NO FILE"
  }</span>;
}

export default function BenchmarkLab(){
  const manifestRef=useRef(null),audioRef=useRef(null);
  const [manifest,setManifest]=useState(null);
  const [files,setFiles]=useState([]);
  const [results,setResults]=useState([]);
  const [failures,setFailures]=useState([]);
  const [dimension,setDimension]=useState("family");
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("No speech recordings or annotation datasets are bundled.");
  const [selected,setSelected]=useState(null);
  const summary=useMemo(()=>aggregateBenchmark(results,dimension),[results,dimension]);
  const matched=manifest?.clips.filter(entry=>files.some(file=>file.name.toLowerCase()===entry.fileName.toLowerCase())).length||0;
  const missing=manifest?.clips.filter(entry=>!files.some(file=>file.name.toLowerCase()===entry.fileName.toLowerCase()))||[];
  const selectedResult=results.find(row=>row.fileName===selected);
  const selectedFailure=failures.find(row=>row.fileName===selected);
  const safeToExport=!!manifest&&(results.length>0||failures.length>0);

  function resetRun(){
    setResults([]);setFailures([]);setSelected(null);setProgress("");
  }
  async function selectManifest(event){
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    if(file.size>MAX_REFERENCE_JSON_BYTES){
      setError("Manifest is over the 1 MB limit.");return;
    }
    try{
      const imported=parseBenchmarkManifest(await file.text());
      setManifest(imported);setFiles([]);resetRun();setError("");
      setMessage("Loaded "+imported.clips.length+" annotated manifest entries. Select matching audio files next. No audio has been analyzed.");
    }catch(cause){setError("Manifest rejected: "+(cause?.message||"invalid JSON"));}
  }
  function selectAudio(event){
    const incoming=Array.from(event.target.files||[]);event.target.value="";
    if(!incoming.length)return;
    if(incoming.length>BENCHMARK_LIMIT){
      setError("Select at most "+BENCHMARK_LIMIT+" audio files.");return;
    }
    const totalBytes=incoming.reduce((total,file)=>total+file.size,0);
    const distinct=new Set(incoming.map(file=>file.name.toLowerCase())).size===incoming.length;
    if(!distinct){setError("Audio filenames must be unique, ignoring letter case.");return;}
    if(incoming.some(file=>!file.size||file.size>MAX_AUDIO_FILE_BYTES)){
      setError("Each audio file must be non-empty and no larger than 25 MB.");return;
    }
    if(totalBytes>MAX_BATCH_AUDIO_BYTES){
      setError("Total audio selection exceeds 160 MB. Use shorter clips.");return;
    }
    setFiles(incoming);resetRun();setError("");
    const n=manifest?.clips.filter(c=>incoming.some(f=>f.name.toLowerCase()===c.fileName.toLowerCase())).length||0;
    setMessage("Selected "+incoming.length+" local audio files. "+n+" match annotated manifest entries.");
  }

  async function execute(){
    if(!manifest||!manifest.clips.length||running)return;
    const available=new Map(files.map(f=>[f.name.toLowerCase(),f]));
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass){setError("Web Audio decoding is not available in this browser.");return;}
    setRunning(true);setError("");setResults([]);setFailures([]);setSelected(null);
    let context;
    const completed=[],problems=[];
    try{
      context=new AudioContextClass();
      for(let i=0;i<manifest.clips.length;i++){
        const entry=manifest.clips[i];
        const file=available.get(entry.fileName.toLowerCase());
        setProgress("Processing "+(i+1)+"/"+manifest.clips.length+": "+entry.fileName);
        // Yield between files so the browser can update UI.
        await new Promise(resolve=>setTimeout(resolve,0));
        if(!file){
          problems.push({fileName:entry.fileName,error:"No locally selected audio file matches this annotation."});
          continue;
        }
        try{
          const decoded=await context.decodeAudioData(await file.arrayBuffer());
          const spectral=analyzeSpectrumAudioBuffer(decoded);
          const scored=evaluateBenchmarkEntry(entry,spectral);
          completed.push(scored);
        }catch(cause){
          problems.push({fileName:entry.fileName,error:String(cause?.message||"Audio analysis failed").slice(0,300)});
        }
      }
      setResults(completed);setFailures(problems);
      setMessage("Scored "+completed.length+" annotated recordings; "+problems.length+
        " missing or failed. These results are descriptive and have not been independently verified.");
      if(!completed.length)setError("No recordings could be evaluated. Review the issue list and annotation durations.");
    }catch(cause){
      setError("Benchmark runner failed: "+(cause?.message||"unknown error"));
      setResults(completed);setFailures(problems);
    }finally{
      if(context)await context.close().catch(()=>{});
      setProgress("");setRunning(false);
    }
  }

  function clearWorkspace(){
    if(running)return;
    if((manifest||files.length||results.length)&&
      !window.confirm("Clear locally selected audio and reference data? Export the results first if you need them."))return;
    setManifest(null);setFiles([]);resetRun();setError("");
    setMessage("Workspace cleared. This page has no persistent dataset storage.");
  }

  return <section className="benchmark-section" id="benchmark">
    <div className="container">
      <div className="section-heading">
        <div><span className="kicker">05 / REAL SPEECH BENCHMARKING</span>
          <h2>Bring the evidence. <span>Let the measurements answer.</span></h2></div>
        <span className="heading-corner">ANNOTATED CORPUS RUNNER / V0.6</span>
      </div>
      <p className="benchmark-lead">Evaluate the pitch and rhythm instruments against independently annotated recordings that you supply. Batch analysis, per-language and per-speaker slices, and honest failure reporting. ULGE does not bundle or claim to have scored a human speech corpus.</p>
      <div className="benchmark-privacy"><ShieldAlert size={18}/>
        <p><strong>Local first, not automatically anonymous.</strong> Audio is decoded in your browser and never sent to a ULGE backend. Exported metrics still include filenames, speaker labels and annotation provenance, which can identify people. Only analyze recordings you have rights to use.</p>
      </div>

      <div className="benchmark-grid">
        <div className="benchmark-panel">
          <div className="benchmark-head"><div><FileJson size={18}/><h3>1. Load annotated references</h3></div>
            <span>JSON SCHEMA V1</span></div>
          <p>Use the JSON template and protocol to define actual audio filenames, language/family/speaker/device metadata and independent pitch or event labels.</p>
          <div className="benchmark-buttons">
            <button type="button" onClick={()=>saveJSON("ULGE-real-speech-manifest-template.json",benchmarkTemplate())}>
              <Download size={15}/> Download empty template
            </button>
            <button type="button" disabled={running} className="benchmark-primary" onClick={()=>manifestRef.current?.click()}>
              <UploadCloud size={15}/> Import reference JSON
            </button>
          </div>
          <input hidden type="file" accept=".json,application/json" ref={manifestRef} disabled={running} onChange={selectManifest}/>
          <div className="benchmark-file-readout">
            <span>DATASET</span><strong>{manifest?.dataset||"No reference manifest"}</strong>
            <small>{manifest?manifest.clips.length+" declared recordings · "+manifest.provenance:"An empty template intentionally contains no fake human measurements."}</small>
          </div>
        </div>
        <div className="benchmark-panel">
          <div className="benchmark-head"><div><FileAudio size={18}/><h3>2. Match local recordings</h3></div>
            <span>NO UPLOADS</span></div>
          <p>Select audio files whose bare filenames match the annotated entries exactly, ignoring capitalization. Analysis is capped at 24 files, 25 MB each, and the first 20 seconds per file.</p>
          <div className="benchmark-buttons">
            <button type="button" className="benchmark-primary" disabled={!manifest||running} onClick={()=>audioRef.current?.click()}>
              <UploadCloud size={15}/> Choose audio files
            </button>
            <button type="button" disabled={!manifest||running} onClick={clearWorkspace}><Trash2 size={15}/> Clear workspace</button>
          </div>
          <input hidden type="file" multiple accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a" ref={audioRef} disabled={running} onChange={selectAudio}/>
          <div className="benchmark-file-readout">
            <span>LOCAL FILES</span><strong>{files.length} selected · {matched} matched</strong>
            <small>{missing.length} missing reference file(s). Unmatched selected files are ignored.</small>
          </div>
        </div>
      </div>

      <div className="benchmark-run-panel">
        <div><strong>3. Run reproducible evaluation</strong><span>Pitch reference error, event matching within ±90 ms and per-clip warnings.</span></div>
        <button type="button" disabled={!manifest?.clips.length||!matched||running} onClick={execute}>
          {running?<Activity size={17}/>:<Play size={17}/>}
          {running?"Analyzing…":"Run local benchmark"}
        </button>
      </div>
      {progress&&<div className="benchmark-progress" aria-live="polite"><Activity size={15}/>{progress}</div>}
      {error&&<div role="alert" className="benchmark-error"><ShieldAlert size={15}/>{error}</div>}
      <p className="benchmark-message" aria-live="polite">{message}</p>

      {manifest&&<div className="benchmark-manifest-panel">
        <div className="benchmark-manifest-title"><strong>Declared evaluation set</strong><span>{manifest.clips.length} annotated entries · {matched} matched with selected local files</span></div>
        <div className="benchmark-table-scroll">
          <table className="benchmark-table">
            <thead><tr><th>Audio file</th><th>Language</th><th>Speaker</th><th>Reference</th><th>Rights</th><th>Status</th></tr></thead>
            <tbody>{manifest.clips.map(entry=>{
              const status=readStatus(entry,files,results,failures);
              return <tr key={entry.fileName}>
                <td><button type="button" className="benchmark-row-select" onClick={()=>setSelected(entry.fileName)}>{entry.fileName}</button></td>
                <td>{entry.language}</td><td>{entry.speaker||"Unspecified"}</td>
                <td>{entry.metrics.join(" + ")}</td><td>{entry.rights}</td>
                <td><RowStatus status={status}/></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {selected&&<div className="benchmark-selected">
          <div><strong>{selected}</strong><button type="button" aria-label="Close sample details" onClick={()=>setSelected(null)}>Close</button></div>
          {selectedResult?<div className="benchmark-selected-metrics">
            <span>Voicing F1: <strong>{pct(selectedResult.pitch?.voicingF1)}</strong></span>
            <span>Median pitch error: <strong>{format(selectedResult.pitch?.medianAbsoluteCents,1)} cents</strong></span>
            <span>Event F1: <strong>{pct(selectedResult.events?.f1)}</strong></span>
            <span>Event timing: <strong>{format(selectedResult.events?.meanTimingErrorMs,1)} ms</strong></span>
            <span>QC flags: <strong>{selectedResult.warnings.join("; ")||"None detected"}</strong></span>
          </div>:selectedFailure?<p>{selectedFailure.error}</p>:<p>{warningsForEntry(manifest.clips.find(entry=>entry.fileName===selected)).join("; ")||"No basic metadata warnings."}</p>}
        </div>}
      </div>}

      <div className="benchmark-results">
        <div className="benchmark-results-top">
          <div><BarChart3 size={18}/><h3>4. Inspect the measured results</h3></div>
          <button type="button" disabled={!safeToExport||running} onClick={()=>saveJSON("ULGE-real-speech-benchmark-results.json",prepareBenchmarkExport(manifest,results,failures))}>
            <Download size={15}/> Export results JSON
          </button>
        </div>
        <ScoreSummary data={results.length?summary.total:null}/>
        {!!results.length&&<>
          <div className="benchmark-slice-controls">
            <div><strong>Group-level breakdown</strong><span>Separate the effects of language labels from possible speaker and recording-channel confounds.</span></div>
            <label>GROUP BY
              <select value={dimension} onChange={event=>setDimension(event.target.value)}>
                {groupDimensions.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <div className="benchmark-table-scroll">
            <table className="benchmark-table">
              <thead><tr><th>Group</th><th>Clips</th><th>Speakers</th><th>Pitch refs</th><th>Voicing F1</th><th>Pitch error*</th><th>Event F1</th><th>Warnings</th></tr></thead>
              <tbody>{summary.groups.map(group=><tr key={group.name}>
                <td>{group.name}</td><td>{group.clips}</td><td>{group.uniqueSpeakers}</td>
                <td>{group.pitchReferencePoints}</td><td>{pct(group.voicingF1)}</td>
                <td>{group.macroMeanClipMedianAbsoluteCents==null?"—":format(group.macroMeanClipMedianAbsoluteCents,1)+" ¢"}</td>
                <td>{pct(group.eventF1)}</td><td>{group.clipsWithWarnings}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="benchmark-table-note">* Unweighted mean of per-recording median absolute pitch errors, for recordings with jointly voiced labels. Blank scores mean the reference or denominator is insufficient, not that accuracy is perfect. Group counts are descriptive, without confidence intervals.</p>
        </>}
        {!!failures.length&&<div className="benchmark-issues">
          <strong>Unscored reference entries ({failures.length})</strong>
          {failures.map((failure,i)=><p key={failure.fileName+i}><span>{failure.fileName}</span>: {failure.error}</p>)}
        </div>}
      </div>

      <div className="benchmark-science-note"><Info size={18}/>
        <p><strong>Not a universal-language test.</strong> This evaluates whether the current pitch and energy-event detectors agree with supplied annotations. The reference source and event type are self-reported. Clips from one speaker are correlated; apparent group differences may reflect recording channels, prompt choices, annotation conventions or sampling bias. No held-out test, confidence interval, statistical significance or linguistic universality claim is generated.</p>
      </div>
      <p className="benchmark-documentation"><BookOpen size={15}/> Learn the required metadata, manifest schema and validation design in the <a href="https://github.com/MichaelWave369/ULGE/blob/main/docs/BENCHMARK_PROTOCOL.md" target="_blank" rel="noreferrer">real-speech benchmark protocol <ArrowUpRight size={14}/></a>.</p>
    </div>
  </section>;
}
