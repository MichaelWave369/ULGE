import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSpectrumChannels, estimatePitch, BAND_COUNT, DISPLAY_COLUMNS, MAX_SECONDS } from "../src/spectrum.js";
import { syntheticSignal } from "../src/audio.js";

function tone(hz, duration=2, amplitude=.5) {
  const sr=16000, samples=new Float32Array(Math.floor(sr*duration));
  for(let i=0;i<samples.length;i++)samples[i]=amplitude*Math.sin(2*Math.PI*hz*i/sr);
  return [samples];
}

test("spectrum has 10ms hop and bounded log-frequency matrix",()=>{
  const result=analyzeSpectrumChannels(tone(200,1.5),16000);
  assert.equal(result.hopMs,10);
  assert.equal(result.windowMs,64);
  assert.equal(result.bandCount,BAND_COUNT);
  assert.equal(result.columns.length,DISPLAY_COLUMNS);
  assert.equal(result.trace.length,DISPLAY_COLUMNS);
  assert.ok(result.totalFrames>100);
  for(const column of result.columns){
    assert.equal(column.length,BAND_COUNT);
    assert.ok(column.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  }
  assert.ok(result.trace.every(v=>v.t>=0&&v.t<=1));
  assert.equal(result.truncated,false);
});

test("pure 200Hz tone has approximate pitch in voiced frames",()=>{
  const result=analyzeSpectrumChannels(tone(200,1),16000);
  assert.ok(result.pitchMedianHz!==null);
  assert.ok(Math.abs(result.pitchMedianHz-200)<12,JSON.stringify(result.pitchMedianHz));
  assert.ok(result.voicedFraction>0.8);
});

test("quiet audio has no invented pitch or envelope peaks",()=>{
  const channels=[new Float32Array(16000)];
  const spectrum=analyzeSpectrumChannels(channels,16000);
  assert.equal(spectrum.pitchMedianHz,null);
  assert.equal(spectrum.voicedFraction,0);
  assert.deepEqual(spectrum.peakEvents,[]);
  assert.equal(estimatePitch(new Float32Array(1024),16000),null);
});

test("duration cap is explicit in metadata",()=>{
  const full=analyzeSpectrumChannels(tone(170,MAX_SECONDS+2),16000);
  assert.equal(full.truncated,true);
  assert.equal(full.secondsAnalyzed,MAX_SECONDS);
  assert.ok(full.totalFrames>1800);
});

test("synthetic periodic envelope yields candidate acoustic peaks",()=>{
  const source=syntheticSignal("harmonic");
  const report=analyzeSpectrumChannels(source.channels,source.sampleRate);
  assert.ok(report.peakEvents.length>=3,JSON.stringify(report.peakEvents));
  assert.ok(report.peakRatePerSecond>1);
});

test("same deterministic waveform produces same output",()=>{
  const x=tone(220,.6);
  const first=analyzeSpectrumChannels(x,16000);
  const second=analyzeSpectrumChannels(x,16000);
  assert.deepEqual(first,second);
});

test("fractional-lag refinement resolves a non-integer-period sine tone",()=>{
  const hz=233.7;
  const report=analyzeSpectrumChannels(tone(hz,1),16000);
  assert.equal(report.version,"spectral-v2");
  assert.match(report.pitchMethod,/parabolic/);
  assert.ok(report.pitchMedianHz!==null);
  assert.ok(Math.abs(report.pitchMedianHz-hz)<4,JSON.stringify(report.pitchMedianHz));
});
