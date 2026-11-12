# ULGE corpus protocol (v0.2)

## Purpose and scientific boundary

ULGE asks whether some measurable structure of speech persists across languages. v0.2 does not establish that hypothesis. It provides a local workspace for comparing seven normalized acoustic descriptors from the initial DSP engine. The geometry view is illustrative, not a discovered latent manifold.

The corpus holds up to 60 feature-summary rows per browser tab. State is volatile until exported. No audio is transmitted or stored in the corpus. Manifest JSON may still include identifying metadata, and the user is responsible for recording rights and consent.

## Suggested pilot

1. Pre-register a narrow hypothesis, such as whether acoustic distance varies under matched language/prompt conditions.
2. Use self-recorded or openly licensed/consented recordings.
3. Sample several speakers per language, with unrelated language families and repeated prompts.
4. Record pseudonymous speaker IDs, prompt, device/channel and source permission.
5. Upload audio files with metadata. One batch shares one metadata form, so add separately when the speaker or condition differs.
6. Inspect quality flags and within/different label distances. Review possible confounding by speaker, microphone, content, duration, and environment.
7. Export a local JSON manifest to save the session. Re-import manifests with caution: metadata is unverified.
8. Replicate under preregistered controls and held-out languages before reaching cross-linguistic conclusions.

## Corpus schema

Schema ID: ULGE.local-corpus.v1.

Rows include ID, sample name, language label, family, speaker ID, prompt ID, device/channel, consent, license, signal type (speech/non-speech/synthetic), source kind, analysis version, duration, frame counts, sample rates, and seven feature values.

Feature values (brightness, spread, low, high, texture, dynamics, crossings) must be finite numbers between 0 and 1. Imported data is validated; extra fields such as browser audio URLs are discarded. Synthetic built-in samples cannot be reclassified as speech by altering an import.

## Descriptor distance and comparison

For two seven-component normalized feature vectors x and y:

    distance = sqrt( sum((x[k] - y[k])^2, k=1..7) / 7 )

Distance is between 0 and 1. The interface shows arithmetic mean pair distances for same and different language labels, speaker labels, and task labels, along with pair counts. Records with missing labels are excluded from corresponding contrasts.

These pairs are not independent, and no p-values or significance tests are calculated. A difference in a chart is not a discovered universal law, and a low distance is not proof of similar words or meanings.

## Limits and future experiments

The baseline uses at most 120 short windows of each signal and discards much time order. It does not recover phonemes, syllables, semantic meaning or full prosody, and acoustic data cannot model signed languages.

Next: balanced ethical multilingual corpora, formants and voice-activity segmentation, held-out speakers/language families, channel normalization, negative controls, and cluster-aware uncertainty estimates. See the README and tests for details.
