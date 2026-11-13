# ULGE Spectral Protocol · v0.4

## Intended question

How does acoustic energy, spectrum, approximate vocal pitch, and envelope timing vary within a single recorded utterance? This release supplies exploratory measurement tools, not language identification, phoneme recognition, syllable counts, sound-to-meaning conversion, or universal-language claims.

## Audio preparation and limits

- Audio remains local to the browser. Neither the source waveform nor microphone streams are uploaded.
- All input is downmixed and linearly resampled to 16 kHz.
- Analyze **the first 20 seconds**, with a 1024-sample (64 ms) Hann-windowed FFT, sliding by 160 samples (10 ms).
- Features and spectra are computed for up to approximately 1,900 windows. Long files are explicitly marked as truncated.
- The displayed spectrogram summarizes the analysis in 160 horizontal columns, each with 40 log-frequency bands spanning 80 Hz to 8 kHz. FFT magnitudes are squared to a band-energy proxy.
- Color scaling is relative to the maximum spectral band energy within **each individual clip**, mapped to an approximately -72 dB visual range. This is not a calibrated sound-pressure display, and colors must not be compared as absolute loudness across microphones or samples.

## Tentative pitch estimates

A basic normalized autocorrelation is run per window after mean subtraction and 2:1 decimation. The pitch search is limited to approximately 70–420 Hz and a voiced-candidate correlation threshold. Low-amplitude and low-confidence windows yield null pitch values. The chart intentionally renders them as gaps.

This method can make octave errors, reject genuine voice frames, spuriously track musical notes, and fail for very high/low voices. It is not a clinical voice assessment or a complete music/speech pitch detector. Median pitch is the median of candidate windows only, not the recording's proven fundamental frequency.

## Rhythm / envelope peaks

Window RMS energy is smoothed over about seven 10ms frames. Local maxima above a relative threshold are marked with a minimum separation of approximately 140ms. The displayed rate is the inverse average spacing between candidate peaks, not words/s, syllables/s or a linguistic rhythm score.

Noise pulses, applause, music, consonant releases and breath transients can also create these peaks. Silence, background noise, microphone gain and compressive audio processing can dramatically change results.

## Exports and privacy

The spectral JSON export includes compact numeric spectrogram columns, time traces, candidate pitch and peak metadata and user-provided sample names/language labels. No raw audio is exported. These derived features and labels can nevertheless identify speakers or reveal private information; do not publish them casually.

Spectral data is **not** automatically included in the multi-item corpus manifests (size/privacy limitation). The corpus's smaller temporal-v1 summaries remain interoperable. A corpus-only sample loaded into A/B will correctly display missing spectral data instead of inventing it.

## A controlled first experiment

1. Record a few seconds of a known voiced vowel at different pitches to check if the pitch display moves as expected.
2. Speak the same phrase twice using the same microphone and conditions, first slowly and then quickly.
3. Compare energy envelopes and peak events. Different counts do **not** imply a different number of syllables.
4. Repeat across different microphones to expose channel confounds.
5. Add unrelated-language examples with balanced speakers, prompts and sample durations. Treat outcomes as hypotheses to test with controlled datasets, not findings.
6. Compare synthetic controls against speech: a synthesized tone may have stable pitch while containing no linguistic information.

## Planned validation

- Test with licensed speech datasets and manually annotated voicing/fundamental frequency as references.
- Cross-validate onset and syllable-nucleus estimates against human-transcribed annotations.
- Profile web-worker offloading and improve anti-aliasing in resampling.
- Measure cross-speaker and channel robustness with preregistered controls and speaker-independent splits.
- Explore additional language modalities separately, including sign-language video, to avoid equating language with acoustic speech.
