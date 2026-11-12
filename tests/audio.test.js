import test from "node:test";
import assert from "node:assert/strict";
import { analyzeChannels, demoClip, featureDistance, syntheticSignal, DESCRIPTORS, exportableClip } from "../src/audio.js";

test("synthetic examples produce finite normalized acoustic descriptors", () => {
  for (const kind of ["harmonic", "noisy"]) {
    const signal = syntheticSignal(kind);
    const result = analyzeChannels(signal.channels, signal.sampleRate);
    assert.equal(result.sampleRate, 16000);
    assert.ok(result.activeFrames > 0);
    for (const { key } of DESCRIPTORS) {
      assert.ok(Number.isFinite(result.features[key]), key);
      assert.ok(result.features[key] >= 0 && result.features[key] <= 1, key);
    }
  }
});

test("identical fingerprints have zero distance, examples differ", () => {
  const a = demoClip("harmonic"), b = demoClip("noisy");
  assert.equal(featureDistance(a, a), 0);
  assert.ok(featureDistance(a, b) > 0);
  assert.ok(featureDistance(a, b) <= 1);
});

test("silence and too-short audio fail explicitly", () => {
  assert.throws(() => analyzeChannels([new Float32Array(16000)], 16000), /No audible signal/);
  assert.throws(() => analyzeChannels([new Float32Array(100)], 16000), /short/);
});

test("export leaves raw audio and temporary browser URLs out", () => {
  const result = exportableClip({ ...demoClip("harmonic"), audioUrl: "blob:private" });
  assert.equal("audioUrl" in result, false);
  assert.ok(result.features);
});
