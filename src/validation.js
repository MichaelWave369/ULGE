/**
 * ULGE validation-v1: transparent, deterministic reference scoring.
 * All reference annotations are user-supplied and unverified.
 * Nothing in this module asserts cross-language universality.
 */
import { analyzeSpectrumChannels } from "./spectrum.js";

export const REFERENCE_SCHEMA = "ULGE.annotation.v1";
export const VALIDATION_VERSION = "validation-v1";
export const MAX_PITCH_POINTS = 500;
export const MAX_REFERENCE_EVENTS = 300;
const MAX_SECONDS = 20;
const EPS = 1e-9;
const median = values => {
  if (!values.length) return null;
  const s=[...values].sort((a,b)=>a-b), m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
};
const mean = values => values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const finiteBetween = (n,lo,hi)=>typeof n==="number" && Number.isFinite(n) && n>=lo && n<=hi;
function requireValid(ok,message) { if(!ok)throw new Error(message); }
const ratio=(n,d)=>d?Math.round(n/d*10000)/10000:null;
const f1=(p,r)=>p===null||r===null?null:(p+r===0?0:2*p*r/(p+r));

export function annotationTemplate(duration=3) {
  return {
    schema:REFERENCE_SCHEMA,source:"Describe the annotator and reference method here",
    secondsAnalyzed:Math.min(MAX_SECONDS,Math.max(0.064,duration)),
    pitch:[{seconds:Number((Math.min(MAX_SECONDS,Math.max(0.064,duration))/3).toFixed(4)),hz:null},
      {seconds:Number((2*Math.min(MAX_SECONDS,Math.max(0.064,duration))/3).toFixed(4)),hz:null}],
    eventsSeconds:[],
    notes:"TEMPLATE ONLY: replace null pitch and empty event list with actual independently reviewed annotations. Null hz means explicitly unvoiced, NOT missing."
  };
}

export function validateAnnotation(value) {
  requireValid(value && typeof value==="object" && !Array.isArray(value),"Reference must be a JSON object.");
  requireValid(value.schema===REFERENCE_SCHEMA,"Unsupported reference annotation schema.");
  requireValid(finiteBetween(value.secondsAnalyzed,0.064,MAX_SECONDS),"Reference duration must be between 0.064 and 20 seconds.");
  requireValid(typeof value.source==="string" && value.source.length<=160,"Reference source must be text (max 160 characters).");
  requireValid(Array.isArray(value.pitch) && value.pitch.length<=MAX_PITCH_POINTS,"Too many or invalid pitch references.");
  requireValid(Array.isArray(value.eventsSeconds) && value.eventsSeconds.length<=MAX_REFERENCE_EVENTS,"Too many or invalid reference events.");
  const duration=value.secondsAnalyzed;
  let prev=-Infinity;
  const pitch=value.pitch.map((point,index)=>{
    requireValid(point&&typeof point==="object"&&!Array.isArray(point),"Invalid pitch reference point "+(index+1)+".");
    requireValid(finiteBetween(point.seconds,0,duration),"Pitch reference time outside annotated excerpt.");
    requireValid(point.seconds>prev,"Pitch reference times must be strictly increasing.");
    prev=point.seconds;
    requireValid(point.hz===null||finiteBetween(point.hz,30,1500),"Pitch reference hz must be null (unvoiced), or 30–1500 Hz.");
    return {seconds:point.seconds,hz:point.hz};
  });
  prev=-Infinity;
  const eventsSeconds=value.eventsSeconds.map((seconds)=>{
    requireValid(finiteBetween(seconds,0,duration),"Reference event outside annotated excerpt.");
    requireValid(seconds>prev,"Reference event times must be strictly increasing.");
    prev=seconds;
    return seconds;
  });
  return {
    schema:REFERENCE_SCHEMA,source:value.source.trim().slice(0,160),
    secondsAnalyzed:duration,pitch,eventsSeconds,
    notes:typeof value.notes==="string"?value.notes.slice(0,400):""
  };
}

/**
 * For provided reference points, compare to the nearest spectral summary
 * time-column midpoint. Annotators choose sample times independently.
 * No timing interpolation is performed over missing/unvoiced pitch values.
 */
export function scorePitch(report,annotation) {
  if (!report?.trace || !annotation) return null;
  const ref=validateAnnotation(annotation);
  if (Math.abs(ref.secondsAnalyzed-report.secondsAnalyzed)>0.05)
    throw new Error("Annotation duration does not match the analyzed excerpt (±50ms).");
  let tp=0,fp=0,fn=0,tn=0;
  const errors=[],absHz=[],relativeErrors=[],octaveErrors=[];
  for(const point of ref.pitch) {
    const index=Math.max(0,Math.min(report.trace.length-1,
      Math.round(point.seconds/report.secondsAnalyzed*report.trace.length-0.5)));
    const estimated=report.trace[index]?.pitchHz;
    const voiced=estimated!=null && Number.isFinite(estimated) && estimated>0;
    const annotated=point.hz!==null;
    if(voiced&&annotated) {
      tp++;
      const cents=1200*Math.log2(estimated/point.hz);
      errors.push(Math.abs(cents));
      absHz.push(Math.abs(estimated-point.hz));
      relativeErrors.push(Math.abs(estimated-point.hz)/point.hz);
      octaveErrors.push(Math.abs(Math.log2(estimated/point.hz))>0.85 &&
        Math.abs(Math.abs(Math.log2(estimated/point.hz))-1)<0.2);
    } else if(voiced&&!annotated)fp++;
    else if(!voiced&&annotated)fn++;
    else tn++;
  }
  const precision=ratio(tp,tp+fp), recall=ratio(tp,tp+fn);
  return {
    compared:ref.pitch.length,tp,fp,fn,tn,
    voicingPrecision:precision,voicingRecall:recall,voicingF1:f1(precision,recall),
    medianAbsoluteCents:median(errors),
    meanAbsoluteHz:mean(absHz),
    grossPitchError20Percent:errors.length?ratio(relativeErrors.filter(error=>error>0.2).length,errors.length):null,
    octaveErrorFraction:errors.length?ratio(octaveErrors.filter(Boolean).length,errors.length):null,
    jointlyVoiced:errors.length,
    limitation:"Reference time points can share the same trace column, and this score is not a population-level accuracy estimate."
  };
}

/** One-to-one, nearest-available matching with an explicit seconds tolerance. */
export function scoreEvents(report,annotation,tolerance=0.09) {
  if(!report?.peakEvents||!annotation)return null;
  const ref=validateAnnotation(annotation);
  if(Math.abs(ref.secondsAnalyzed-report.secondsAnalyzed)>0.05)
    throw new Error("Annotation duration does not match the analyzed excerpt (±50ms).");
  requireValid(finiteBetween(tolerance,0.01,0.25),"Event tolerance must be between 10 and 250 milliseconds.");
  const predictions=report.peakEvents.filter(t=>finiteBetween(t,0,report.secondsAnalyzed)).slice(0,300);
  const candidates=[];
  for(let i=0;i<predictions.length;i++){
    for(let j=0;j<ref.eventsSeconds.length;j++){
      const difference=Math.abs(predictions[i]-ref.eventsSeconds[j]);
      if(difference<=tolerance+EPS)candidates.push({i,j,difference});
    }
  }
  candidates.sort((a,b)=>a.difference-b.difference||a.i-b.i||a.j-b.j);
  const chosenPred=new Set(),chosenRef=new Set(),errors=[];
  for(const edge of candidates){
    if(chosenPred.has(edge.i)||chosenRef.has(edge.j))continue;
    chosenPred.add(edge.i);chosenRef.add(edge.j);errors.push(edge.difference);
  }
  const matched=errors.length;
  const precision=ratio(matched,predictions.length),recall=ratio(matched,ref.eventsSeconds.length);
  return {
    predicted:predictions.length,reference:ref.eventsSeconds.length,matched,
    falsePositives:predictions.length-matched,missed:ref.eventsSeconds.length-matched,
    precision,recall,f1:f1(precision,recall),
    meanTimingErrorMs:mean(errors)===null?null:mean(errors)*1000,
    toleranceMs:Math.round(tolerance*1000),
    limitation:"Event reference requires human-defined event types. Agreement only reflects the supplied annotation type and tolerance."
  };
}

function intervalStats(events) {
  if(!Array.isArray(events)||events.length<2)return {count:events?.length??0,medianInterval:null,meanInterval:null,coefficientVariation:null};
  const intervals=[];
  for(let i=1;i<events.length;i++){
    const gap=events[i]-events[i-1];
    if(Number.isFinite(gap)&&gap>0)intervals.push(gap);
  }
  const m=mean(intervals),variance=mean(intervals.map(v=>(v-m)**2));
  return {count:events.length,medianInterval:median(intervals),
    meanInterval:m,coefficientVariation:m?Math.sqrt(variance)/m:null};
}
export function compareRhythm(a,b) {
  if(!a?.peakEvents||!b?.peakEvents)return null;
  const left=intervalStats(a.peakEvents),right=intervalStats(b.peakEvents);
  return {
    A:left,B:right,
    medianIntervalDifferenceSeconds:
      left.medianInterval!=null&&right.medianInterval!=null?
      Math.abs(left.medianInterval-right.medianInterval):null,
    cvDifference:
      left.coefficientVariation!=null&&right.coefficientVariation!=null?
      Math.abs(left.coefficientVariation-right.coefficientVariation):null,
    limitation:"Energy peaks reflect acoustics, not annotated syllables. Timing differences depend on content, speech rate and recording conditions."
  };
}

/** Known-reference signals for a deterministic diagnostic, not speech validation. */
export function syntheticTone(hz,duration=.85,noiseAmplitude=0) {
  requireValid(finiteBetween(hz,70,420),"Tone frequency outside supported pitch range.");
  const sr=16000,samples=new Float32Array(Math.round(duration*sr));
  let seed=369;
  for(let i=0;i<samples.length;i++){
    seed=(Math.imul(1664525,seed)+1013904223)>>>0;
    const noise=((seed/4294967296)*2-1)*noiseAmplitude;
    const edge=Math.min(1,i/(sr*.04),(samples.length-i)/(sr*.04));
    samples[i]=edge*(.45*Math.sin(2*Math.PI*hz*i/sr)+noise);
  }
  return {channels:[samples],sampleRate:sr};
}
export function syntheticPulses(events=[.3,.72,1.14,1.56],duration=2) {
  const sr=16000,samples=new Float32Array(Math.round(duration*sr));
  for(let i=0;i<samples.length;i++){
    const t=i/sr;
    let envelope=0;
    for(const event of events)envelope+=Math.exp(-.5*((t-event)/.045)**2);
    samples[i]=Math.min(.8,envelope*.6)*Math.sin(2*Math.PI*180*t);
  }
  return {channels:[samples],sampleRate:sr,events};
}
export function runSyntheticBenchmarks() {
  const tones=[110,155,200,267,360];
  const results=tones.map(hz=>{
    const signal=syntheticTone(hz);
    const measured=analyzeSpectrumChannels(signal.channels,signal.sampleRate);
    const detected=measured.pitchMedianHz;
    const cents=detected===null?null:1200*Math.log2(detected/hz);
    return {name:hz+" Hz clean sine",referenceHz:hz,detectedHz:detected,
      centsError:cents,voicedFraction:measured.voicedFraction,
      pass:cents!==null&&Math.abs(cents)<=50&&measured.voicedFraction>=0.6};
  });
  const noisy=syntheticTone(220,.85,.08);
  const noisyResult=analyzeSpectrumChannels(noisy.channels,noisy.sampleRate);
  const ref=syntheticPulses();
  const report=analyzeSpectrumChannels(ref.channels,ref.sampleRate);
  const pulseAnnotation=validateAnnotation({
    schema:REFERENCE_SCHEMA,source:"Synthetic Gaussian-pulse generator",
    secondsAnalyzed:report.secondsAnalyzed,pitch:[],eventsSeconds:ref.events
  });
  return {
    version:VALIDATION_VERSION,kind:"synthetic-only",
    message:"Synthetic controls test the machinery; they do not establish accuracy on annotated human speech.",
    tones:results,
    totalCleanPassed:results.filter(v=>v.pass).length,
    totalClean:results.length,
    noisyTone:{referenceHz:220,detectedHz:noisyResult.pitchMedianHz,voicedFraction:noisyResult.voicedFraction},
    pulses:{expectedEvents:ref.events,detectedEvents:report.peakEvents,score:scoreEvents(report,pulseAnnotation,.09)}
  };
}
