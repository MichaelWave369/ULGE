# ULGE Measurement Validation Protocol · v0.5

## Purpose

Before interpreting shared language structure, measure whether the acoustic tools detect what they claim. This release adds deterministic synthetic-reference tests and user-supplied reference annotations for actual recordings. It does **not** bundle an independently verified annotated human-speech dataset, so synthetic benchmark results must never be presented as human-speech accuracy figures.

## Synthetic ground truth

The in-browser diagnostic generates sine waves at 110, 155, 200, 267 and 360 Hz plus a deterministic noisy 220 Hz example. Generated waveforms pass through the same spectral pipeline as uploaded audio: 16 kHz input, a 64 ms window and a 10 ms hop. The clean-tone preset is marked PASS only if median candidate frequency differs by at most 50 cents and more than 60% of analysis windows produce a voiced candidate.

The pulse control uses a 180 Hz sine carrier and four known Gaussian amplitude-envelope peaks. The app scores the detected peaks against the generator's event times. They are acoustic pulses, NOT syllables. Synthetic accuracy does not imply speech or language accuracy.

The pitch estimator is normalized autocorrelation, with an amplitude and correlation threshold, lag search constrained to roughly 70–420 Hz, and parabolic lag interpolation. Refinement reduces integer-lag quantization on clean periodic tones, but does not eliminate octave errors, effects of microphone response, or rejection of real voice frames.

## Annotation JSON schema

Import a UTF-8 JSON file with schema identifier ULGE.annotation.v1, source label, secondsAnalyzed, pitch references and event timestamps. A template can be downloaded directly from the studio.

Example data format, **fictional and not independently verified**:

    {
      "schema": "ULGE.annotation.v1",
      "source": "Human annotator or independent reference corpus",
      "secondsAnalyzed": 2,
      "pitch": [
        { "seconds": 0.5, "hz": 160 },
        { "seconds": 0.7, "hz": null },
        { "seconds": 1.0, "hz": 171 }
      ],
      "eventsSeconds": [0.42, 0.9, 1.41],
      "notes": "Specify event type and annotation procedure."
    }

- A null pitch value means *explicitly unvoiced*, not missing or unreviewed. Omit unannotated spans instead.
- Pitch and event times must be strictly increasing and lie within the analyzed duration, which must match the recording within 50 milliseconds.
- Non-null pitch annotations must be between 30 and 1500 Hz. Up to 500 pitch points and 300 events are allowed; the JSON file is capped at 256 KB.
- The annotation is bound to the clip ID in either A or B; changing the clip detaches the annotation so it cannot silently be scored against another recording.
- ULGE cannot verify the source, accuracy, permission status or event types claimed in a supplied file.

## Pitch validation

For each annotated pitch time, ULGE chooses the closest of the analyzed report's 160 stored trace columns. It marks true positive voiced matches, false positive voiced estimates, missed voiced frames, and correct unvoiced matches. It reports voicing precision, recall and F1 when defined.

For jointly voiced frames, error in cents is 1200 × log2(estimate Hz / reference Hz). Median absolute cents error, mean absolute Hz error, fraction of jointly voiced examples above 20% relative Hz error, and approximate octave mistakes can also be computed.

**A missing prediction must not count as an excellent pitch estimate.** Thus pitch-error statistics are restricted to jointly voiced samples and must be interpreted alongside voicing recall and sample count. Multiple annotation points can map to one trace column, so samples are not necessarily independent.

## Event matching

Detected acoustic energy peaks are matched to reference event times one-to-one within ±90 ms. The current deterministic closest-first matcher is transparent but does not guarantee globally maximum-cardinality matching. It reports matched, extra and missed counts; event precision and recall; F1; and mean absolute timing error for matched events.

The matched event **type** is whatever was independently annotated. A human-marked syllable nucleus is not equivalent to a sound energy peak; agreement is useful as a diagnostic, not proof of general syllable recognition. If the denominator is zero, precision/recall is undefined rather than fabricated as perfect agreement.

## Rhythm

ULGE compares event count, median interval between successive detected energy peaks, and coefficient of variation of successive intervals between A and B. These statistics can change because of microphone conditions, the speaker, speech rate, and the actual text. No language/rhythm classification is implemented.

## Privacy, scientific limits and follow-up

All analysis and annotation comparison occurs in the browser. Exports carry derived features, timestamps and user-provided labels, never raw microphone samples. **Derived features and metadata may still identify a person**, so exported reports should be handled according to dataset license and consent.

To validate real-world pitch or syllable events, use ethically sourced, independently annotated real speech; held-out speakers and language families; channel controls; annotated task definitions; and confidence intervals clustered at the correct level. Synthetic tests, a small upload, and an attractive plot cannot establish language universals.

Next research work: robust F0 baselines such as YIN/pYIN, real annotated corpus adapters with documented provenance, more principled event alignment, speaker-independent testing, and a distinct modality-aware pathway for signed languages.
