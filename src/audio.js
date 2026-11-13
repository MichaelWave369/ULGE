/**
 * ULGE acoustic descriptors v1.
 * Frame-based DSP only. No phoneme recognition, translations, embeddings,
 * linguistic universals, or statistical inference are implied.
 * Audio is downmixed and linearly sampled at a common 16 kHz.
 */
import { TEMPORAL_VERSION, sanitizeTemporal } from "./temporal.js";

export const ANALYSIS_VERSION = "acoustic-v1";
export const TARGET_RATE = 16000;
const FRAME = 1024;
const EPS = 1e-12;

export const DESCRIPTORS = [
  { key: "brightness", name: "Brightness", caption: "Mean spectral centroid" },
  { key: "spread", name: "Spectral spread", caption: "Frequency dispersion" },
  { key: "low", name: "Low-frequency", caption: "Energy below 600 Hz" },
  { key: "high", name: "High-frequency", caption: "Energy above 3000 Hz" },
  { key: "texture", name: "Spectral texture", caption: "Flatness of the spectrum" },
  { key: "dynamics", name: "Energy variation", caption: "Relative RMS fluctuation" },
  { key: "crossings", name: "Zero crossings", caption: "Waveform sign-change rate" }
];

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function spectrum(samples) {
  const n = samples.length;
  const real = new Float64Array(n);
  const imaginary = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    real[i] = samples[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const t = real[i]; real[i] = real[j]; real[j] = t;
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const a = -2 * Math.PI / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < half; j++) {
        const angle = a * j;
        const wr = Math.cos(angle), wi = Math.sin(angle);
        const r = start + j, s = r + half;
        const tr = wr * real[s] - wi * imaginary[s];
        const ti = wr * imaginary[s] + wi * real[s];
        real[s] = real[r] - tr; imaginary[s] = imaginary[r] - ti;
        real[r] += tr; imaginary[r] += ti;
      }
    }
  }
  const magnitude = new Float64Array(n / 2);
  for (let i = 1; i < n / 2; i++) magnitude[i] = Math.hypot(real[i], imaginary[i]);
  return magnitude;
}

function average(values) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

export function analyzeChannels(channels, sampleRate) {
  if (!Array.isArray(channels) || !channels.length || !channels[0]?.length ||
      !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("A valid decoded audio signal is required.");
  }
  const sourceLength = Math.min(...channels.map(c => c.length));
  const duration = sourceLength / sampleRate;
  if (duration < 0.07) throw new Error("Recording is too short to analyze.");
  const targetLength = Math.floor(duration * TARGET_RATE);
  if (targetLength < FRAME) throw new Error("Recording needs at least 64 ms of audio.");
  const frameCount = Math.min(120, Math.max(1, Math.floor(targetLength / FRAME)));
  const featureFrames = [], allRms = [], temporalFrames = [];
  const frame = new Float64Array(FRAME);
  const range = Math.max(0, targetLength - FRAME);
  for (let f = 0; f < frameCount; f++) {
    const start = frameCount === 1 ? 0 : Math.floor(f * range / (frameCount - 1));
    let squares = 0, crossings = 0, last = 0;
    for (let i = 0; i < FRAME; i++) {
      const pos = (start + i) * sampleRate / TARGET_RATE;
      const index = Math.min(sourceLength - 1, Math.floor(pos));
      const next = Math.min(sourceLength - 1, index + 1);
      const ratio = pos - index;
      let value = 0;
      for (const channel of channels) value += channel[index] * (1 - ratio) + channel[next] * ratio;
      value /= channels.length;
      frame[i] = value;
      squares += value * value;
      if (i && (value >= 0) !== (last >= 0)) crossings++;
      last = value;
    }
    const rms = Math.sqrt(squares / FRAME);
    allRms.push(rms);
    const t = clamp01((start + FRAME / 2) / targetLength);
    if (rms < 0.003) {
      temporalFrames.push({
        t, active: false, energy: clamp01(rms / 0.25),
        brightness: 0, spread: 0, low: 0, high: 0,
        texture: 0, crossings: 0
      });
      continue;
    }
    const mags = spectrum(frame);
    let total = 0, weighted = 0, low = 0, high = 0, logSum = 0, arithmetic = 0;
    const count = mags.length - 1;
    for (let k = 1; k < mags.length; k++) {
      const value = mags[k], hz = k * TARGET_RATE / FRAME;
      total += value; weighted += value * hz;
      if (hz < 600) low += value;
      if (hz > 3000) high += value;
      logSum += Math.log(value + EPS);
      arithmetic += value + EPS;
    }
    const centroidHz = weighted / (total + EPS);
    let variance = 0;
    for (let k = 1; k < mags.length; k++) {
      const delta = (k * TARGET_RATE / FRAME) - centroidHz;
      variance += mags[k] * delta * delta;
    }
    const spectralFrame = {
      brightness: clamp01(centroidHz / (TARGET_RATE / 2)),
      spread: clamp01(Math.sqrt(variance / (total + EPS)) / (TARGET_RATE / 2)),
      low: clamp01(low / (total + EPS)),
      high: clamp01(high / (total + EPS)),
      texture: clamp01(Math.exp(logSum / count) / (arithmetic / count)),
      crossings: clamp01(crossings / (FRAME - 1))
    };
    featureFrames.push(spectralFrame);
    temporalFrames.push({
      t, active: true, energy: clamp01(rms / 0.25),
      ...spectralFrame
    });
  }
  if (!featureFrames.length) throw new Error("No audible signal detected. Try a louder recording.");
  const means = {};
  for (const key of ["brightness", "spread", "low", "high", "texture", "crossings"]) {
    means[key] = clamp01(average(featureFrames.map(frame => frame[key])));
  }
  const meanRms = average(allRms);
  const stdRms = Math.sqrt(average(allRms.map(v => (v - meanRms) ** 2)));
  means.dynamics = clamp01(stdRms / (meanRms + EPS) / 2);
  return {
    version: ANALYSIS_VERSION, features: means, duration,
    frames: frameCount, activeFrames: featureFrames.length,
    sampleRate: TARGET_RATE, originalSampleRate: sampleRate,
    temporal: sanitizeTemporal({ version: TEMPORAL_VERSION, frames: temporalFrames })
  };
}

export function analyzeAudioBuffer(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return analyzeChannels(channels, buffer.sampleRate);
}

/** Deterministic teaching-only signals. These do not represent languages. */
export function syntheticSignal(kind = "harmonic") {
  const sr = TARGET_RATE, samples = new Float32Array(sr * 3);
  let seed = 14269;
  function noise() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296 * 2 - 1;
  }
  for (let i = 0; i < samples.length; i++) {
    const t = i / sr;
    const envelope = (1 - Math.exp(-t * 14)) * Math.min(1, (3 - t) * 5);
    if (kind === "harmonic") {
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3.5 * t));
      samples[i] = envelope * pulse * (0.47 * Math.sin(2 * Math.PI * 145 * t)
        + 0.2 * Math.sin(2 * Math.PI * 290 * t) + 0.08 * Math.sin(2 * Math.PI * 580 * t));
    } else {
      const pulse = 0.3 + 0.7 * Math.pow(Math.sin(2 * Math.PI * 5.5 * t), 2);
      samples[i] = envelope * pulse * (0.1 * Math.sin(2 * Math.PI * 710 * t)
        + 0.08 * Math.sin(2 * Math.PI * 2250 * t) + 0.28 * noise());
    }
  }
  return { channels: [samples], sampleRate: sr };
}

export function demoClip(kind = "harmonic") {
  const signal = syntheticSignal(kind);
  const analysis = analyzeChannels(signal.channels, signal.sampleRate);
  return {
    ...analysis, id: kind, name: kind === "harmonic" ? "Harmonic pulse" : "Noisy pulse",
    language: "Not a language", source: "Synthetic demonstration", kind: "synthetic", audioUrl: null
  };
}

export function featureDistance(a, b) {
  if (!a?.features || !b?.features) return null;
  const sum = DESCRIPTORS.reduce((total, { key }) => {
    const delta = clamp01(a.features[key]) - clamp01(b.features[key]);
    return total + delta * delta;
  }, 0);
  return Math.sqrt(sum / DESCRIPTORS.length);
}

export function exportableClip(clip) {
  if (!clip) return null;
  const { name, language, source, kind, features, duration, frames,
    activeFrames, sampleRate, originalSampleRate, version } = clip;
  return {
    name, language, source, kind, features, duration, frames,
    activeFrames, sampleRate, originalSampleRate, version,
    ...(clip.temporal ? { temporal: sanitizeTemporal(clip.temporal) } : {})
  };
}
