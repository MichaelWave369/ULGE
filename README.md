# ULGE — Universal Language Geometry Engine

**Can human speech reveal shared mathematical structure across languages?** ULGE is a local-first, open-source React research playground that makes the hypothesis explorable without pretending an animation is scientific proof.

**Live site:** https://michaelwave369.github.io/ULGE/

## New in version 0.6: Real Speech Benchmark Lab

ULGE now includes a **local batch benchmark runner** for actual, independently annotated recordings. Nothing is supplied or scored by default. The versioned `ULGE.real-speech-benchmark.v1` manifest lists each audio filename, language, family, pseudonymous speaker, device, prompt, usage-rights claim, annotation source, and the **specific** pitch or event task to evaluate.

Download the deliberately **empty** template, follow [the benchmark protocol](docs/BENCHMARK_PROTOCOL.md), add your own appropriately licensed/consented speech recordings and independently reviewed annotations, and select matching local audio files (up to 24 files; 25 MB each and 160 MB total). The analyzer processes at most the **first 20 seconds** of each file, displaying missing files and invalid references as explicit issues.

The dashboard reports **per-file** pitch voicing F1, pitch errors and reference-event precision/recall, plus descriptive group slices by language, language family, speaker, device, prompt, or event type. Aggregate voicing/event F1 pools reference counts; pitch error is an unweighted *mean of per-clip medians* and is labeled accordingly. There are no statistical significance tests, held-out splits, confidence intervals, or causality claims.

Audio processing stays browser-local, and only *derived scores* and self-reported metadata are exported. **Filenames, speakers and features can still identify people.** The app does not authenticate annotation sources or establish that any language universals exist. UI currently keeps the dataset only in memory until you export and does not redistribute clips. The existing two-sample and corpus tools remain available.

## New in version 0.5: measurement validation and annotation scoring

The Validation Studio introduces a **deterministic synthetic reference suite** with known clean-tone frequencies and timed amplitude pulses. These controls go through the real spectral analyzer. Failures remain visible; synthetic successes are **not** claims of pitch accuracy on human speech.

You can also import an independent **local JSON annotation** for either current A/B clip. The schema supports timestamped known pitch (Hz or null for unvoiced) and event timestamps. The interface reports voiced/unvoiced agreement, pitch error in cents for jointly voiced reference points, and one-to-one event precision/recall with an explicit ±90ms matching tolerance. It displays detected vs annotated event timelines and includes a template generator plus feature-only score export.

The pitch estimator now uses sub-lag parabolic interpolation around its autocorrelation peak to reduce frequency quantization for clean periodic signals. This does **not** solve octave errors or validate natural speech pitch.

All annotation data remains in browser memory, is tied to the exact clip it was imported for, and is never uploaded. Imported metadata and derived data may still identify speakers. Older spectral data may lack the new pitchMethod field. No annotated human dataset is bundled and this release **does not assert real-speech accuracy** without actual independent labels.

See [Validation Protocol](docs/VALIDATION_PROTOCOL.md).

## New in version 0.4: 10 ms-hop spectrogram, pitch and rhythm candidates

A new Spectral Lab computes log-frequency spectrograms from 64ms Hann-windowed FFTs, one every 10ms across **only the first 20 seconds** of a recording (clearly flagged if truncated). The graph displays 40 frequency bands (80–8000 Hz) across 160 compact time columns and normalizes spectrogram intensity **within each recording**. Thus colors cannot compare absolute loudness across speakers or microphones.

A basic normalized-autocorrelation pitch tracker estimates tentative 70–420 Hz voice pitches and leaves unvoiced frames blank. A smoothed-RMS envelope marks **acoustic peak candidates**, which must NOT be mistaken for syllable counts. Comparison of unrelated recordings is still exploratory; this engine does not transcribe or recognize languages or discover universal geometry. Spectral A/B JSON export includes numeric summaries only, not raw audio. v0.2 corpus manifests remain intact; spectrum matrices are not added to the corpus manifest, to avoid surprising larger/potentially identifying exports.

See [Spectral Protocol](docs/SPECTRAL_PROTOCOL.md) for assumptions, caveats, and controlled test design.

## New in version 0.3: temporal acoustic traces

ULGE preserves up to 64 time-ordered feature windows per recording, including quiet intervals. The Temporal Lab shows seven descriptive tracks along normalized recording progress, a manual inspection cursor, and a constrained 32×32 dynamic-time-warping (DTW) alignment grid. Direct and warped scores are descriptive only, not phoneme alignment, translation, language identification, or evidence of a universal speech structure.

These tracks contain numeric acoustic descriptors, not waveforms. Feature exports and corpus manifests include bounded tracks when available, so they can be reloaded for sequence comparison. Metadata and audio-derived features may still identify individuals. Older v0.2 manifests without temporal data remain valid and display a missing-track notice.

Read the [Temporal Acoustic Protocol](docs/TEMPORAL_PROTOCOL.md).

## New in version 0.2: corpus workspace

A third panel now lets you register up to 60 corpus feature records in browser memory from A/B recordings, files or JSON manifests. It includes self-reported speaker, language-family, prompt, device/channel and usage permission metadata; QC warnings; a pairwise distance map; and descriptive means within/across language, speaker and prompt labels. Export/import versioned feature-only manifests (no audio). The workspace is intentionally ephemeral until you export. All user-supplied data requires independent verification before research claims.

See [Corpus protocol](docs/CORPUS_PROTOCOL.md) for controlled study design and caveats.

## What version 0.1 does

- Analyze a local audio file or record from your microphone (permission required, HTTPS or localhost).
- Extract seven frame-based acoustic descriptors: brightness, spectral spread, low- and high-frequency proportions, spectral flatness, energy variability, and zero crossings.
- Project those descriptors into an interactive, toroidal *illustrative geometry*. This mapping is a visualization choice, **not a discovered universal language shape**.
- Compare two recordings as normalized acoustic vectors. The distance is descriptive, **not** a probability, a language classification, or a statistical significance test.
- Export machine-readable feature summaries as JSON **without raw recordings**.
- Start with two deterministic, explicitly labeled **synthetic** example signals. These are not human languages.

All audio analysis runs in your browser. ULGE does not upload recordings or features to a server. Do not assume exports are anonymous if the names or language metadata identify people.

## Quick start

Requires Node.js 22 or a compatible recent release.

~~~bash
npm install
npm run dev
npm test
npm run build
~~~

## Method and limitations

The prototype downmixes and linearly samples audio at 16 kHz, selects up to 120 1024-sample frames across a recording, applies a Hann-windowed FFT, and averages spectral measurements over non-silent frames. Energy variation is measured over sampled windows. It is a minimal DSP baseline, not a validated phonetics pipeline.

A speaker's microphone, pronunciation, recording room, text, background noise, volume, and sample length can dominate these values. Two recordings cannot establish anything universal about language. Language labels are user-supplied metadata, not automatically detected labels. There is no automatic transcription, semantic embedding, phoneme recognition, or signed-language support in v0.1. A universal *spoken-acoustic* pattern would not by itself prove a universal property of all languages, including signed languages.

## Research roadmap

1. Ethical, documented corpus manifests with language, family, speaker metadata, license/consent, recording environment, and prompt.
2. Reproducible per-utterance and per-frame embeddings, alongside interpretable acoustic features.
3. Matched speaker/task/microphone controls, channel normalization, speech versus non-speech baselines, and null/permutation tests.
4. Preregistered hypotheses and held-out **entire language families**, with uncertainty intervals and effect sizes.
5. Independent replication and careful extensions to lexical semantics, gesture, and signed languages.

## Scientific jumping-off points

- Ćwiek et al. (2022), [The bouba/kiki effect is robust across cultures and writing systems](https://doi.org/10.1098/rstb.2020.0390), a behavioral study testing speakers of 25 languages. This does **not** demonstrate a universal speech geometry.
- Coupé et al. (2019), [Different languages, similar encoding efficiency](https://doi.org/10.1126/sciadv.aaw2594), a 17-language study showing average information rates near 39 bits per second under its methodology. That does **not** establish a universal natural constant.

## GitHub Actions and Pages

Pull requests run tests and a production build. Merges to main deploy the validated static build through GitHub Actions. Vite uses the project base path "/ULGE/". Under **Settings → Pages**, choose **GitHub Actions** as the deployment source.

## Open science

MIT licensed. PHI369 Labs / an open research commons. Measurements before metaphors.
