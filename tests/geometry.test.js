import test from "node:test";
import assert from "node:assert/strict";
import { pointOnSurface } from "../src/geometry.js";
import { demoClip } from "../src/audio.js";

test("surface projection stays finite across input descriptor values", () => {
  const examples = [demoClip("harmonic").features, demoClip("noisy").features];
  for (const features of examples) {
    for (let j = 0; j < 120; j++) {
      const point = pointOnSurface(features, j * Math.PI / 60, (j + 3) * Math.PI / 60, 0.2);
      assert.equal(point.length, 3);
      assert.ok(point.every(Number.isFinite));
    }
  }
});
