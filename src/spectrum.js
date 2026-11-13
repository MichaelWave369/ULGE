/**
 * ULGE spectral-v1: local, exploratory acoustic analysis.
 * 10ms hop, 64ms Hann windows, 16kHz resampling, first 20s maximum.
 * Pitch: rough windowed normalized autocorrelation, not phoneme/formant analysis.
 * Rhythm: envelope peak candidates, NEVER claimed as syllable counts.
 */
export const SPECTRAL_VERSION = "spectral-v2";
export const RATE = 16000;
export const FFT_SIZE = 1024;
export const HOP_SIZE = 160;
export const MAX_SECONDS = 20;
export const BAND_COUNT = 40;
export const DISPLAY_COLUMNS = 160;
export const TRACK_POINTS = 160;
const EPS = 1e-12;
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
const median = values => {
  if (!values.length) return null;
  const copy=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(copy.length/2);
  return copy.length%2 ? copy[middle] : (copy[middle-1]+copy[middle])/2;
};

function fftMagnitudes(frame) {
  const n=frame.length;
  const re = new Float64Array(n), im = new Float64Array(n);
  for(let i=0;i<n;i++) re[i] = frame[i] * (0.5-0.5*Math.cos(2*Math.PI*i/(n-1)));
  for(let i=1,j=0;i<n;i++) {
    let bit=n>>1;
    for(;j&bit;bit>>=1)j^=bit;
    j^=bit;
    if(i<j) { const v=re[i];re[i]=re[j];re[j]=v; }
  }
  for(let size=2;size<=n;size*=2){
    const half=size/2, angle=-2*Math.PI/size;
    for(let start=0;start<n;start+=size){
      for(let j=0;j<half;j++){
        const wr=Math.cos(angle*j),wi=Math.sin(angle*j),a=start+j,b=a+half;
        const tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];
        re[b]=re[a]-tr;im[b]=im[a]-ti;
        re[a]+=tr;im[a]+=ti;
      }
    }
  }
  const mags=new Float64Array(n/2);
  for(let i=1;i<mags.length;i++)mags[i]=Math.hypot(re[i],im[i]);
  return mags;
}

/** Rough pitch candidate; suppress ambiguous/noisy frames. */
export function estimatePitch(frame, sampleRate=RATE) {
  if(!frame || frame.length<128) return null;
  let energy=0, avg=0;
  // Decimate 16kHz to 8kHz so the pitch estimator is affordable in browsers.
  const n=Math.floor(frame.length/2), data=new Float64Array(n);
  for(let i=0;i<n;i++){data[i]=(frame[i*2]+frame[i*2+1])*0.5;avg+=data[i];}
  avg/=n;
  for(let i=0;i<n;i++){data[i]-=avg;energy+=data[i]*data[i];}
  if(Math.sqrt(energy/n)<0.012) return null;
  const effectiveRate=sampleRate/2;
  const minLag=Math.max(2,Math.floor(effectiveRate/420));
  const maxLag=Math.min(n-2,Math.ceil(effectiveRate/70));
  let bestLag=0,bestScore=0;
  const scores=new Float64Array(maxLag+1);
  for(let lag=minLag;lag<=maxLag;lag++){
    let dot=0,a2=0,b2=0;
    for(let j=0;j<n-lag;j++){
      const a=data[j],b=data[j+lag];
      dot+=a*b;a2+=a*a;b2+=b*b;
    }
    const score=dot/(Math.sqrt(a2*b2)+EPS);
    scores[lag]=score;
    if(score>bestScore){bestScore=score;bestLag=lag;}
  }
  if(bestScore<0.75) return null;
  // Prefer the earliest strong local peak to reduce octave errors.
  for(let lag=minLag+1;lag<maxLag;lag++){
    if(scores[lag]>=0.82 && scores[lag]>=scores[lag-1] &&
        scores[lag]>=scores[lag+1] && scores[lag]>=bestScore*0.92) {
      bestLag=lag;bestScore=scores[lag];break;
    }
  }
  // Parabolic interpolation gives sub-sample lag precision, reducing
  // integer-lag quantization on clean periodic signals. This does NOT
  // correct octave errors or guarantee pitch accuracy on real speech.
  let refinedLag=bestLag;
  if(bestLag>minLag && bestLag<maxLag) {
    const left=scores[bestLag-1],center=scores[bestLag],right=scores[bestLag+1];
    const denominator=left-2*center+right;
    if(Number.isFinite(denominator)&&Math.abs(denominator)>1e-10) {
      const offset=0.5*(left-right)/denominator;
      if(Number.isFinite(offset))refinedLag+=Math.max(-0.5,Math.min(0.5,offset));
    }
  }
  const hz=effectiveRate/refinedLag;
  if(hz<70 || hz>420 || !Number.isFinite(hz))return null;
  return Math.round(hz*10)/10;
}

function toMono16k(channels,sourceRate,duration) {
  const length=Math.floor(duration*RATE), result=new Float32Array(length);
  const usable=Math.min(...channels.map(channel=>channel.length));
  for(let i=0;i<length;i++){
    const position=i*sourceRate/RATE,lo=Math.min(usable-1,Math.floor(position)),hi=Math.min(usable-1,lo+1);
    const f=position-lo;
    let value=0;
    for(const channel of channels)value+=channel[lo]*(1-f)+channel[hi]*f;
    result[i]=value/channels.length;
  }
  return result;
}

/**
 * Frequency bins are grouped into fixed log-scaled bands, 80..8000 Hz.
 * Each spectrum is relative to the maximum band energy IN THAT CLIP.
 * Thus colors in two clips are not calibrated sound-pressure comparisons.
 */
function bandIndexForHz(hz) {
  if(hz<=80)return 0;
  return Math.min(BAND_COUNT-1,Math.floor(Math.log(hz/80)/Math.log(8000/80)*BAND_COUNT));
}
const round=(value,digits=3)=>Number((Number.isFinite(value)?value:0).toFixed(digits));

function summarizeWindows(windows,seconds,sourceDuration,sourceRate,peakEvents) {
  const n=windows.length, columns=[], trace=[];
  let globalPeak=EPS;
  for(const window of windows) for(const energy of window.bands)globalPeak=Math.max(globalPeak,energy);
  for(let column=0;column<DISPLAY_COLUMNS;column++){
    const first=Math.floor(column*n/DISPLAY_COLUMNS);
    const last=Math.max(first+1,Math.floor((column+1)*n/DISPLAY_COLUMNS));
    const subset=windows.slice(first,last);
    const bandValues=Array.from({length:BAND_COUNT},(_,index)=>{
      let value=0;
      for(const row of subset)value=Math.max(value,row.bands[index]);
      const db=10*Math.log10((value+EPS)/globalPeak);
      return round(clamp((db+72)/72),2);
    });
    columns.push(bandValues);
    const rms=mean(subset.map(row=>row.rms));
    const pitch=median(subset.map(row=>row.pitch).filter(value=>value!=null));
    trace.push({
      t:round(((column+0.5)/DISPLAY_COLUMNS)*seconds/seconds,4),
      rms:round(clamp(rms/0.25)),
      pitchHz:pitch===null?null:round(pitch,1),
      voicedFraction:round(subset.filter(row=>row.pitch!=null).length/subset.length)
    });
  }
  const voiced=windows.map(row=>row.pitch).filter(value=>value!==null);
  return {
    version:SPECTRAL_VERSION,
    pitchMethod:"normalized-autocorrelation-with-parabolic-lag-v2",
    sampleRate:RATE,
    sourceSampleRate:sourceRate,
    frameSamples:FFT_SIZE,
    hopSamples:HOP_SIZE,
    hopMs:10,
    windowMs:64,
    frequenciesHz:[80,8000],
    bandCount:BAND_COUNT,
    secondsAnalyzed:round(seconds,3),
    sourceDuration:round(sourceDuration,3),
    truncated:sourceDuration>seconds+0.001,
    totalFrames:windows.length,
    columns,
    trace,
    pitchMedianHz:median(voiced)===null?null:round(median(voiced),1),
    voicedFraction:round(voiced.length/windows.length),
    peakEvents:peakEvents.map(t=>round(t,3)),
    peakRatePerSecond:peakEvents.length>1?round((peakEvents.length-1)/(peakEvents.at(-1)-peakEvents[0]),2):null
  };
}

/**
 * Analyze the *first* 20 seconds, with continuous 10ms hop.
 * Larger files don't silently masquerade as fully analyzed recordings.
 */
export function analyzeSpectrumChannels(channels,sampleRate) {
  if(!Array.isArray(channels) || !channels.length || channels.some(ch=>!ch?.length) ||
      !Number.isFinite(sampleRate) || sampleRate<8000 || sampleRate>192000)
    throw new Error("Valid decoded audio channels and a supported sample rate (8–192 kHz) are required.");
  const sourceLength=Math.min(...channels.map(ch=>ch.length));
  const sourceDuration=sourceLength/sampleRate;
  if(sourceDuration<FFT_SIZE/RATE)throw new Error("Recording is too short for the 64ms spectral window.");
  const duration=Math.min(MAX_SECONDS,sourceDuration);
  const mono=toMono16k(channels,sampleRate,duration);
  const frame=new Float64Array(FFT_SIZE);
  const windows=[],nFrames=Math.floor((mono.length-FFT_SIZE)/HOP_SIZE)+1;
  for(let i=0;i<nFrames;i++) {
    const start=i*HOP_SIZE;
    let sq=0;
    for(let j=0;j<FFT_SIZE;j++){
      frame[j]=mono[start+j];
      sq+=frame[j]*frame[j];
    }
    const rms=Math.sqrt(sq/FFT_SIZE);
    const spectrum=fftMagnitudes(frame);
    const bands=new Float64Array(BAND_COUNT);
    for(let k=1;k<spectrum.length;k++){
      const hz=k*RATE/FFT_SIZE;
      bands[bandIndexForHz(hz)]+=spectrum[k]*spectrum[k];
    }
    const pitch=rms>=0.012?estimatePitch(frame,RATE):null;
    windows.push({rms,bands,pitch});
  }
  // Moving average energy envelope, peak suppression at 140ms refractory.
  const envelope=windows.map((row,i)=>{
    let total=0,count=0;
    for(let j=Math.max(0,i-3);j<=Math.min(windows.length-1,i+3);j++){
      total+=windows[j].rms;count++;
    }
    return total/count;
  });
  const maxEnv=Math.max(...envelope);
  const threshold=Math.max(0.013,maxEnv*0.3);
  const peaks=[];
  const minGap=14;
  for(let i=1;i<envelope.length-1;i++){
    if(envelope[i]<threshold || envelope[i]<envelope[i-1] || envelope[i]<=envelope[i+1])continue;
    const seconds=(i*HOP_SIZE+FFT_SIZE/2)/RATE;
    if(peaks.length && i-peaks[peaks.length-1].index<minGap){
      if(envelope[i]>peaks[peaks.length-1].energy)peaks[peaks.length-1]={index:i,t:seconds,energy:envelope[i]};
      continue;
    }
    peaks.push({index:i,t:seconds,energy:envelope[i]});
  }
  return summarizeWindows(windows,duration,sourceDuration,sampleRate,peaks.map(p=>p.t));
}

export function analyzeSpectrumAudioBuffer(buffer) {
  if(!buffer || !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels<1)
    throw new Error("Decoded audio buffer is required.");
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  return analyzeSpectrumChannels(channels,buffer.sampleRate);
}

export function spectralExport(clip) {
  if(!clip?.spectral)return null;
  const s=clip.spectral;
  return {
    name:String(clip.name || "Unnamed").slice(0,160),
    kind:clip.kind,
    language:clip.language,
    spectral:s
  };
}
