import test from "node:test";
import assert from "node:assert/strict";
import { analyzeChannels, demoClip, syntheticSignal } from "../src/audio.js";
import {
  MAX_TEMPORAL_FRAMES, TEMPORAL_KEYS, sanitizeTemporal, resampleTrack,
  compareTemporalTracks
} from "../src/temporal.js";

test("real audio analysis includes ordered time frames and no raw samples", () => {
  const { channels, sampleRate } = syntheticSignal("harmonic");
  const result = analyzeChannels(channels, sampleRate);
  assert.equal(result.temporal.version, "temporal-v1");
  assert.ok(result.temporal.frames.length > 8);
  assert.ok(result.temporal.frames.length <= MAX_TEMPORAL_FRAMES);
  let previous = -1;
  for (const frame of result.temporal.frames) {
    assert.ok(frame.t >= previous && frame.t <= 1);
    previous = frame.t;
    assert.equal(typeof frame.active, "boolean");
    for (const key of TEMPORAL_KEYS) assert.ok(frame[key] >= 0 && frame[key] <= 1, key);
    assert.equal("rawAudio" in frame, false);
  }
});

test("silence is represented by inactive temporal frames rather than erased", () => {
  const signal = syntheticSignal("noisy");
  signal.channels[0].fill(0, 8000, 16000);
  const result = analyzeChannels(signal.channels, signal.sampleRate);
  assert.ok(result.temporal.frames.some(frame => !frame.active));
  assert.ok(result.temporal.frames.some(frame => frame.active));
});

test("self-match has zero distance and different input has nonzero distance", () => {
  const a = demoClip("harmonic");
  const b = demoClip("noisy");
  const exact = compareTemporalTracks(a.temporal, a.temporal);
  const diff = compareTemporalTracks(a.temporal, b.temporal);
  assert.equal(exact.directMean, 0);
  assert.equal(exact.warpedMean, 0);
  assert.equal(exact.path[0].join(","), "0,0");
  assert.equal(exact.path.at(-1).join(","), "31,31");
  assert.ok(diff.directMean > 0 && diff.warpedMean > 0);
  assert.ok(diff.warpedMean <= diff.directMean + 0.000001);
});

test("time-order changes can be visible even when static feature averages are identical", () => {
  const a = demoClip("harmonic").temporal;
  const reverse = sanitizeTemporal({
    version: a.version,
    frames: a.frames.map((frame, i) => ({
      ...a.frames[a.frames.length - i - 1], t: frame.t
    }))
  });
  const result = compareTemporalTracks(a, reverse);
  assert.ok(result.directMean >= 0);
  assert.ok(result.path.every(([i, j]) => Math.abs(i - j) <= result.warpBand));
});

test("reject malformed imports and bound the temporal track size", () => {
  const a = demoClip("harmonic").temporal;
  assert.throws(() => sanitizeTemporal({ ...a, frames: [{ ...a.frames[0], brightness: 9 }] }), /Invalid temporal feature/);
  assert.throws(() => sanitizeTemporal({ ...a, frames: [{ ...a.frames[1], t: 0.8 }, { ...a.frames[2], t: 0.1 }] }), /non-decreasing/);
  assert.throws(() => resampleTrack(a, 1000), /resample count/);
  const long = { version: a.version, frames: Array.from({ length: 120 }, (_, i) => ({ ...a.frames[0], t: i / 119 })) };
  assert.equal(sanitizeTemporal(long).frames.length, MAX_TEMPORAL_FRAMES);
});
