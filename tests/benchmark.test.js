import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSpectrumChannels } from "../src/spectrum.js";
import { syntheticTone } from "../src/validation.js";
import {
  BENCHMARK_SCHEMA, benchmarkTemplate, validateBenchmarkManifest,
  parseBenchmarkManifest, evaluateBenchmarkEntry, aggregateBenchmark,
  warningsForEntry, prepareBenchmarkExport
} from "../src/benchmark.js";

const annotation=(secondsAnalyzed=1)=>({
  schema:"ULGE.annotation.v1",source:"Independent test reference",
  secondsAnalyzed,pitch:[{seconds:.25,hz:200},{seconds:.5,hz:200}],
  eventsSeconds:[]
});
const entry=(fileName="spk1.wav")=>({
  fileName,language:"English",family:"Germanic",speaker:"speaker1",device:"USB mic",
  prompt:"read1",rights:"self-recorded",eventType:"",
  metrics:["pitch"],annotation:annotation()
});
const manifest=(clips=[entry()])=>({
  schema:BENCHMARK_SCHEMA,dataset:"Recorded speech test",provenance:"Known lab annotations",
  notes:"local only",clips
});

test("template starts empty and supplies no invented human data",()=>{
  const template=benchmarkTemplate();
  assert.equal(template.clips.length,0);
  assert.deepEqual(validateBenchmarkManifest(template).clips,[]);
});

test("manifest strips extra fields and validates per-file labels",()=>{
  const input=manifest([{...entry(),audioUrl:"blob:secret",annotation:{...annotation(),data:"raw waveform"}}]);
  const clean=validateBenchmarkManifest(input);
  assert.equal(clean.clips.length,1);
  assert.equal("audioUrl" in clean.clips[0],false);
  assert.equal("data" in clean.clips[0].annotation,false);
  assert.deepEqual(parseBenchmarkManifest(JSON.stringify(input)),clean);
});

test("empty event reference requires explicit event scoring and event type",()=>{
  const events={...entry("negative.wav"),metrics:["events"],eventType:"Acoustic pulse",
    annotation:{...annotation(),pitch:[],eventsSeconds:[]}};
  assert.deepEqual(validateBenchmarkManifest(manifest([events])).clips[0].annotation.eventsSeconds,[]);
  assert.throws(()=>validateBenchmarkManifest(manifest([{...events,eventType:""}])),/eventType/);
});

test("reject duplicate names, unsupported reference types and oversized manifest",()=>{
  assert.throws(()=>validateBenchmarkManifest(manifest([entry("A.wav"),entry("a.wav")])),/unique/);
  assert.throws(()=>validateBenchmarkManifest(manifest([entry("../secret.wav")])),/bare filename/);
  assert.throws(()=>validateBenchmarkManifest(manifest([{...entry(),metrics:[]}])),/metrics/);
  assert.throws(()=>parseBenchmarkManifest("not json"),/invalid JSON/);
  assert.throws(()=>validateBenchmarkManifest(manifest(Array.from({length:25},(_,i)=>entry("s"+i+".wav")))),/24/);
});

test("analyzed audio produces real pitch scores, not fabricated speech accuracy",()=>{
  const tone=syntheticTone(200,1);
  const spectral=analyzeSpectrumChannels(tone.channels,tone.sampleRate);
  const record=evaluateBenchmarkEntry(entry(),spectral);
  assert.equal(record.pitch.compared,2);
  assert.equal(record.events,null);
  assert.ok(record.pitch.voicingRecall>0);
  assert.equal(record.fileName,"spk1.wav");
});

test("missing metadata becomes an explicit warning",()=>{
  const record={...entry(),speaker:"",family:"",device:"",prompt:"",rights:"unknown"};
  const warnings=warningsForEntry(record);
  assert.ok(warnings.some(w=>w.includes("speaker")));
  assert.ok(warnings.some(w=>w.includes("rights")));
});

test("aggregates counts, macro clip medians and subgroup labels",()=>{
  const tone=syntheticTone(200,1);
  const report=analyzeSpectrumChannels(tone.channels,tone.sampleRate);
  const a=evaluateBenchmarkEntry(entry(),report);
  const b=evaluateBenchmarkEntry({...entry("s2.wav"),speaker:"speaker2",family:"Romance",language:"French"},report);
  const summary=aggregateBenchmark([a,b],"family");
  assert.equal(summary.total.clips,2);
  assert.equal(summary.total.uniqueSpeakers,2);
  assert.equal(summary.groups.length,2);
  assert.equal(summary.total.pitchClips,2);
  assert.equal(summary.total.pitchReferencePoints,4);
  assert.equal(summary.total.eventClips,0);
  assert.equal(summary.total.eventPrecision,null);
});

test("export carries scores and metadata but not audio blobs",()=>{
  const m=manifest();
  const tone=syntheticTone(200,1);
  const report=analyzeSpectrumChannels(tone.channels,tone.sampleRate);
  const row=evaluateBenchmarkEntry(entry(),report);
  const exported=prepareBenchmarkExport(m,[{...row,audioUrl:"blob:secret"}]);
  assert.equal(exported.audioUploaded,false);
  assert.equal(JSON.stringify(exported).includes("blob:secret"),false);
  assert.equal(exported.summary.total.clips,1);
});
