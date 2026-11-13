/**
 * ULGE benchmark-v1: local evaluation of supplied, independently annotated
 * speech recordings. There is no bundled speech corpus and no network I/O.
 * Manifest metadata is self-reported; evaluation is not a discovery claim.
 */
import { REFERENCE_SCHEMA, validateAnnotation, scorePitch, scoreEvents } from "./validation.js";

export const BENCHMARK_SCHEMA = "ULGE.real-speech-benchmark.v1";
export const BENCHMARK_LIMIT = 24;
export const MAX_REFERENCE_JSON_BYTES = 1024 * 1024;
export const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_BATCH_AUDIO_BYTES = 160 * 1024 * 1024;
export const METRICS = ["pitch", "events"];
const TEXT_LIMIT = 160;
const RIGHTS = ["self-recorded", "documented-permission", "public-license", "unknown"];
const MAX_SLICES = 100;
const isText = v => typeof v === "string" && v.length <= TEXT_LIMIT;
const textField = (v, field, required = false) => {
  if (!isText(v) || (required && !v.trim())) throw new Error("Invalid "+field+" (max "+TEXT_LIMIT+" characters).");
  return v.trim();
};
const positive = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
const ratio = (n,d) => d>0 ? n/d : null;
const f1 = (p,r) => p===null||r===null?null:(p+r===0?0:2*p*r/(p+r));
const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
const unique = values => new Set(values).size===values.length;

export function benchmarkTemplate() {
  return {
    schema: BENCHMARK_SCHEMA,
    dataset: "Replace with a real corpus name",
    provenance: "Document annotation method, license and collection procedure",
    notes: "Start with an empty clips list. Follow docs/BENCHMARK_PROTOCOL.md to add independently annotated audio. No real labels or audio are bundled.",
    clips: []
  };
}

export function validateBenchmarkManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.schema !== BENCHMARK_SCHEMA)
    throw new Error("Unsupported or invalid benchmark manifest schema.");
  const dataset = textField(input.dataset,"dataset",true);
  const provenance = textField(input.provenance,"provenance",true);
  const notes = textField(input.notes ?? "","notes");
  if (!Array.isArray(input.clips) || input.clips.length>BENCHMARK_LIMIT)
    throw new Error("Manifest must contain an array of at most "+BENCHMARK_LIMIT+" clips.");
  const clips=input.clips.map((entry,i)=>{
    const prefix="clip "+(i+1)+": ";
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error(prefix+"must be an object.");
    const fileName=textField(entry.fileName,prefix+"fileName",true);
    if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("\0") || fileName==="." || fileName==="..")
      throw new Error(prefix+"fileName must be a bare filename, not a path.");
    const language=textField(entry.language,prefix+"language",true);
    const family=textField(entry.family??"",prefix+"family");
    const speaker=textField(entry.speaker??"",prefix+"speaker");
    const device=textField(entry.device??"",prefix+"device");
    const prompt=textField(entry.prompt??"",prefix+"prompt");
    const eventType=textField(entry.eventType??"",prefix+"eventType");
    const rights=entry.rights??"unknown";
    if (!RIGHTS.includes(rights)) throw new Error(prefix+"rights has an unsupported value.");
    const metrics=entry.metrics;
    if (!Array.isArray(metrics) || !metrics.length || metrics.length>2 ||
        !unique(metrics) || metrics.some(v=>!METRICS.includes(v)))
      throw new Error(prefix+"metrics must contain pitch and/or events, without duplicates.");
    const annotation=validateAnnotation(entry.annotation);
    if (metrics.includes("pitch") && !annotation.pitch.length)
      throw new Error(prefix+"pitch scoring requires at least one independently annotated pitch point.");
    if (metrics.includes("events") && !eventType)
      throw new Error(prefix+"eventType must define the reference event, including negative controls.");
    // An empty event list is intentional negative ground truth when event scoring is requested.
    if (!metrics.includes("events") && annotation.eventsSeconds.length)
      throw new Error(prefix+"contains event labels but event scoring is disabled.");
    if (!metrics.includes("pitch") && annotation.pitch.length)
      throw new Error(prefix+"contains pitch labels but pitch scoring is disabled.");
    return {
      fileName,language,family,speaker,device,prompt,eventType,rights,
      metrics:[...metrics],annotation
    };
  });
  if (!unique(clips.map(row=>row.fileName.toLowerCase())))
    throw new Error("Audio filenames must be unique (case-insensitive).");
  return {schema:BENCHMARK_SCHEMA,dataset,provenance,notes,clips};
}

export function parseBenchmarkManifest(source) {
  if (typeof source!=="string" || source.length>MAX_REFERENCE_JSON_BYTES)
    throw new Error("Benchmark manifest must be JSON under 1 MB.");
  let value;
  try{value=JSON.parse(source);}catch{throw new Error("Benchmark manifest contains invalid JSON.");}
  return validateBenchmarkManifest(value);
}

export function warningsForEntry(entry,report=null) {
  const warnings=[];
  if (!entry.speaker) warnings.push("No pseudonymous speaker ID");
  if (!entry.family) warnings.push("Language family unrecorded");
  if (!entry.device) warnings.push("Recording device unrecorded");
  if (!entry.prompt) warnings.push("Prompt or elicitation task unrecorded");
  if (!entry.annotation.source) warnings.push("Reference annotation source unrecorded");
  if (entry.rights==="unknown") warnings.push("Recording rights not documented");
  if (entry.metrics.includes("events") && entry.eventType==="unspecified")
    warnings.push("Event type is unspecified");
  if (report?.truncated) warnings.push("Audio was truncated to first 20 seconds");
  return warnings;
}

/**
 * No audio input is retained. Accept a precomputed spectral analysis and an
 * annotation row; keeps all scoring logic pure for reproducible tests.
 */
export function evaluateBenchmarkEntry(entry,report) {
  if (!report || !Array.isArray(report.trace) || !Array.isArray(report.peakEvents))
    throw new Error("A valid analyzed spectral report is required.");
  if (!Number.isFinite(report.secondsAnalyzed) || report.secondsAnalyzed<=0)
    throw new Error("Invalid spectral report duration.");
  const pitch=entry.metrics.includes("pitch")?scorePitch(report,entry.annotation):null;
  const events=entry.metrics.includes("events")?scoreEvents(report,entry.annotation,.09):null;
  return {
    fileName:entry.fileName,
    language:entry.language,
    family:entry.family,
    speaker:entry.speaker,
    device:entry.device,
    prompt:entry.prompt,
    eventType:entry.eventType,
    rights:entry.rights,
    metrics:entry.metrics,
    annotationSource:entry.annotation.source,
    pitch,events,
    secondsAnalyzed:report.secondsAnalyzed,
    truncated:!!report.truncated,
    pitchMethod:report.pitchMethod || "unspecified",
    warnings:warningsForEntry(entry,report)
  };
}

function aggregateOneGroup(rows) {
  const pitchRows=rows.filter(r=>r.pitch);
  const eventRows=rows.filter(r=>r.events);
  const counters=pitchRows.reduce((a,row)=>{
    for(const key of ["tp","fp","fn","tn","jointlyVoiced","compared"])a[key]+=(row.pitch[key]??0);
    return a;
  },{tp:0,fp:0,fn:0,tn:0,jointlyVoiced:0,compared:0});
  const voicingPrecision=ratio(counters.tp,counters.tp+counters.fp);
  const voicingRecall=ratio(counters.tp,counters.tp+counters.fn);
  const eventCounts=eventRows.reduce((a,row)=>{
    for(const key of ["matched","predicted","reference"])a[key]+=(row.events[key]??0);
    return a;
  },{matched:0,predicted:0,reference:0});
  const eventPrecision=ratio(eventCounts.matched,eventCounts.predicted);
  const eventRecall=ratio(eventCounts.matched,eventCounts.reference);
  const pitchCents=mean(pitchRows.filter(r=>r.pitch.medianAbsoluteCents!==null)
    .map(r=>r.pitch.medianAbsoluteCents));
  const eventMs=mean(eventRows.filter(r=>r.events.meanTimingErrorMs!==null)
    .map(r=>r.events.meanTimingErrorMs));
  return {
    clips:rows.length,
    uniqueSpeakers:new Set(rows.map(r=>r.speaker).filter(Boolean)).size,
    languages:new Set(rows.map(r=>r.language)).size,
    pitchClips:pitchRows.length,eventClips:eventRows.length,
    pitchReferencePoints:counters.compared,
    jointlyVoiced:counters.jointlyVoiced,
    voicingPrecision,voicingRecall,voicingF1:f1(voicingPrecision,voicingRecall),
    macroMeanClipMedianAbsoluteCents:pitchCents,
    eventPredictions:eventCounts.predicted,
    eventReferences:eventCounts.reference,
    eventMatches:eventCounts.matched,
    eventPrecision,eventRecall,eventF1:f1(eventPrecision,eventRecall),
    macroMeanClipMatchedTimingErrorMs:eventMs,
    clipsWithWarnings:rows.filter(r=>r.warnings?.length).length
  };
}

/**
 * Results grouped by metadata. Means of clip medians are unweighted,
 * not uncertainty estimates. Missing labels are shown as "Unspecified".
 */
export function aggregateBenchmark(results,dimension="language") {
  if (!["language","family","speaker","device","prompt","eventType"].includes(dimension))
    throw new Error("Unsupported grouping dimension.");
  if (!Array.isArray(results) || results.length>BENCHMARK_LIMIT)
    throw new Error("Invalid number of benchmark results.");
  const map=new Map();
  for(const row of results) {
    if (!row || !row.fileName) throw new Error("Invalid benchmark result.");
    const key=(row[dimension]||"Unspecified").slice(0,TEXT_LIMIT);
    if (!map.has(key))map.set(key,[]);
    map.get(key).push(row);
  }
  if (map.size>MAX_SLICES) throw new Error("Too many benchmark groups.");
  const groups=[...map].map(([name,items])=>({name,...aggregateOneGroup(items)}))
    .sort((a,b)=>b.clips-a.clips||a.name.localeCompare(b.name));
  return {
    version:"benchmark-v1",
    total:aggregateOneGroup(results),
    dimension,
    groups,
    caveat:"These metrics are descriptive. Clips and frames can share speakers, microphones, prompts and annotators. Group differences have no estimated uncertainty or causal attribution; no language-universal claims are supported."
  };
}

export function prepareBenchmarkExport(manifest,results,failures=[]) {
  const safe=validateBenchmarkManifest(manifest);
  const valid=results.map(row=>({
    fileName:row.fileName,
    language:row.language,
    family:row.family,
    speaker:row.speaker,
    device:row.device,
    prompt:row.prompt,
    eventType:row.eventType,
    rights:row.rights,
    pitch:row.pitch,
    events:row.events,
    secondsAnalyzed:row.secondsAnalyzed,
    pitchMethod:row.pitchMethod,
    truncated:row.truncated,
    warnings:row.warnings
  }));
  return {
    schema:"ULGE.benchmark-results.v1",
    dataset:safe.dataset,
    provenance:safe.provenance,
    exportedAt:new Date().toISOString(),
    status:"exploratory-reference-evaluation",
    audioUploaded:false,
    caution:"No audio bytes are included, but filenames, derived features and metadata may still identify individuals. Annotation provenance is not independently verified.",
    completed:valid.length,
    expected:safe.clips.length,
    failures:failures.map(f=>({fileName:String(f.fileName).slice(0,160),error:String(f.error).slice(0,300)})),
    results:valid,
    summary:aggregateBenchmark(valid)
  };
}
