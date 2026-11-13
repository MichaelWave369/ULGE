import React, { useMemo, useRef, useState } from "react";
import { Activity, ArrowUpRight, CheckCircle2, CircleHelp, Download, FileCheck2,
  FlaskConical, Info, Play, ScanLine, ShieldCheck, UploadCloud, X } from "lucide-react";
import {
  REFERENCE_SCHEMA, annotationTemplate, validateAnnotation, scorePitch,
  scoreEvents, compareRhythm, runSyntheticBenchmarks
} from "./validation.js";
import "./validation.css";

const fmt=(value,digits=2)=>typeof value==="number"&&Number.isFinite(value)?value.toFixed(digits):"—";
const percent=value=>value==null?"—":(100*value).toFixed(1)+"%";
function download(name,value) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
  const link=document.createElement("a");
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Stat({label,value,note}) {
  return <div className="validation-stat"><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>;
}
function AnnotationTimeline({report,reference}) {
  if(!report||!reference)return <div className="validation-no-chart">
    <ScanLine size={20}/> Import a reference annotation for a spectral sample to inspect event agreement.
  </div>;
  const events=reference.eventsSeconds,predicted=report.peakEvents;
  const px=t=>Math.min(760,Math.max(40,40+t/report.secondsAnalyzed*720));
  return <svg className="validation-events-plot" viewBox="0 0 800 166" role="img"
    aria-label="Candidate acoustic events as cyan marks and annotated reference events as gold marks, from zero to the analyzed clip duration.">
    {[0,.25,.5,.75,1].map((fraction,i)=><g key={i}>
      <line x1={40+fraction*720} x2={40+fraction*720} y1="21" y2="137" stroke="#385063" strokeDasharray="4 6"/>
      <text x={40+fraction*720} y="156" textAnchor="middle" fontSize="11" fill="#8ca6b9">{fmt(fraction*report.secondsAnalyzed,1)}s</text>
    </g>)}
    <text x="44" y="32" fill="#8fddf0" fontSize="12">DETECTED · ENERGY PEAKS</text>
    <text x="44" y="94" fill="#e9c88e" fontSize="12">ANNOTATED · USER REFERENCE</text>
    <line x1="40" x2="760" y1="65" y2="65" stroke="#3e6775" strokeWidth="1.5"/>
    <line x1="40" x2="760" y1="123" y2="123" stroke="#816a4a" strokeWidth="1.5"/>
    {predicted.map((time,i)=><line key={i} x1={px(time)} x2={px(time)} y1="44" y2="76"
      stroke="#5bddeb" strokeWidth="2.3" />)}
    {events.map((time,i)=><line key={i} x1={px(time)} x2={px(time)} y1="105" y2="136"
      stroke="#efc883" strokeWidth="2.3"/>)}
  </svg>;
}
function PairStat({title,a,b,diff,formatter}) {
  return <div className="validation-pair-stat">
    <span>{title}</span><div><strong>{formatter(a)}</strong><i>vs</i><strong>{formatter(b)}</strong></div>
    <small>Absolute difference: {formatter(diff)}</small>
  </div>;
}

export default function ValidationStudio({a,b}) {
  const [selected,setSelected]=useState("A");
  const [stored,setStored]=useState({A:null,B:null});
  const [busy,setBusy]=useState(false);
  const [benchmark,setBenchmark]=useState(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("No human reference annotations loaded. The synthetic suite is available separately.");
  const fileRef=useRef(null);
  const clip=selected==="A"?a:b;
  const spectral=clip?.spectral||null;
  // Tie every imported annotation to a particular clip ID, never silently
  // apply old reference labels to a new recording in the same slot.
  const linked=stored[selected];
  const reference=linked?.clipId===clip?.id?linked?.reference:null;
  const stale=!!linked&&!reference;
  const other=selected==="A"?b:a;
  const rhythm=useMemo(()=>compareRhythm(a?.spectral,b?.spectral),[a?.spectral,b?.spectral]);
  const evaluation=useMemo(()=>{
    if(!reference||!spectral)return null;
    try {
      return {pitch:scorePitch(spectral,reference),events:scoreEvents(spectral,reference,.09)};
    } catch(cause) {
      return {error:cause?.message||"Reference does not match this recording."};
    }
  },[reference,spectral]);

  function getTemplate() {
    const seconds=spectral?.secondsAnalyzed??3;
    download("ULGE-annotation-template-"+selected+".json",{
      ...annotationTemplate(seconds),
      source:"ENTER ANNOTATION SOURCE (human, corpus, tool/version)",
      notes:"Template only. Null pitch means explicitly unvoiced. Edit pitch points and eventsSeconds, and verify the source before treating this as a reference."
    });
    setNotice("Downloaded a reference JSON template. Replace its example fields with real annotation values before importing.");
  }
  async function importAnnotation(event) {
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    if(!spectral){setError("This sample has no spectral analysis. Load or record audio in the Observatory first.");return;}
    if(file.size>256*1024){setError("Reference JSON exceeds the 256 KB import limit.");return;}
    try {
      const parsed=validateAnnotation(JSON.parse(await file.text()));
      if(Math.abs(parsed.secondsAnalyzed-spectral.secondsAnalyzed)>.05)
        throw new Error("Reference duration must match the clip's analyzed duration within 50 ms.");
      setStored(previous=>({...previous,[selected]:{clipId:clip.id,reference:parsed}}));
      setError("");
      setNotice("Loaded "+parsed.pitch.length+" pitch annotation points and "+parsed.eventsSeconds.length+
        " reference events for sample "+selected+". Reference provenance is self-reported.");
    } catch(cause) {
      setError("Unable to use annotation: "+(cause?.message||"invalid JSON"));
    }
  }
  function clearAnnotation() {
    setStored(previous=>({...previous,[selected]:null}));
    setError("");
    setNotice("Cleared the reference attached to sample "+selected+".");
  }
  async function runBenchmark() {
    if(busy)return;
    setBusy(true);setError("");
    try {
      await new Promise(resolve=>setTimeout(resolve,0));
      const report=runSyntheticBenchmarks();
      setBenchmark(report);
      setNotice("Synthetic diagnostic finished. These references are generated signals, not annotated natural speech.");
    } catch(cause) {
      setError("Could not complete synthetic diagnostic: "+(cause?.message||"unknown error"));
    } finally {setBusy(false);}
  }

  return <section className="validation-section" id="validation">
    <div className="container">
      <div className="section-heading">
        <div><span className="kicker">04 / MEASUREMENT VALIDATION</span>
          <h2>A pattern is only useful <span>if the instrument is trustworthy.</span></h2></div>
        <span className="heading-corner">REFERENCE BENCHMARKS / V0.5</span>
      </div>
      <p className="validation-lead">Before searching for structure across languages, check what ULGE actually measures. Validate pitch against known frequencies, score candidate rhythm events against supplied annotations, and inspect disagreements instead of hiding them.</p>
      <div className="validation-grid">
        <div className="validation-panel">
          <div className="validation-head"><div><FlaskConical size={18}/><h3>Deterministic synthetic tests</h3></div>
            <span className="validation-tag">KNOWN SIGNALS · NOT SPEECH</span>
          </div>
          <p>Generate known-frequency sine waves and timed acoustic pulses locally, run them through the same v0.4 analysis, and compare measured outputs to the generator settings.</p>
          <button type="button" className="validation-main-button" disabled={busy} onClick={runBenchmark}>
            {busy?<Activity size={17}/>:<Play size={17}/>}
            {busy?"Running diagnostics…":"Run known-reference suite"}
          </button>
          {benchmark?<div className="validation-bench-results" aria-live="polite">
            <div className="validation-bench-heading"><span>Clean-tone pitch diagnostics</span>
              <strong>{benchmark.totalCleanPassed}/{benchmark.totalClean} pass preset thresholds</strong></div>
            <div className="validation-tone-table">
              <div className="validation-tone-row header"><span>REFERENCE</span><span>ESTIMATE</span><span>ERROR</span><span>THRESHOLD</span></div>
              {benchmark.tones.map((tone)=><div className="validation-tone-row" key={tone.referenceHz}>
                <span>{tone.referenceHz} Hz</span><span>{tone.detectedHz===null?"—":fmt(tone.detectedHz,1)+" Hz"}</span>
                <span>{tone.centsError===null?"—":fmt(tone.centsError,1)+" ¢"}</span>
                <span className={tone.pass?"validation-ok":"validation-fail"}>{tone.pass?"PASS":"CHECK"}</span>
              </div>)}
            </div>
            <div className="validation-bench-summary">
              <span>220 Hz + deterministic noise: <strong>{benchmark.noisyTone.detectedHz==null?"Unvoiced":fmt(benchmark.noisyTone.detectedHz,1)+" Hz"}</strong></span>
              <span>Pulse events matched: <strong>{benchmark.pulses.score.matched} / {benchmark.pulses.expectedEvents.length}</strong></span>
              <span>Pulse timing error: <strong>{fmt(benchmark.pulses.score.meanTimingErrorMs,1)} ms</strong></span>
            </div>
            <button type="button" className="validation-light-button" onClick={()=>download("ULGE-synthetic-validation.json",benchmark)}><Download size={15}/> Export diagnostic report</button>
          </div>:<div className="validation-placeholder"><Activity size={22}/><strong>No diagnostic results yet</strong>
            <span>Tests have known ground truth; results can fail, and failures are shown explicitly.</span></div>}
          <div className="validation-disclaimer"><Info size={15}/><span>A pass on synthetic tones does not validate speech recognition, speech pitch under real recording conditions, or universality claims.</span></div>
        </div>

        <div className="validation-panel">
          <div className="validation-head"><div><FileCheck2 size={18}/><h3>Annotated recording comparison</h3></div><span className="validation-tag">USER-SUPPLIED REFERENCE</span></div>
          <p>Use a recording from the Observatory and import independently annotated pitch time points and/or event timestamps in JSON. No reference annotations are bundled or fabricated.</p>
          <div className="validation-source-picker" role="group" aria-label="Reference sample selection">
            {["A","B"].map(id=><button type="button" key={id} className={selected===id?"active":""} onClick={()=>{setSelected(id);setError("");}}>
              Sample {id}</button>)}
          </div>
          <div className="validation-clip-status"><span>CURRENT SAMPLE</span><strong>{clip?.name||"No clip"}</strong>
            <small>{spectral?fmt(spectral.secondsAnalyzed,2)+" seconds analyzed · "+spectral.version:"No spectrogram: load audio first"}</small></div>
          <div className="validation-reference-actions">
            <button type="button" onClick={getTemplate}><Download size={15}/> JSON template</button>
            <button type="button" disabled={!spectral} onClick={()=>fileRef.current?.click()}><UploadCloud size={15}/> Import annotation</button>
            {reference&&<button type="button" className="validation-clear" onClick={clearAnnotation} aria-label="Clear reference"><X size={15}/></button>}
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importAnnotation}/>
          {stale&&<div className="validation-warning"><Info size={16}/> The sample changed. Its previous annotation has been detached and will not be scored against a different recording.</div>}
          {error&&<div role="alert" className="validation-error">{error}</div>}
          {reference&&<div className="validation-reference-meta"><ShieldCheck size={16}/>
            <div><strong>{reference.source||"Source unspecified"}</strong><span>{reference.pitch.length} pitch points · {reference.eventsSeconds.length} event timestamps</span></div></div>}
          {evaluation?.error&&<div role="alert" className="validation-error">{evaluation.error}</div>}
          {evaluation&&!evaluation.error?<div className="validation-scored">
            <h4>Pitch reference agreement</h4>
            <div className="validation-stats">
              <Stat label="VOICING F1" value={percent(evaluation.pitch.voicingF1)} note={"Reference points: "+evaluation.pitch.compared}/>
              <Stat label="MEDIAN ABS PITCH ERROR" value={evaluation.pitch.medianAbsoluteCents==null?"—":fmt(evaluation.pitch.medianAbsoluteCents,1)+" ¢"} note={"Jointly voiced: "+evaluation.pitch.jointlyVoiced}/>
              <Stat label="PITCH ERROR >20%" value={percent(evaluation.pitch.grossPitchError20Percent)} note="Only jointly voiced samples"/>
            </div>
            <h4>Energy-event reference agreement</h4>
            <div className="validation-stats">
              <Stat label="EVENT PRECISION" value={percent(evaluation.events.precision)} note={"Predicted: "+evaluation.events.predicted}/>
              <Stat label="EVENT RECALL" value={percent(evaluation.events.recall)} note={"Annotated: "+evaluation.events.reference}/>
              <Stat label="MEAN TIMING ERROR" value={evaluation.events.meanTimingErrorMs==null?"—":fmt(evaluation.events.meanTimingErrorMs,1)+" ms"} note="±90ms matching tolerance"/>
            </div>
            <AnnotationTimeline report={spectral} reference={reference}/>
            <button type="button" className="validation-light-button" onClick={()=>download("ULGE-annotation-score-"+selected+".json",{
              schema:"ULGE.annotation-score.v1",referenceSource:reference.source,
              generatedAt:new Date().toISOString(),sample:clip.name,reference,
              pitch:evaluation.pitch,events:evaluation.events
            })}><Download size={15}/> Export scoring report</button>
          </div>:<div className="validation-placeholder"><CircleHelp size={22}/>
            <strong>No scoring reference attached</strong><span>Download the template, supply independently reviewed annotations, then import it. A template with null pitch fields does not establish ground truth.</span></div>}
        </div>
      </div>
      <div className="validation-rhythm-panel">
        <div className="validation-head"><div><AudioLines size={18}/><h3>Between-recording rhythm diagnostics</h3></div>
          <span className="validation-tag">DESCRIPTIVE · NOT LANGUAGE CLASSIFICATION</span></div>
        <p>Compare the intervals and variability of acoustic energy peaks from samples A and B. Different microphone gain, content and rate can explain these differences.</p>
        {rhythm?<div className="validation-rhythm-grid">
          <PairStat title="Peak candidates" a={rhythm.A.count} b={rhythm.B.count}
            diff={Math.abs(rhythm.A.count-rhythm.B.count)} formatter={v=>String(v)}/>
          <PairStat title="Median peak interval" a={rhythm.A.medianInterval} b={rhythm.B.medianInterval}
            diff={rhythm.medianIntervalDifferenceSeconds} formatter={v=>v==null?"—":fmt(v*1000,0)+" ms"}/>
          <PairStat title="Interval variation (CV)" a={rhythm.A.coefficientVariation} b={rhythm.B.coefficientVariation}
            diff={rhythm.cvDifference} formatter={v=>fmt(v,2)}/>
        </div>:<div className="validation-placeholder"><Activity size={22}/> Load two spectral recordings in the Observatory to compare their peak spacing.</div>}
      </div>
      <p className="validation-protocol"><Info size={15}/> References are self-reported, not independently verified. Event scoring evaluates the event type defined by your annotation, not automatic syllable accuracy. Read the <a href="https://github.com/MichaelWave369/ULGE/blob/main/docs/VALIDATION_PROTOCOL.md" target="_blank" rel="noreferrer">validation protocol <ArrowUpRight size={14}/></a>.</p>
      {notice&&<p className="validation-status" aria-live="polite">{notice}</p>}
    </div>
  </section>;
}
