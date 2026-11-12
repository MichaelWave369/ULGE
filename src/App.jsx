import React, { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, AudioLines, BookOpen, Check,
  ChevronDown, CircleHelp, Download, FileAudio, Fingerprint, FlaskConical,
  Github, Globe2, Layers3, Mic, Pause, Play, RotateCcw, ShieldCheck,
  Sparkles, StopCircle, UploadCloud, Waves
} from "lucide-react";
import { ANALYSIS_VERSION, analyzeAudioBuffer, demoClip, DESCRIPTORS, exportableClip, featureDistance } from "./audio.js";
import { renderScene } from "./geometry.js";
import CorpusLab from "./CorpusLab.jsx";

const LANGUAGES = [
  "Unspecified", "English", "Spanish", "French", "Arabic", "Mandarin Chinese",
  "Hindi", "Swahili", "Japanese", "Korean", "German", "Portuguese", "Russian",
  "American Sign Language (not acoustic)", "Other / self-described"
];

function Tag({ children, color = "neutral" }) {
  return <span className={"tag tag-" + color}>{children}</span>;
}
function Label({ index, active }) {
  return <span className={"slot-label slot-" + index.toLowerCase() + (active ? " selected" : "")}>{index}</span>;
}
function fmt(time) {
  return !Number.isFinite(time) ? "—" : time.toFixed(time < 10 ? 2 : 1) + "s";
}

function Observatory({ clipA, clipB, mode, playing, setPlaying }) {
  const canvasRef = useRef(null);
  const attitude = useRef({ yaw: -0.3, pitch: 0.25, dragging: false, lastX: 0, lastY: 0 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let raf = 0, animationClock = 0, lastStamp = 0;
    function frame(now) {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width)), h = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (playing) animationClock += Math.min(50, now - (lastStamp || now)) / 1000;
      lastStamp = now;
      const active = mode === "B" ? clipB : clipA;
      const secondary = mode === "AB" ? clipB : null;
      const props = attitude.current;
      renderScene(context, w, h, active, secondary, {
        yaw: props.yaw + (playing ? animationClock * 0.15 : 0),
        pitch: props.pitch, time: animationClock, overlay: mode === "AB"
      });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [clipA, clipB, mode, playing]);
  function pointerDown(event) {
    attitude.current.dragging = true;
    attitude.current.lastX = event.clientX;
    attitude.current.lastY = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    const value = attitude.current;
    if (!value.dragging) return;
    value.yaw += (event.clientX - value.lastX) * 0.008;
    value.pitch = Math.max(-1.2, Math.min(1.2, value.pitch + (event.clientY - value.lastY) * 0.008));
    value.lastX = event.clientX;
    value.lastY = event.clientY;
  }
  return <div className="visual-stage">
    <canvas ref={canvasRef} className="manifold" aria-label="Animated illustrative 3D toroidal projection of the acoustic descriptor vectors. Drag to rotate."
      role="img" onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerUp={() => { attitude.current.dragging = false; }}
      onPointerCancel={() => { attitude.current.dragging = false; }} />
    <div className="stage-top">
      <span><span className="live-dot" /> GEOMETRY PROJECTION / V1</span>
      <span className="stage-coordinates">7D → VISUAL FORM</span>
    </div>
    <div className="stage-left-readout">∞<span>OPEN HYPOTHESIS</span></div>
    <div className="stage-bottom">
      <div className="stage-legend">
        <span><i className="legend-dot a" /> {mode === "B" ? "Sample B" : "Sample A"}</span>
        {mode === "AB" && <span><i className="legend-dot b" /> Sample B</span>}
      </div>
      <button className="icon-button" type="button" onClick={() => setPlaying(v => !v)}
        aria-label={playing ? "Pause geometry animation" : "Resume geometry animation"} title={playing ? "Pause" : "Resume"}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
    </div>
  </div>;
}

function SignalMonitor({ analyser, active }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const wave = new Uint8Array(analyser?.fftSize || 1024);
    let raf = 0;
    function tick() {
      const w = canvas.clientWidth || 240, h = canvas.clientHeight || 48;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(92,135,169,0.26)";
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      if (active && analyser) analyser.getByteTimeDomainData(wave);
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const position = Math.floor(x / w * wave.length);
        const sample = active && analyser ? (wave[position] - 128) / 128 : Math.sin(x * 0.08) * 0.015;
        const y = h / 2 - sample * h * 0.44;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = active ? "#47dff2" : "#557389";
      ctx.lineWidth = active ? 1.8 : 1;
      ctx.stroke();
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);
  return <canvas ref={ref} className="signal-canvas" aria-label={active ? "Live microphone waveform" : "Microphone idle"} role="img" />;
}

function Metric({ descriptor, a, b }) {
  const valueA = a?.features?.[descriptor.key] ?? 0;
  const valueB = b?.features?.[descriptor.key] ?? 0;
  return <div className="metric">
    <div className="metric-heading"><span>{descriptor.name}</span><span>{(valueA * 100).toFixed(0)} / {(valueB * 100).toFixed(0)}</span></div>
    <div className="dual-bars">
      <div className="bar-back"><span className="bar-a" style={{ width: (valueA * 100) + "%" }} /></div>
      <div className="bar-back"><span className="bar-b" style={{ width: (valueB * 100) + "%" }} /></div>
    </div>
    <div className="metric-caption">{descriptor.caption}</div>
  </div>;
}

function App() {
  const [clips, setClips] = useState(() => ({ A: demoClip("harmonic"), B: demoClip("noisy") }));
  const [slot, setSlot] = useState("A");
  const [language, setLanguage] = useState("Unspecified");
  const [viewMode, setViewMode] = useState("AB");
  const [playing, setPlaying] = useState(true);
  const [recording, setRecording] = useState(false);
  const [analyser, setAnalyser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("Two synthetic examples loaded. Replace them with your own recordings.");
  const fileInput = useRef(null);
  const mediaSession = useRef(null);
  const urls = useRef(new Set());
  const a = clips.A, b = clips.B;
  const distance = featureDistance(a, b);

  useEffect(() => () => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    const session = mediaSession.current;
    if (session) {
      try { if (session.recorder.state !== "inactive") session.recorder.stop(); } catch { /* ignored */ }
      session.stream.getTracks().forEach(track => track.stop());
      session.context.close().catch(() => {});
    }
  }, []);

  function insertClip(target, clip) {
    setClips(previous => ({ ...previous, [target]: clip }));
    setViewMode("AB");
    setError("");
    setMessage("Analyzed " + clip.name + " in your browser. Compare its descriptors on the right.");
  }

  async function decode(blob, target, label, lang, source, kind) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("This browser does not support Web Audio.");
    const context = new AudioContextClass();
    try {
      const bytes = await blob.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      const summary = analyzeAudioBuffer(buffer);
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      insertClip(target, {
        ...summary, id: String(Date.now()), name: label,
        language: lang, source, kind, audioUrl: url
      });
    } finally {
      await context.close().catch(() => {});
    }
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("File is over 25 MB. Choose a shorter excerpt."); return;
    }
    const target = slot, lang = language;
    setBusy(true); setError("");
    try {
      await decode(file, target, file.name, lang, "Local audio file", "uploaded");
    } catch (cause) {
      setError("Could not analyze the file: " + (cause?.message || "unsupported audio format"));
    } finally { setBusy(false); }
  }

  async function startRecording() {
    if (recording || busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Microphone recording is unavailable. Use HTTPS or localhost in a browser with recording support.");
      return;
    }
    const target = slot, lang = language;
    let stream = null, context = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false
      } });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      context = new AudioContextClass();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const nextAnalyser = context.createAnalyser();
      nextAnalyser.fftSize = 1024;
      source.connect(nextAnalyser);
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      const session = { recorder, stream, context };
      mediaSession.current = session;
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setAnalyser(null); setRecording(false);
        if (mediaSession.current === session) mediaSession.current = null;
        await context.close().catch(() => {});
        if (!chunks.length) { setError("No microphone audio was captured."); return; }
        setBusy(true);
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          await decode(blob, target, "Microphone take " + new Date().toLocaleTimeString(), lang, "Live microphone", "recorded");
        } catch (cause) {
          setError("Could not decode the recording: " + (cause?.message || "unknown error"));
        } finally { setBusy(false); }
      };
      recorder.start();
      setAnalyser(nextAnalyser);
      setRecording(true);
      setError("");
      setMessage("Microphone active. Capture a few seconds, then press Stop & analyze.");
    } catch (cause) {
      stream?.getTracks().forEach(track => track.stop());
      await context?.close().catch(() => {});
      setError("Microphone unavailable: " + (cause?.message || "permission denied"));
    }
  }

  function stopRecording() {
    const recorder = mediaSession.current?.recorder;
    if (recorder?.state === "recording") recorder.stop();
  }

  function loadSynthetic() {
    insertClip(slot, demoClip(slot === "A" ? "harmonic" : "noisy"));
    setMessage("Synthetic example loaded: educational signal, not speech.");
  }

  function useCorpusRecord(target, record) {
    const selected = {
      ...record,
      id: record.id,
      kind: record.sourceKind,
      source: "Corpus feature summary · audio not retained",
      audioUrl: null
    };
    setClips(previous => ({ ...previous, [target]: selected }));
    setViewMode("AB");
    setMessage("Loaded " + record.name + " into sample " + target + " from corpus features. Original audio is not retained.");
    document.getElementById("lab")?.scrollIntoView({ behavior: "smooth" });
  }

  function exportReport() {
    const report = {
      schema: "ULGE.acoustic-comparison.v1",
      exportedAt: new Date().toISOString(),
      analysis: ANALYSIS_VERSION,
      statement: "Exploratory acoustic descriptors. Illustrative geometry; no statistical inference or language-universal claim.",
      distance, distanceDefinition: "Root mean square difference of seven normalized descriptor values; zero means identical vectors.",
      A: exportableClip(a), B: exportableClip(b)
    };
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = objectUrl; link.download = "ULGE-feature-comparison.json";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return <div className="app">
    <header className="nav-shell">
      <div className="container nav-content">
        <a className="brand" href="#top" aria-label="ULGE home">
          <span className="brand-symbol"><span /></span>
          <span>ULGE<span className="brand-sub">UNIVERSAL LANGUAGE GEOMETRY ENGINE</span></span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#lab">The Lab</a><a href="#corpus">Corpus Lab</a><a href="#method">Methodology</a>
          <a href="https://github.com/MichaelWave369/ULGE" target="_blank" rel="noreferrer"><Github size={16} /> Source</a>
        </nav>
        <div className="nav-status"><span className="live-dot" /> OPEN RESEARCH · V0.2</div>
      </div>
    </header>

    <main id="top">
      <section className="hero container">
        <div className="hero-eyebrow"><span className="eyebrow-icon"><Sparkles size={14} /></span> PHI369 LABS <span className="eyebrow-divider">/</span> EXPERIMENT 001</div>
        <h1>What shape does<br /><em>a voice</em> leave behind<span className="question">?</span></h1>
        <p className="hero-description">An open laboratory exploring the possibility of shared acoustic structure across human languages. Turn sound into measurable features. Give those features geometry. Then question everything.</p>
        <div className="hero-actions">
          <a className="primary-link" href="#lab">Enter the observatory <ArrowDownRight size={17} /></a>
          <a className="text-link" href="#method">Read the research method <ArrowUpRight size={16} /></a>
        </div>
        <div className="hero-footnotes">
          <span><ShieldCheck size={14} /> 100% browser-local audio</span>
          <span><FlaskConical size={14} /> Experimental, not validated</span>
          <span><Globe2 size={14} /> Open research commons</span>
        </div>
      </section>

      <section className="lab-section" id="lab">
        <div className="container">
          <div className="section-heading">
            <div><span className="kicker">01 / THE OBSERVATORY</span><h2>Listen. Measure. <span>Visualize.</span></h2></div>
            <div className="heading-corner"><span className="corner-line" /> TWO SOURCES · SEVEN DESCRIPTORS</div>
          </div>
          <div className="lab-grid">
            <aside className="panel input-panel">
              <div className="panel-head"><div><Activity size={17} /><h3>Signal input</h3></div><Tag color="cyan">LOCAL ONLY</Tag></div>
              <p className="panel-intro">Analyze two audio samples. Choose a target slot to replace with your own sound.</p>
              <div className="slot-switch" role="group" aria-label="Input slot">
                {["A", "B"].map(index => <button key={index} type="button" disabled={recording || busy}
                  className={"slot-choice " + (slot === index ? "is-active" : "")}
                  onClick={() => setSlot(index)}>
                  <Label index={index} active={slot === index} />
                  <span className="slot-choice-text">{clips[index]?.name || "Empty"}</span>
                </button>)}
              </div>
              <label className="field-label" htmlFor="language-select">LANGUAGE LABEL <span>USER-SUPPLIED</span></label>
              <div className="select-wrap"><select id="language-select" value={language} disabled={recording || busy}
                onChange={event => setLanguage(event.target.value)}>
                {LANGUAGES.map(name => <option value={name} key={name}>{name}</option>)}
              </select><ChevronDown size={16} /></div>
              <p className="tiny-note">For metadata only. ULGE does not identify languages.</p>
              <input ref={fileInput} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a" hidden onChange={uploadFile} />
              <button className="upload-zone" type="button" disabled={busy || recording}
                onClick={() => fileInput.current?.click()}>
                <UploadCloud size={25} strokeWidth={1.6} />
                <strong>Choose an audio recording</strong>
                <span>WAV, MP3, OGG and browser-supported audio · Max 25 MB</span>
              </button>
              <div className="record-head"><span>OR RECORD DIRECTLY</span><span className={recording ? "recording-indicator" : "idle-indicator"}>{recording ? "● REC" : "STANDBY"}</span></div>
              <SignalMonitor analyser={analyser} active={recording} />
              <button className={"record-button " + (recording ? "is-recording" : "")}
                type="button" disabled={busy} onClick={recording ? stopRecording : startRecording}>
                {recording ? <StopCircle size={18} /> : <Mic size={18} />}
                {recording ? "Stop & analyze" : "Record from microphone"}
              </button>
              <button className="reset-button" type="button" disabled={busy || recording} onClick={loadSynthetic}>
                <RotateCcw size={15} /> Load synthetic example
              </button>
              {busy && <div className="notice working"><Activity size={15} /> Analyzing local audio...</div>}
              {error && <div className="notice error" role="alert">{error}</div>}
              {!error && !busy && <div className="notice hint" aria-live="polite">{message}</div>}
            </aside>

            <div className="panel display-panel">
              <div className="panel-head display-head"><div><Layers3 size={18} /><h3>Acoustic field</h3></div><Tag color="purple">ILLUSTRATIVE</Tag></div>
              <div className="mode-bar">
                <div className="segmented" role="group" aria-label="Geometry display mode">
                  {[["A", "Sample A"], ["B", "Sample B"], ["AB", "Overlay A + B"]].map(([value, text]) =>
                    <button type="button" key={value} className={viewMode === value ? "active" : ""}
                      onClick={() => setViewMode(value)}>{text}</button>)}
                </div>
                <span className="drag-hint">DRAG TO ROTATE</span>
              </div>
              <Observatory clipA={a} clipB={b} mode={viewMode} playing={playing} setPlaying={setPlaying} />
              <div className="visual-disclaimer"><CircleHelp size={15} /><p>The wireframe is a designed projection of acoustic descriptors. It is <strong>not</strong> a discovered universal shape, a brain scan, or a language model.</p></div>
              <div className="sample-strip">
                {["A", "B"].map(index => {
                  const clip = clips[index];
                  return <div className="sample-summary" key={index}>
                    <div className="summary-top"><Label index={index} /><span>{fmt(clip?.duration)}</span></div>
                    <strong title={clip?.name}>{clip?.name || "No sample"}</strong>
                    <span className="summary-sub">{clip?.kind === "synthetic" ? "SYNTHETIC · NOT SPEECH" : (clip?.language || "Unspecified") + " · " + (clip?.source || "Unknown")}</span>
                    {clip?.audioUrl && <audio controls src={clip.audioUrl} preload="none" aria-label={"Listen to sample " + index} />}
                  </div>;
                })}
              </div>
            </div>

            <aside className="panel analysis-panel">
              <div className="panel-head"><div><Fingerprint size={17} /><h3>Feature fingerprint</h3></div><span className="tiny-version">DSP / V1</span></div>
              <p className="panel-intro">Normalized descriptors from each recording. These are acoustic measurements, not semantic properties.</p>
              <div className="bar-legend"><span><i className="legend-dot a" /> A · Cyan</span><span><i className="legend-dot b" /> B · Violet</span></div>
              <div className="metrics">
                {DESCRIPTORS.map(descriptor => <Metric key={descriptor.key} descriptor={descriptor} a={a} b={b} />)}
              </div>
              <div className="distance-card">
                <div className="distance-label">FEATURE-SPACE DISTANCE <CircleHelp size={14} /></div>
                <div className="distance-value">{distance === null ? "—" : distance.toFixed(3)}<span> / 1.000</span></div>
                <div className="distance-scale"><span /></div>
                <p>0 = identical descriptor vectors. This is not a language-similarity score or statistical evidence.</p>
              </div>
              <button className="export-button" type="button" onClick={exportReport}><Download size={17} /> Export analysis JSON</button>
              <span className="export-note">Exports features and labels, never the raw audio.</span>
            </aside>
          </div>
        </div>
      </section>

      <section className="method-section container" id="method">
        <div className="section-heading">
          <div><span className="kicker">02 / SCIENTIFIC INTEGRITY</span><h2>Patterns are cheap. <span>Evidence isn't.</span></h2></div>
          <span className="heading-corner">THE PROTOCOL</span>
        </div>
        <div className="method-intro">
          <p>Human language is much more than its sound. Before claiming any shared structure, we need to rule out microphones, shared speakers, similar phrases, and our own visualization choices. The right experiment tries to <strong>falsify</strong> the exciting hypothesis.</p>
        </div>
        <div className="method-grid">
          <article className="method-card"><span className="method-number">01</span><AudioLines size={26} /><h3>Acquire balanced speech</h3><p>Collect openly licensed or consented recordings across unrelated language families, with multiple speakers and matched prompts.</p><span className="method-status">NEXT PHASE</span></article>
          <article className="method-card"><span className="method-number">02</span><Waves size={26} /><h3>Test against controls</h3><p>Compare against noise, music, shuffled labels, recording-channel effects, and within-speaker baselines. Use held-out languages.</p><span className="method-status">NEXT PHASE</span></article>
          <article className="method-card"><span className="method-number">03</span><Globe2 size={26} /><h3>Go beyond sound</h3><p>Ask whether any discovered relationships extend to meaning, interaction and signed languages. Acoustic similarities alone cannot prove universal language structure.</p><span className="method-status">RESEARCH HORIZON</span></article>
        </div>
        <div className="knowledge-bar">
          <div><BookOpen size={19} /><div><strong>Research that inspired this question</strong><span>Not proof of universal language geometry</span></div></div>
          <div className="knowledge-links">
            <a href="https://doi.org/10.1098/rstb.2020.0390" target="_blank" rel="noreferrer">Bouba / kiki · 25 languages <ArrowUpRight size={15} /></a>
            <a href="https://doi.org/10.1126/sciadv.aaw2594" target="_blank" rel="noreferrer">Information rate · 17 languages <ArrowUpRight size={15} /></a>
          </div>
        </div>
      </section>
      <CorpusLab clips={clips} onUseRecord={useCorpusRecord} />
    </main>

    <footer className="footer">
      <div className="container footer-content">
        <div className="footer-mark"><span className="brand-symbol mini"><span /></span> ULGE <span>· PHI369 LABS</span></div>
        <p>Nothing required. Curiosity welcomed. <span>Measurements before metaphors.</span></p>
        <a href="https://github.com/MichaelWave369/ULGE" target="_blank" rel="noreferrer"><Github size={17} /> Open-source on GitHub</a>
      </div>
    </footer>
  </div>;
}

export default App;
