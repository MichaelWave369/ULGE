# ULGE v0.6 · Real Speech Benchmark Protocol

## Purpose and scope

This version is a **local evaluation instrument**, not an annotated speech corpus. No human recordings or verified reference annotations are bundled. It cannot truthfully report real-speech accuracy until independent recordings and annotations are supplied.

The browser analyzes recordings using ULGE's 10 ms-hop, 64 ms window spectral estimator, scores agreement with independent pitch and/or event labels, and reports per-clip results and group summaries. It is **not** a language recognizer, transcription engine, syllable detector, or proof of language universals.

## Rights and privacy

Use audio you recorded yourself, have documented permission to analyze, or that has a compatible public license. Record licensing/consent provenance outside ULGE as necessary. Use pseudonymous speaker IDs.

Processing occurs entirely in browser memory. No audio is sent to a ULGE server. Exported JSON excludes raw audio, but filenames, metadata, reference timing and derived scores **may identify people**. No provenance claim is automatically verified.

## Input and performance limits

- Maximum 24 declared recordings; filenames are unique, bare names (no paths), matched ignoring letter case.
- Each selected audio file must be non-empty, at most 25 MB, and the selection's total size at most 160 MB.
- Maximum manifest size: 1 MB.
- The first 20 seconds of each recording are analyzed; longer recordings are marked truncated.
- Reference duration must match the analyzed excerpt to within 50 milliseconds.
- Up to 500 individually annotated pitch time points and 300 events per recording.
- Decoding/analysis is sequential. Begin with a few short recordings; large files can stress browser CPU and memory.

## Manifest format

Download an **empty reference manifest template** from the app, then edit its clips array. It contains zero invented human observations by design.

The following example is **illustrative only**; file names and values are not actual recordings or verified ground truth.

    {
      "schema": "ULGE.real-speech-benchmark.v1",
      "dataset": "My controlled pilot dataset",
      "provenance": "Explain consent, recording and annotation procedure",
      "notes": "Illustrative only",
      "clips": [
        {
          "fileName": "speaker001-utterance01.wav",
          "language": "English",
          "family": "Germanic",
          "speaker": "speaker001",
          "device": "USB microphone A",
          "prompt": "read_prompt_001",
          "rights": "self-recorded",
          "eventType": "Syllable nucleus (human annotated)",
          "metrics": ["pitch", "events"],
          "annotation": {
            "schema": "ULGE.annotation.v1",
            "source": "Independent human annotator / protocol version",
            "secondsAnalyzed": 2.0,
            "pitch": [
              { "seconds": 0.5, "hz": 160 },
              { "seconds": 0.7, "hz": null },
              { "seconds": 1.0, "hz": 171 }
            ],
            "eventsSeconds": [0.42, 0.90, 1.41]
          }
        }
      ]
    }

## Metadata semantics

- fileName: must match a selected audio filename; bare names only and no duplicates.
- language: self-reported language name, not inferred by the tool.
- family, speaker, device, prompt: optional but flagged when absent. Speaker IDs should be pseudonymous.
- rights: self-recorded, documented-permission, public-license, or unknown. A label is not proof of permission.
- metrics: explicitly list pitch and/or events. Each declares what to score.
- eventType: required for event scoring. Define the type precisely.
- annotation: validated independent reference, including source and duration. Pitch Hz is 30–1500 or null (meaning **explicitly unvoiced**, not missing). Times must be strictly increasing and inside the declared excerpt.

An empty event list is meaningful **negative reference** only when events are explicitly selected. Pitch scoring requires at least one known pitch point; no missing annotation is treated as a perfect score.

## Running the pilot

1. Collect and independently annotate real audio with documented permissions.
2. Document speaker ID, language family, microphone, prompt and annotation method.
3. Download the empty JSON template, populate clips with actual per-file references, and import it.
4. Select the matching audio files. Unmatched selections are ignored; manifest entries with missing files are visible.
5. Run local evaluation. Review per-clip scores, warnings, decoding failures and duration mismatches.
6. Group by language, language family, speaker, device, prompt or reference event type.
7. Export the measured report to preserve this volatile workspace. Exports never include audio.

## Statistics and limitations

Pitch and event scoring reuse [the v0.5 validation protocol](VALIDATION_PROTOCOL.md).

- Voicing F1: calculated from pooled TP/FP/FN reference counts across clips.
- Pitch error: per-clip median absolute cents error on jointly voiced points, then **unweighted mean of clip medians** among valid clips. Not an overall median.
- Event F1: pooled matched/predicted/reference events, using deterministic one-to-one nearest-first matching within ±90 ms. This matching is not guaranteed maximum cardinality.
- Event timing: unweighted mean of per-clip mean matched-event timing errors.
- Undefined denominators appear as unavailable (not false perfection).
- Missing source/consent metadata and truncation produce warnings, not fabricated statistical adjustments.

Comparisons by language can be confounded by speaker, microphone, recording site, sentence/prompt and annotation method. Multiple frames from one speaker are not independent population samples. Without held-out speakers/language families, balancing, replication and clustered uncertainty estimates, the scores are **descriptive only**. No statistical significance, cause, universality probability or linguistic common-origin conclusion is computed.

## Future validation

- Independently annotated vocal pitch and syllable-nucleus datasets with documented licenses.
- Compare with independent F0 estimators such as YIN/pYIN, across voices/noise.
- Explicit speaker- and device-disjoint testing, then language-family-disjoint testing.
- Independent corpus replication and uncertainty intervals accounting for clustering.
- Study signed languages as language, via an appropriate visual modality rather than forcing audio analysis.

**Measurements before metaphors. Provenance before conclusions.**
