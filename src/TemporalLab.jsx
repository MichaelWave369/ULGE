import React, { useMemo, useState } from "react";
import { Activity, ArrowUpRight, AudioLines, CircleHelp, GitCompareArrows, ScanLine, Waves } from "lucide-react";
import { compareTemporalTracks, resampleTrack } from "./temporal.js";
import "./temporal.css";

const KEYS = [
  { key: "energy", label: "Signal energy", desc: "Relative frame RMS (clipped to 0–1)" },
  { key: "brightness", label: "Brightness", desc: "Spectral centroid" },
  { key: "spread", label: "Spectral spread", desc: "Frequency dispersion" },
  { key: "low", label: "Low frequencies", desc: "Energy fraction below 600 Hz" },
  { key: "high", label: "High frequencies", desc: "Energy fraction above 3000 Hz" },
  { key: "texture", label: "Texture", desc: "Spectral flatness" },
  { key: "crossings", label: "Zero crossings", desc: "Sign changes" }
];
const X0 = 34, X1 = 858, Y0 = 22, Y1 = 180;
const x = i => X0 + i / 63 * (X1 - X0);
const y = v => Y1 - Math.max(0, Math.min(1, v)) * (Y1 - Y0);
const fmt = value => typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "—";

function linePath(track, key) {
  if (!track) return "";
  return track.map((f, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(f[key]).toFixed(1)).join(" ");
}

function TrackChart({ a, b, keyName, cursor }) {
  const pa = useMemo(() => a ? resampleTrack(a, 64) : null, [a]);
  const pb = useMemo(() => b ? resampleTrack(b, 64) : null, [b]);
  const pointerX = X0 + cursor / 100 * (X1 - X0);
  return <svg className="temporal-chart" viewBox="0 0 890 234" role="img"
    aria-label={"Relative recording progress from 0 to 100 percent. Cyan shows A and violet B for " + keyName + ". The vertical marker is an inspection cursor."}>
    {[0,0.25,0.5,0.75,1].map((value, i) => <g key={i}>
      <line x1={X0} x2={X1} y1={y(value)} y2={y(value)} stroke="#294356" strokeDasharray={i===0?"0":"4 6"} strokeWidth="1"/>
      <text x={X0 - 9} y={y(value)+4} fill="#7891a7" textAnchor="end" fontSize="10">{value.toFixed(2)}</text>
      <text x={X0 + (X1-X0)*value} y="211" fill="#8095a9" textAnchor="middle" fontSize="10">{(value*100).toFixed(0)}%</text>
    </g>)}
    <path d={linePath(pa, keyName)} fill="none" stroke="#56ddec" strokeWidth="2.6"
      strokeLinejoin="round" strokeLinecap="round"/>
    <path d={linePath(pb, keyName)} fill="none" stroke="#c09bfa" strokeWidth="2.4"
      strokeLinejoin="round" strokeLinecap="round" opacity=".86" />
    <line x1={pointerX} x2={pointerX} y1={Y0-4} y2={Y1+4} stroke="#deebf7" strokeDasharray="4 5" opacity=".68"/>
    {[[pa,"#59def0"],[pb,"#c6a5ff"]].map(([rows,color],i) =>
      rows && <circle key={i} cx={pointerX} cy={y(rows[Math.round(cursor/100*63)][keyName])} r="4.4"
        fill={color} stroke="#101c29" strokeWidth="2"/>)}
    <text x="446" y="231" fill="#718ba2" fontSize="10" textAnchor="middle">NORMALIZED RECORDING PROGRESS · NOT PHONEME ALIGNED</text>
  </svg>;
}

function AlignmentMap({ comparison }) {
  if (!comparison) return <div className="temporal-empty"><ScanLine size={24} /> Two temporal tracks are needed for alignment.</div>;
  const cell = 8, start = 25, total = 32 * cell;
  const points = comparison.path.map(([i,j]) =>
    (start + i*cell + cell/2).toFixed(1) + "," + (start + (31-j)*cell + cell/2).toFixed(1)).join(" ");
  return <svg viewBox="0 0 310 312" className="temporal-align-svg" role="img" aria-label="Local acoustic feature distances in a 32 by 32 matrix and a constrained dynamic time warping alignment path. Horizontal A, vertical B.">
    <rect x={start} y={start} width={total} height={total} rx="4" fill="#0a1220" stroke="#426074"/>
    {comparison.cost.map((row,i)=>row.map((value,j) =>
      <rect key={i+"-"+j} x={start+i*cell} y={start+(31-j)*cell} width={cell-0.5} height={cell-0.5}
        fill={"rgba(82,187,225,"+(0.065+value*0.86).toFixed(3)+")"} />))}
    <polyline points={points} fill="none" stroke="#f1c982" strokeWidth="2.5" strokeLinejoin="round"
      strokeLinecap="round"/>
    <text x={start+total/2} y="303" textAnchor="middle" fill="#8da9c0" fontSize="11">A →</text>
    <text x="10" y={start+total/2} textAnchor="middle" fill="#8da9c0" fontSize="11"
      transform={"rotate(-90 10 "+(start+total/2)+")"}>B →</text>
  </svg>;
}

export default function TemporalLab({ clipA, clipB }) {
  const [feature, setFeature] = useState("energy");
  const [cursor, setCursor] = useState(50);
  const a = clipA?.temporal || null, b = clipB?.temporal || null;
  const comparison = useMemo(() => {
    if (!a || !b) return null;
    try { return compareTemporalTracks(a, b); } catch { return null; }
  }, [a,b]);
  const left = useMemo(() => a ? resampleTrack(a,64) : null, [a]);
  const right = useMemo(() => b ? resampleTrack(b,64) : null, [b]);
  const chosen = KEYS.find(item => item.key === feature);
  const index = Math.round(cursor / 100 * 63);
  const activeFraction = track => track?.frames?.length
    ? Math.round(track.frames.filter(row => row.active).length / track.frames.length * 100) + "%" : "—";
  return <section id="temporal" className="temporal-section">
    <div className="container">
      <div className="section-heading">
        <div><span className="kicker">02 / TEMPORAL ACOUSTICS</span>
          <h2>The sound doesn't stand still. <span>Neither should the data.</span></h2></div>
        <div className="heading-corner">SEQUENCE ENGINE / V0.3</div>
      </div>
      <p className="temporal-lead">
        Static acoustic fingerprints average away timing. These traces preserve how seven simple
        sound measurements change throughout a recording. Compare the time sequences before
        imagining language-level patterns.
      </p>
      <div className="temporal-grid">
        <div className="temporal-panel temporal-main">
          <div className="temporal-panel-heading">
            <div><Waves size={18}/><h3>Feature evolution</h3></div>
            <span className="temporal-bubble">64 SAMPLED WINDOWS MAX</span>
          </div>
          <div className="temporal-legend">
            <span><i className="legend-dot a"/> A · {clipA?.name || "No sample"}</span>
            <span><i className="legend-dot b"/> B · {clipB?.name || "No sample"}</span>
          </div>
          <div className="temporal-picker" role="group" aria-label="Temporal feature channel">
            {KEYS.map(item => <button key={item.key} type="button"
              className={feature === item.key ? "is-current" : ""}
              onClick={() => setFeature(item.key)}>{item.label}</button>)}
          </div>
          <div className="temporal-chart-wrap">
            <div className="temporal-feature-title"><strong>{chosen.label}</strong><span>{chosen.desc}</span></div>
            <TrackChart a={a} b={b} keyName={feature} cursor={cursor}/>
            {(!a || !b) && <div className="temporal-chart-warning">
              One or both clips do not have temporal data. Analyze audio with v0.3, or use the built-in synthetic examples.
            </div>}
          </div>
          <div className="temporal-scrub">
            <div className="temporal-scrub-label"><span>INSPECTION CURSOR</span><strong>{cursor}% of recording</strong></div>
            <input type="range" min="0" max="100" step="1" value={cursor}
              aria-label="Inspect recording at percent progress"
              onChange={event => setCursor(Number(event.target.value))}/>
            <div className="temporal-cursor-values">
              <div><span className="temporal-swatch cyan"/> A <strong>{left ? fmt(left[index][feature]) : "—"}</strong></div>
              <div><span className="temporal-swatch violet"/> B <strong>{right ? fmt(right[index][feature]) : "—"}</strong></div>
              <div>DELTA <strong>{left && right ? fmt(Math.abs(left[index][feature]-right[index][feature])) : "—"}</strong></div>
            </div>
          </div>
          <div className="temporal-disclaimer"><CircleHelp size={16}/>
            <span>Values use normalized recording progress, not synced playback or phoneme boundaries.
              Time frames are selected uniformly and may miss fast transients. Signal-energy scaling is heuristic.</span>
          </div>
        </div>

        <div className="temporal-panel temporal-side">
          <div className="temporal-panel-heading"><div><GitCompareArrows size={18}/><h3>Sequence alignment</h3></div></div>
          <p className="temporal-side-copy">Constrained dynamic time warping (DTW) compares the progression of acoustic descriptors, allowing limited timing differences.</p>
          <div className="temporal-alignment"><AlignmentMap comparison={comparison}/></div>
          <div className="temporal-score-grid">
            <div><span>DIRECT MEAN</span><strong>{fmt(comparison?.directMean)}</strong></div>
            <div><span>WARPED MEAN</span><strong>{fmt(comparison?.warpedMean)}</strong></div>
          </div>
          <div className="temporal-metadata">
            <div><span>Frames retained (A/B)</span><strong>{a?.frames?.length ?? "—"} / {b?.frames?.length ?? "—"}</strong></div>
            <div><span>Active windows (A/B)</span><strong>{activeFraction(a)} / {activeFraction(b)}</strong></div>
            <div><span>Alignment grid</span><strong>{comparison ? "32 × 32" : "Unavailable"}</strong></div>
          </div>
          <div className="temporal-caution"><Activity size={15}/><span>A smaller warped score can occur for entirely unrelated sounds. DTW is not phoneme alignment, translation, statistical significance, or a probability of shared language structure.</span></div>
        </div>
      </div>
      <p className="temporal-protocol-link">Methods and limitations are documented in the <a href="https://github.com/MichaelWave369/ULGE/blob/main/docs/TEMPORAL_PROTOCOL.md" target="_blank" rel="noreferrer">Temporal Acoustic Protocol <ArrowUpRight size={15}/></a>.</p>
    </div>
  </section>;
}
