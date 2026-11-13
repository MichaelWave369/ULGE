/**
 * ULGE temporal-v1. Exploratory time-resolved acoustic tracks.
 *
 * Not phoneme alignment, meaning similarity, speaker identification, or
 * evidence that a universal language shape exists.
 */
export const TEMPORAL_VERSION = "temporal-v1";
export const TEMPORAL_KEYS = ["energy", "brightness", "spread", "low", "high", "texture", "crossings"];
export const MAX_TEMPORAL_FRAMES = 64;
export const ALIGNMENT_SAMPLES = 32;
const EPS = 1e-9;

function validateNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Invalid temporal feature " + path + " (expected number between 0 and 1).");
  }
  return value;
}

/**
 * Compact and validate a track before export, import or comparison.
 * Time is normalized to recording progress (0..1), not synchronized seconds.
 */
export function sanitizeTemporal(track) {
  if (track == null) return null;
  if (!track || typeof track !== "object" || Array.isArray(track) ||
      track.version !== TEMPORAL_VERSION || !Array.isArray(track.frames) ||
      track.frames.length < 1 || track.frames.length > 120) {
    throw new Error("Invalid temporal track schema or frame count.");
  }
  let previous = -1;
  const frames = track.frames.map((frame, i) => {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
      throw new Error("Invalid temporal frame.");
    }
    const t = validateNumber(frame.t, "t");
    if (t < previous) throw new Error("Temporal timestamps must be non-decreasing.");
    previous = t;
    if (typeof frame.active !== "boolean") throw new Error("Temporal active flag must be boolean.");
    const clean = { t: Math.round(t * 10000) / 10000, active: frame.active };
    for (const key of TEMPORAL_KEYS) {
      clean[key] = Math.round(validateNumber(frame[key], key + "[" + i + "]") * 1000) / 1000;
    }
    return clean;
  });
  if (frames.length <= MAX_TEMPORAL_FRAMES) return { version: TEMPORAL_VERSION, frames };
  const sampled = [];
  for (let i = 0; i < MAX_TEMPORAL_FRAMES; i++) {
    sampled.push(frames[Math.round(i * (frames.length - 1) / (MAX_TEMPORAL_FRAMES - 1))]);
  }
  return { version: TEMPORAL_VERSION, frames: sampled };
}

export function resampleTrack(track, count = ALIGNMENT_SAMPLES) {
  if (track == null) return null;
  if (!Number.isInteger(count) || count < 2 || count > 128) throw new Error("Invalid resample count.");
  const { frames } = sanitizeTemporal(track);
  if (!frames.length) return null;
  // Resample by ordinal frame position: comparing relative progression,
  // not claiming exact phonetic or timestamp alignment.
  const values = [];
  for (let i = 0; i < count; i++) {
    const position = i * (frames.length - 1) / (count - 1);
    const lo = Math.floor(position), hi = Math.min(frames.length - 1, lo + 1);
    const f = position - lo;
    const row = {};
    for (const key of TEMPORAL_KEYS) row[key] = frames[lo][key] * (1 - f) + frames[hi][key] * f;
    values.push(row);
  }
  return values;
}

export function frameDistance(a, b) {
  let sum = 0;
  for (const key of TEMPORAL_KEYS) {
    const d = a[key] - b[key];
    sum += d * d;
  }
  return Math.sqrt(sum / TEMPORAL_KEYS.length);
}

/**
 * Bounded monotone Dynamic Time Warping.
 * Every path begins/ends at corners, only moves right/down/diagonally,
 * with a Sakoe-Chiba width of 20% of the aligned 32x32 grid.
 * A DTW score is an exploratory descriptor, NOT statistical evidence.
 */
export function compareTemporalTracks(trackA, trackB) {
  if (!trackA || !trackB) return null;
  const left = resampleTrack(trackA), right = resampleTrack(trackB);
  const n = left.length, width = Math.max(2, Math.ceil(n * 0.2));
  const distances = Array.from({ length: n }, (_, i) =>
    right.map((row, j) => frameDistance(left[i], row)));
  const dp = Array.from({ length: n }, () => Array(n).fill(Infinity));
  const steps = Array.from({ length: n }, () => Array(n).fill(0));
  const previous = Array.from({ length: n }, () => Array(n).fill(null));
  for (let i = 0; i < n; i++) {
    for (let j = Math.max(0, i - width); j <= Math.min(n - 1, i + width); j++) {
      if (i === 0 && j === 0) {
        dp[i][j] = distances[i][j]; steps[i][j] = 1;
        continue;
      }
      let best = Infinity, bestSteps = 0, bestPrevious = null;
      // Prefer the diagonal on cost ties to avoid gratuitous warping.
      for (const [pi, pj] of [[i - 1, j - 1], [i - 1, j], [i, j - 1]]) {
        if (pi < 0 || pj < 0 || !Number.isFinite(dp[pi][pj])) continue;
        const candidate = dp[pi][pj] + distances[i][j];
        if (candidate < best - EPS) {
          best = candidate; bestSteps = steps[pi][pj] + 1; bestPrevious = [pi, pj];
        }
      }
      dp[i][j] = best; steps[i][j] = bestSteps; previous[i][j] = bestPrevious;
    }
  }
  if (!Number.isFinite(dp[n - 1][n - 1])) throw new Error("Could not align temporal tracks.");
  const path = [];
  let i = n - 1, j = n - 1;
  while (true) {
    path.push([i, j]);
    if (i === 0 && j === 0) break;
    const parent = previous[i][j];
    if (!parent) throw new Error("Broken temporal alignment.");
    [i, j] = parent;
  }
  path.reverse();
  const direct = Array.from({ length: n }, (_, k) => distances[k][k]);
  // The warp average is a descriptive cost per alignment step, not a
  // calibrated distance/metric or a p-value.
  return {
    version: TEMPORAL_VERSION,
    samples: n,
    warpBand: width,
    directMean: direct.reduce((s, d) => s + d, 0) / n,
    warpedMean: dp[n - 1][n - 1] / steps[n - 1][n - 1],
    path, cost: distances
  };
}
