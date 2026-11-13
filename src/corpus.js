import { ANALYSIS_VERSION, DESCRIPTORS, featureDistance } from "./audio.js";
import { sanitizeTemporal } from "./temporal.js";

/**
 * Local-only corpus metadata and acoustic feature summaries.
 * No raw recordings, audio URLs, or file bytes enter this module.
 * All comparisons are descriptive; pairwise distances are dependent.
 */
export const CORPUS_SCHEMA = "ULGE.local-corpus.v1";
export const MAX_RECORDS = 60;
export const METADATA_MAX = 160;
const CONSENT = ["unknown", "self-recorded", "documented-permission"];
const LICENSE = ["unspecified", "private-research", "CC0", "CC-BY-4.0", "other"];
const SIGNAL_TYPES = ["speech", "non-speech", "synthetic"];
const SOURCE_KINDS = ["uploaded", "recorded", "synthetic", "imported", "other"];
const clampText = (value, max = METADATA_MAX) => String(value ?? "").trim().slice(0, max);

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function numberInRange(value, min, max, field) {
  ensure(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max,
    field + " must be a finite number between " + min + " and " + max + ".");
  return value;
}

function requiredEnum(value, options, field) {
  ensure(options.includes(value), "Unsupported " + field + " value.");
  return value;
}

function checkFeatures(features) {
  ensure(features && typeof features === "object" && !Array.isArray(features), "Feature vector missing.");
  const result = {};
  for (const { key } of DESCRIPTORS) {
    result[key] = numberInRange(features[key], 0, 1, "feature." + key);
  }
  return result;
}

/** Makes a clean, JSON-safe corpus row from a v0.1 acoustic summary. */
export function makeCorpusRecord(clip, metadata, id) {
  ensure(clip && typeof clip === "object", "Audio analysis is missing.");
  ensure(clip.version === ANALYSIS_VERSION, "Incompatible analysis version. Reanalyze the audio.");
  ensure(typeof id === "string" && /^[a-zA-Z0-9_-]{3,100}$/.test(id), "Invalid corpus row ID.");
  const synthetic = clip.kind === "synthetic";
  const signalType = synthetic ? "synthetic" : requiredEnum(metadata?.signalType ?? "speech", SIGNAL_TYPES, "signalType");
  const record = {
    id,
    name: clampText(clip.name || "Unnamed sample"),
    language: synthetic ? "Not a language" : clampText(metadata?.language || clip.language || "Unspecified"),
    family: synthetic ? "" : clampText(metadata?.family),
    speaker: synthetic ? "" : clampText(metadata?.speaker),
    prompt: synthetic ? "" : clampText(metadata?.prompt),
    device: synthetic ? "" : clampText(metadata?.device),
    consent: synthetic ? "unknown" : requiredEnum(metadata?.consent ?? "unknown", CONSENT, "consent"),
    license: synthetic ? "unspecified" : requiredEnum(metadata?.license ?? "unspecified", LICENSE, "license"),
    signalType,
    sourceKind: requiredEnum(SOURCE_KINDS.includes(clip.kind) ? clip.kind : "other", SOURCE_KINDS, "sourceKind"),
    version: clip.version,
    duration: numberInRange(clip.duration, 0.064, 3600, "duration"),
    frames: numberInRange(clip.frames, 1, 120, "frames"),
    activeFrames: numberInRange(clip.activeFrames, 1, 120, "activeFrames"),
    sampleRate: numberInRange(clip.sampleRate, 1000, 192000, "sampleRate"),
    originalSampleRate: numberInRange(clip.originalSampleRate, 1000, 192000, "originalSampleRate"),
    features: checkFeatures(clip.features)
  };
  ensure(record.activeFrames <= record.frames, "activeFrames exceeds frames.");
  if (clip.temporal != null) record.temporal = sanitizeTemporal(clip.temporal);
  return record;
}

/** Treat imported summaries as untrusted until regenerated from known audio. */
export function validateCorpusRecord(item) {
  ensure(item && typeof item === "object" && !Array.isArray(item), "Invalid corpus entry.");
  ensure(typeof item.id === "string" && /^[a-zA-Z0-9_-]{3,100}$/.test(item.id), "Invalid corpus entry ID.");
  for (const key of ["name", "language", "family", "speaker", "prompt", "device"]) {
    ensure(typeof item[key] === "string" && item[key].length <= METADATA_MAX, "Invalid " + key + " field.");
  }
  for (const field of ["consent", "license", "signalType", "sourceKind"]) {
    requiredEnum(item[field], {
      consent: CONSENT, license: LICENSE, signalType: SIGNAL_TYPES, sourceKind: SOURCE_KINDS
    }[field], field);
  }
  ensure(item.version === ANALYSIS_VERSION, "Analysis version mismatch.");
  // Revalidation also drops any unrecognized properties, e.g. an injected audioUrl.
  const rebuilt = makeCorpusRecord({
    name: item.name, language: item.language, kind: item.sourceKind,
    version: item.version, duration: item.duration, frames: item.frames,
    activeFrames: item.activeFrames, sampleRate: item.sampleRate,
    originalSampleRate: item.originalSampleRate, features: item.features,
    temporal: item.temporal
  }, item, item.id);
  // A synthetic example must never be reclassified as human speech on import.
  ensure(rebuilt.signalType === item.signalType, "Synthetic signal type mismatch.");
  return rebuilt;
}

export function validateCorpus(records) {
  ensure(Array.isArray(records), "Corpus must be a list.");
  ensure(records.length <= MAX_RECORDS, "The prototype supports up to " + MAX_RECORDS + " clips.");
  const seen = new Set();
  return records.map((row, index) => {
    const record = validateCorpusRecord(row);
    ensure(!seen.has(record.id), "Duplicate row ID at item " + (index + 1) + ".");
    seen.add(record.id);
    return record;
  });
}

export function importCorpusManifest(text) {
  ensure(typeof text === "string" && text.length <= 1024 * 1024, "Manifest exceeds 1 MB.");
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("Manifest is not valid JSON."); }
  ensure(parsed && parsed.schema === CORPUS_SCHEMA, "Unsupported manifest schema.");
  return validateCorpus(parsed.records);
}

export function exportCorpusManifest(records, date = new Date().toISOString()) {
  const clean = validateCorpus(records);
  return {
    schema: CORPUS_SCHEMA,
    analysis: ANALYSIS_VERSION,
    exportedAt: date,
    provenance: "Self-reported metadata and acoustic summaries. Imported values are not independently verified.",
    privacy: "Raw audio is never included. Metadata and summaries can still be identifying.",
    records: clean,
    summary: summarizeCorpus(clean)
  };
}

export function qualityFlags(record) {
  const flags = [];
  if (record.signalType === "synthetic") return ["Synthetic control, not language data"];
  if (record.signalType !== "speech") return ["Non-speech control, excluded from language summaries"];
  if (record.duration < 1.5) flags.push("Short excerpt (<1.5s)");
  if (record.activeFrames / record.frames < 0.5) flags.push("Low active-frame ratio (<50%)");
  if (!record.language || record.language === "Unspecified") flags.push("Language not specified");
  if (!record.family) flags.push("Language family not provided");
  if (!record.speaker) flags.push("Speaker ID not provided");
  if (!record.prompt) flags.push("Prompt/task not provided");
  if (!record.device) flags.push("Recording device not provided");
  if (record.consent === "unknown") flags.push("Permission not documented");
  if (record.license === "unspecified") flags.push("Usage license not documented");
  return flags;
}

function groupCounts(rows, key) {
  const tally = new Map();
  for (const record of rows) {
    const value = record[key] || "Unspecified";
    tally.set(value, (tally.get(value) || 0) + 1);
  }
  return [...tally].sort((a, b) => a[0].localeCompare(b[0])).map(([label, count]) => ({ label, count }));
}

const average = values => values.length
  ? values.reduce((total, value) => total + value, 0) / values.length : null;

/**
 * Descriptive corpus summary only. Pairwise distances share observations
 * and must NOT be treated as independent samples or hypothesis-test p-values.
 */
export function summarizeCorpus(records) {
  const clean = validateCorpus(records);
  const speech = clean.filter(row => row.signalType === "speech" &&
    row.language && row.language !== "Unspecified");
  const sameLanguage = [], differentLanguage = [];
  const sameSpeaker = [], differentSpeaker = [];
  const samePrompt = [], differentPrompt = [];
  const sameFamily = [], differentFamily = [];
  for (let i = 0; i < speech.length; i++) {
    for (let j = i + 1; j < speech.length; j++) {
      const left = speech[i], right = speech[j];
      const distance = featureDistance(left, right);
      (left.language === right.language ? sameLanguage : differentLanguage).push(distance);
      if (left.speaker && right.speaker) {
        (left.speaker === right.speaker ? sameSpeaker : differentSpeaker).push(distance);
      }
      if (left.prompt && right.prompt) {
        (left.prompt === right.prompt ? samePrompt : differentPrompt).push(distance);
      }
      if (left.family && right.family) {
        (left.family === right.family ? sameFamily : differentFamily).push(distance);
      }
    }
  }
  return {
    total: clean.length, speechSamples: speech.length,
    excluded: clean.length - speech.length,
    languages: groupCounts(speech, "language"),
    families: groupCounts(speech, "family"),
    speakers: groupCounts(speech, "speaker"),
    qualityIssues: clean.filter(row => qualityFlags(row).length).length,
    comparisons: {
      sameLanguage: { count: sameLanguage.length, mean: average(sameLanguage) },
      differentLanguage: { count: differentLanguage.length, mean: average(differentLanguage) },
      sameFamily: { count: sameFamily.length, mean: average(sameFamily) },
      differentFamily: { count: differentFamily.length, mean: average(differentFamily) },
      sameSpeaker: { count: sameSpeaker.length, mean: average(sameSpeaker) },
      differentSpeaker: { count: differentSpeaker.length, mean: average(differentSpeaker) },
      samePrompt: { count: samePrompt.length, mean: average(samePrompt) },
      differentPrompt: { count: differentPrompt.length, mean: average(differentPrompt) }
    },
    caveat: "Exploratory raw descriptor distance. No channel matching, speaker normalization, uncertainty estimates, or statistical significance. Pairwise distances are non-independent."
  };
}

export function corpusDistanceMatrix(records) {
  const clean = validateCorpus(records);
  return clean.map(left => clean.map(right => featureDistance(left, right)));
}
