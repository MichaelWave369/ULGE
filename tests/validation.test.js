import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSpectrumChannels } from "../src/spectrum.js";
import {
  REFERENCE_SCHEMA, validateAnnotation, annotationTemplate, scorePitch,
  scoreEvents, compareRhythm, syntheticTone, syntheticPulses,
  runSyntheticBenchmarks
} from "../src/validation.js";

function reportFor(hz=200,duration=1){
  const signal=syntheticTone(hz,duration);
  return analyzeSpectrumChannels(signal.channels,signal.sampleRate);
}
const ref=(secondsAnalyzed,pitch=[],eventsSeconds=[])=>({
  schema:REFERENCE_SCHEMA,source:"Test annotations",secondsAnalyzed,pitch,eventsSeconds
});

test("annotation schema rejects arbitrary shape, duplicate time points, and overlong payload",()=>{
  assert.throws(()=>validateAnnotation({schema:"unknown",secondsAnalyzed:1,pitch:[],eventsSeconds:[],source:"x"}),/schema/);
  assert.throws(()=>validateAnnotation(ref(1,[{seconds:.1,hz:200},{seconds:.1,hz:null}])),/strictly increasing/);
  assert.throws(()=>validateAnnotation(ref(1,[{seconds:2,hz:200}])),/outside annotated excerpt/);
  assert.throws(()=>validateAnnotation(ref(1,[],Array.from({length:301},(_,i)=>i/400))),/Too many/);
  const template=annotationTemplate(2);
  assert.equal(template.schema,REFERENCE_SCHEMA);
  assert.equal(template.pitch.every(p=>p.hz===null),true);
});

test("accurate pitch labels produce low cents error and high voiced recall",()=>{
  const report=reportFor(200);
  const labels=[.2,.35,.5,.65,.8].map(seconds=>({seconds,hz:200}));
  const scored=scorePitch(report,ref(report.secondsAnalyzed,labels));
  assert.equal(scored.compared,5);
  assert.ok(scored.voicingRecall>=.8);
  assert.ok(scored.medianAbsoluteCents<55,JSON.stringify(scored));
  assert.equal(scored.grossPitchError20Percent,0);
});

test("voiced/unvoiced scoring preserves missing predictions",()=>{
  const report={secondsAnalyzed:1,trace:[
    {pitchHz:100},{pitchHz:null},{pitchHz:100},{pitchHz:null}
  ]};
  const points=[.125,.375,.625,.875].map((seconds,i)=>({seconds,hz:[100,100,null,null][i]}));
  const scored=scorePitch(report,ref(1,points));
  assert.deepEqual([scored.tp,scored.fn,scored.fp,scored.tn],[1,1,1,1]);
  assert.equal(scored.voicingPrecision,.5);
  assert.equal(scored.voicingRecall,.5);
});

test("event matching is one-to-one with explicit tolerance",()=>{
  const report={secondsAnalyzed:1,peakEvents:[.1,.11,.5,.9]};
  const result=scoreEvents(report,ref(1,[],[.1,.51]),.04);
  assert.equal(result.matched,2);
  assert.equal(result.falsePositives,2);
  assert.equal(result.missed,0);
  assert.equal(result.precision,.5);
  assert.equal(result.recall,1);
  assert.equal(result.f1,2/3);
});

test("empty event list does not create fabricated precision and recall",()=>{
  const score=scoreEvents({secondsAnalyzed:1,peakEvents:[]},ref(1,[],[]));
  assert.equal(score.precision,null);
  assert.equal(score.recall,null);
  assert.equal(score.f1,null);
});

test("pulse controls and rhythm comparisons are finite and descriptive",()=>{
  const signal=syntheticPulses();
  const report=analyzeSpectrumChannels(signal.channels,signal.sampleRate);
  const match=scoreEvents(report,ref(report.secondsAnalyzed,[],signal.events),.1);
  assert.ok(match.matched>=3,JSON.stringify(match));
  const pair=compareRhythm(report,report);
  assert.equal(pair.medianIntervalDifferenceSeconds,0);
  assert.equal(pair.cvDifference,0);
});

test("synthetic reference suite records known truth separately from measurements",()=>{
  const bench=runSyntheticBenchmarks();
  assert.equal(bench.kind,"synthetic-only");
  assert.equal(bench.tones.length,5);
  assert.ok(bench.totalCleanPassed>=4,JSON.stringify(bench.tones));
  assert.ok(bench.pulses.score.matched>=3);
});
