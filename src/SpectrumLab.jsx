import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowUpRight, AudioLines, Download, Info, Layers3, RadioTower, Waves } from "lucide-react";
import { spectralExport } from "./spectrum.js";
import "./spectrum.css";

const PLOT={left:52,right:950,top:20,bottom:184};
const x=t=>PLOT.left+Math.max(0,Math.min(1,t))*(PLOT.right-PLOT.left);
const yPitch=hz=>PLOT.bottom-(hz-70)/350*(PLOT.bottom-PLOT.top);
const yEnergy=value=>PLOT.bottom-value*(PLOT.bottom-PLOT.top);
const num=value=>typeof value==="number"&&Number.isFinite(value)?value.toFixed(1):"—";

function downloadFeatureJSON(clips){
  const report={
    schema:"ULGE.spectral-observatory.v1",
    exportedAt:new Date().toISOString(),
    explanation:"Local acoustic analysis of the first 20 seconds; logarithmic spectrogram intensity is normalized within each clip. Pitch and envelope peaks are exploratory.",
    A:spectralExport(clips.A),B:spectralExport(clips.B)
  };
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download="ULGE-spectral-analysis.json";
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Spectrogram({spectrum}){
  const ref=useRef(null);
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext("2d");
    if(!canvas||!ctx)return;
    let cancelled=false;
    function draw(){
      if(cancelled)return;
      const w=Math.max(260,Math.floor(canvas.clientWidth)),h=Math.max(200,Math.floor(canvas.clientHeight));
      const ratio=Math.min(2,window.devicePixelRatio||1);
      canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
      ctx.setTransform(ratio,0,0,ratio,0,0);
      ctx.fillStyle="#081322";ctx.fillRect(0,0,w,h);
      if(!spectrum?.columns?.length)return;
      const cols=spectrum.columns,bands=spectrum.bandCount;
      for(let col=0;col<cols.length;col++){
        const left=col*w/cols.length,right=(col+1)*w/cols.length;
        for(let row=0;row<bands;row++){
          const value=cols[col][row];
          const hue=222-value*183;
          const saturation=55+value*40;
          const lightness=8+value*65;
          ctx.fillStyle="hsl("+hue.toFixed(1)+","+saturation.toFixed(1)+"%,"+lightness.toFixed(1)+"%)";
          const top=(bands-row-1)*h/bands,bottom=(bands-row)*h/bands;
          ctx.fillRect(left,top,Math.ceil(right-left),Math.ceil(bottom-top));
        }
      }
      // Vertical guides at fifths for relative progression.
      ctx.strokeStyle="rgba(230,247,255,.15)";
      ctx.setLineDash([3,6]);
      for(let i=1;i<5;i++){
        const px=i*w/5;ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,h);ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    draw();
    window.addEventListener("resize",draw);
    return()=>{cancelled=true;window.removeEventListener("resize",draw);};
  },[spectrum]);
  return <canvas ref={ref} className="spectrum-canvas" role="img"
    aria-label={spectrum?"Log-frequency 80 to 8000 hertz, 160 time columns, intensity normalized within the recording.":"No spectral data available. Analyze a sample."} />;
}
function trackPath(trace,field){
  if(!trace?.length)return "";
  let s="",started=false;
  for(let i=0;i<trace.length;i++){
    const value=trace[i][field],px=x(trace[i].t);
    if(value===null||!Number.isFinite(value)){started=false;continue;}
    const py=field==="pitchHz"?yPitch(value):yEnergy(value);
    s+=(started?"L":"M")+px.toFixed(2)+","+py.toFixed(2)+" ";
    started=true;
  }
  return s.trim();
}
function Timeline({a,b,mode,cursor}){
  const aTrack=a?.trace,bTrack=b?.trace;
  const domain=[0,.25,.5,.75,1];
  const yValues=mode==="pitchHz"?[70,140,210,280,350,420]:[0,.25,.5,.75,1];
  return <svg className="spectrum-timeline" viewBox="0 0 1000 225" role="img"
    aria-label={mode==="pitchHz"?"Pitch candidates in hertz, cyan A and violet B. Gaps are unvoiced.":"Normalized RMS energy envelope, cyan A and violet B, with acoustic peak candidates"}>
    {domain.map((t,i)=><g key={i}>
      <line x1={x(t)} x2={x(t)} y1={PLOT.top} y2={PLOT.bottom} stroke="#284158" strokeDasharray="4 6"/>
      <text x={x(t)} y="210" textAnchor="middle" fontSize="11" fill="#91aac0">{Math.round(t*100)}%</text>
    </g>)}
    {yValues.map((v,i)=><g key={i}>
      <line x1={PLOT.left} x2={PLOT.right} y1={mode==="pitchHz"?yPitch(v):yEnergy(v)}
        y2={mode==="pitchHz"?yPitch(v):yEnergy(v)} stroke="rgba(112,148,178,.2)" strokeDasharray="5 6"/>
      <text x={PLOT.left-8} y={(mode==="pitchHz"?yPitch(v):yEnergy(v))+4} textAnchor="end" fontSize="11" fill="#829db5">{mode==="pitchHz"?v:v.toFixed(2)}</text>
    </g>)}
    {[[aTrack,"#59def0",a],[bTrack,"#c299fc",b]].map(([trace,color,report],index)=><g key={index}>
      <path d={trackPath(trace,mode)} stroke={color} strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      {mode==="rms"&&report?.peakEvents?.map((t,i)=>{
        const progress=t/report.secondsAnalyzed;
        const idx=Math.min(trace.length-1,Math.max(0,Math.round(progress*(trace.length-1))));
        return <circle key={i} cx={x(progress)} cy={yEnergy(trace[idx].rms)} r="3.5" stroke="#0b1522" strokeWidth="1.8" fill={color}/>;
      })}
    </g>)}
    <line x1={x(cursor/100)} x2={x(cursor/100)} y1={PLOT.top} y2={PLOT.bottom} stroke="rgba(248,250,255,.9)" strokeDasharray="2 5"/>
    <text x="500" y="223" textAnchor="middle" fill="#7792a9" fontSize="10">RELATIVE TIME · 0% TO 100% OF ANALYZED EXCERPT</text>
  </svg>;
}

function Detail({name,report}){
  const placeholder="—";
  return <div className="spectrum-detail">
    <div className="spectrum-detail-title">{name} <span>{report?.version||"NO SPECTRAL DATA"}</span></div>
    <div className="spectrum-detail-grid">
      <div><span>Median pitch candidate</span><strong>{report?.pitchMedianHz==null?placeholder:num(report.pitchMedianHz)+" Hz"}</strong></div>
      <div><span>Estimated voiced windows</span><strong>{report?Math.round(report.voicedFraction*100)+"%":placeholder}</strong></div>
      <div><span>Envelope peak candidates</span><strong>{report?report.peakEvents.length:placeholder}</strong></div>
      <div><span>Peak rate (not syllables)</span><strong>{report?.peakRatePerSecond==null?placeholder:num(report.peakRatePerSecond)+"/s"}</strong></div>
      <div><span>Hop and window</span><strong>{report?report.hopMs+" / "+report.windowMs+" ms":placeholder}</strong></div>
      <div><span>Analyzed / source</span><strong>{report?num(report.secondsAnalyzed)+" / "+num(report.sourceDuration)+"s":placeholder}</strong></div>
    </div>
    {report?.truncated&&<p className="spectrum-truncated">Only the first 20 seconds were analyzed for the spectrogram. This is not a whole-recording analysis.</p>}
  </div>;
}

export default function SpectrumLab({a,b}){
  const [selected,setSelected]=useState("A");
  const [metric,setMetric]=useState("pitchHz");
  const [cursor,setCursor]=useState(50);
  const current=(selected==="A"?a:b)?.spectral;
  const sa=a?.spectral,sb=b?.spectral;
  const count=[sa,sb].filter(Boolean).length;
  const atCursor=(report)=>{
    if(!report?.trace?.length)return null;
    return report.trace[Math.min(report.trace.length-1,Math.round(cursor/100*(report.trace.length-1)))];
  };
  const aValue=atCursor(sa)?.[metric],bValue=atCursor(sb)?.[metric];
  return <section className="spectrum-section" id="spectrogram">
    <div className="container">
      <div className="section-heading">
        <div><span className="kicker">03 / FREQUENCY & VOICE</span><h2>See the frequencies. <span>Follow the rhythm.</span></h2></div>
        <div className="heading-corner">SPECTRAL ENGINE / V0.4</div>
      </div>
      <p className="spectrum-lead">A dense, local-first spectrogram tracks sound every 10 milliseconds across the first 20 seconds of each recording. Explore tentative pitch contours and acoustic envelope peaks, then test whether the patterns survive different speakers and recording conditions.</p>
      <div className="spectrum-shell">
        <div className="spectrum-top">
          <div className="spectrum-title"><Layers3 size={17}/><strong>Log-frequency spectrogram</strong><span>80–8000 Hz · clip-relative intensity</span></div>
          <div className="spectrum-select" role="group" aria-label="Spectrogram sample">
            <button type="button" className={selected==="A"?"active":""} onClick={()=>setSelected("A")}>A · Cyan</button>
            <button type="button" className={selected==="B"?"active":""} onClick={()=>setSelected("B")}>B · Violet</button>
          </div>
        </div>
        <div className="spectrum-display">
          <div className="spectrum-frequency-axis"><span>8 kHz</span><span>800 Hz</span><span>80 Hz</span></div>
          <Spectrogram spectrum={current}/>
        </div>
        <div className="spectrum-ticks"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
        {!current&&<div className="spectrum-empty"><Info size={16}/> No spectrogram in this sample. Analyze or load audio in the Observatory above.</div>}
        <div className="spectrum-diagnostics">
          <Detail name="Sample A" report={sa}/>
          <Detail name="Sample B" report={sb}/>
        </div>
      </div>
      <div className="spectrum-trace-panel">
        <div className="spectrum-top">
          <div className="spectrum-title"><AudioLines size={17}/><strong>Pitch and energy contours</strong><span>Unvoiced pitch estimates are gaps, not zeros</span></div>
          <div className="spectrum-select" role="group" aria-label="Acoustic track type">
            <button type="button" className={metric==="pitchHz"?"active":""} onClick={()=>setMetric("pitchHz")}>Pitch · Hz</button>
            <button type="button" className={metric==="rms"?"active":""} onClick={()=>setMetric("rms")}>Energy · RMS</button>
          </div>
        </div>
        <div className="spectrum-timeline-wrap">
          <div className="spectrum-legend"><span><i className="legend-dot a"/> A · {a?.name}</span><span><i className="legend-dot b"/> B · {b?.name}</span></div>
          <Timeline a={sa} b={sb} mode={metric} cursor={cursor}/>
          <label className="spectrum-scrubber">INSPECT PROGRESS <span>{cursor}%</span>
            <input type="range" min="0" max="100" value={cursor} onChange={event=>setCursor(Number(event.target.value))}/>
          </label>
          <div className="spectrum-readout"><span>A · {aValue==null?"—":num(aValue)} {metric==="pitchHz"?"Hz":""}</span>
            <span>B · {bValue==null?"—":num(bValue)} {metric==="pitchHz"?"Hz":""}</span>
            <span>{count}/2 samples available</span></div>
        </div>
        <div className="spectrum-bottom">
          <div className="spectrum-caveat"><Info size={16}/>
            <p><strong>No automated syllable count or speech understanding.</strong> The pitch trace comes from basic windowed autocorrelation and may contain octave errors. Energy peaks are acoustic candidates, not validated syllables. Spectrogram colors normalize within each clip, so they cannot compare absolute loudness.</p>
          </div>
          <button type="button" disabled={!count} className="spectrum-export" onClick={()=>downloadFeatureJSON({A:a,B:b})}>
            <Download size={16}/> Export spectral JSON
          </button>
        </div>
      </div>
      <div className="spectrum-documentation"><RadioTower size={16}/> The analysis is local, bounded and reproducible. Read the <a href="https://github.com/MichaelWave369/ULGE/blob/main/docs/SPECTRAL_PROTOCOL.md" target="_blank" rel="noreferrer">Spectral Protocol <ArrowUpRight size={14}/></a> for limitations and future tests.</div>
    </div>
  </section>;
}
