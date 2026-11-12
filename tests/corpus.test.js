import test from "node:test";
import assert from "node:assert/strict";
import { demoClip } from "../src/audio.js";
import {
  CORPUS_SCHEMA, makeCorpusRecord, validateCorpus, qualityFlags,
  summarizeCorpus, corpusDistanceMatrix, exportCorpusManifest, importCorpusManifest
} from "../src/corpus.js";

const base = demoClip("harmonic");
const metadata = (language, speaker, extra = {}) => ({
  language, family: "Germanic", speaker, prompt: "phrase-1",
  device: "USB mic", consent: "self-recorded", license: "private-research",
  signalType: "speech", ...extra
});
const recording = { ...base, kind: "recorded" };
const sample = (id, language, speaker, extra = {}) =>
  makeCorpusRecord(recording, metadata(language, speaker, extra), id);

test("a corpus record contains exactly metadata and derived features, never audio", () => {
  const record = makeCorpusRecord({ ...recording, audioUrl: "blob:private", rawAudio: [2, 3] },
    metadata("English", "s01"), "clip_001");
  assert.equal(record.language, "English");
  assert.equal(record.speaker, "s01");
  assert.equal("audioUrl" in record, false);
  assert.equal("rawAudio" in record, false);
});

test("synthetic examples cannot masquerade as speech samples", () => {
  const demo = makeCorpusRecord(base, metadata("English", "s01"), "demo_001");
  assert.equal(demo.signalType, "synthetic");
  assert.equal(demo.language, "Not a language");
  assert.match(qualityFlags(demo).join(" "), /Synthetic control/);
  assert.equal(summarizeCorpus([demo]).speechSamples, 0);
  assert.throws(() => validateCorpus([{ ...demo, signalType: "speech" }]), /Synthetic signal type mismatch/);
});

test("export/import round-trip is deterministic and sanitizes unknown fields", () => {
  const row = sample("clip_a", "English", "s01");
  const obj = exportCorpusManifest([row], "2026-11-12T00:00:00.000Z");
  assert.equal(obj.schema, CORPUS_SCHEMA);
  assert.equal(obj.records.length, 1);
  const withExtra = { ...obj, records: [{ ...row, audioUrl: "blob:forbidden" }] };
  const parsed = importCorpusManifest(JSON.stringify(withExtra));
  assert.deepEqual(parsed, [row]);
  assert.equal("audioUrl" in parsed[0], false);
});

test("reject duplicate IDs, malformed vectors, unknown schema, and excessive records", () => {
  const row = sample("clip_a", "English", "s01");
  assert.throws(() => validateCorpus([row, row]), /Duplicate row ID/);
  assert.throws(() => validateCorpus([{ ...row, features: { ...row.features, low: Infinity } }]), /finite number/);
  assert.throws(() => importCorpusManifest('{"schema":"bad","records":[]}'), /schema/);
  assert.throws(() => validateCorpus(Array.from({ length: 61 }, (_, i) => ({ ...row, id: "id_" + i }))), /60 clips/);
});

test("summaries separate within and between language distances without p-values", () => {
  const rows = [
    sample("c_a", "English", "s01"),
    sample("c_b", "English", "s02"),
    makeCorpusRecord({ ...demoClip("noisy"), kind: "recorded" },
      metadata("French", "s03", { family: "Romance" }), "c_c")
  ];
  const summary = summarizeCorpus(rows);
  assert.equal(summary.speechSamples, 3);
  assert.equal(summary.languages.length, 2);
  assert.equal(summary.comparisons.sameLanguage.count, 1);
  assert.equal(summary.comparisons.sameLanguage.mean, 0);
  assert.equal(summary.comparisons.differentLanguage.count, 2);
  assert.ok(summary.comparisons.differentLanguage.mean > 0);
  assert.equal("pValue" in summary, false);
  const matrix = corpusDistanceMatrix(rows);
  assert.equal(matrix.length, 3);
  assert.equal(matrix[0][0], 0);
  assert.equal(matrix[0][2], matrix[2][0]);
});

test("unbalanced, missing speaker, permission, and prompt metadata raise flags", () => {
  const row = sample("c_a", "English", "", {
    device: "", prompt: "", consent: "unknown", license: "unspecified"
  });
  const warnings = qualityFlags(row).join(" | ");
  assert.match(warnings, /Speaker ID/);
  assert.match(warnings, /Permission not documented/);
  assert.match(warnings, /Prompt\/task/);
  assert.match(warnings, /Recording device/);
});
