# Temporal Acoustic Protocol: v0.3

## Why time order matters

Two signals can have similar spectral averages despite different orderings of events. Earlier ULGE versions compared average descriptors. This release preserves coarse time order without claiming to understand words, phonemes, or semantics.

## Extracted data

The 16 kHz signal is analyzed with a maximum of 120 Hann-windowed 1024-sample FFT frames. Each frame spans around 64 milliseconds. Frames are spread across the recording; they are not a continuous short-hop spectrogram, so brief transients may be missed.

Seven time-varying measurements are saved: RMS energy scaled by 0.25 and clipped to [0,1] (heuristic), spectral brightness, spectral spread, magnitude fraction below 600 Hz, magnitude fraction above 3000 Hz, spectral flatness, and zero-crossing rate.

RMS below 0.003 marks a frame inactive, retaining a time position but zeroing spectral descriptors. Time is normalized recording progress in [0,1], not aligned across utterances. Tracks are deterministically compacted to at most 64 frames, with feature values rounded to three decimals. No original waveform, microphone stream, or blob URL is part of the track. Audio-derived features plus metadata can still identify people; handle exports carefully.

## Constrained sequence comparison

Tracks are interpolated by ordinal frame position onto 32 positions each. Local acoustic cost is the root-mean-square difference over seven normalized time-varying descriptors. Direct mean cost compares the same ordinal positions.

Dynamic time warping (DTW) traces a monotone path through a 32-by-32 cost grid, connecting the first and last positions while permitting horizontal, vertical, or diagonal moves, bounded to ±20% of the diagonal. The displayed warped mean is the accumulated path cost divided by path steps. This is an exploratory heuristic, not a true phoneme alignment.

A smaller warped score may happen for unrelated sounds because warping is allowed. This does not establish linguistic universality, mutual intelligibility, or statistical significance. These are not p-values or calibrated distances. Microphones, prompts, speech rate, acoustics, silence and speaker traits can dominate.

## How to reproduce

1. Collect audio with documented rights and pseudonymous speaker IDs.
2. Prefer matched devices, comparable prompts, varied speakers and unrelated language families.
3. Add audio to A/B, observe the seven traces and inspect the time cursor.
4. Examine the alignment path as a measurement of these specific descriptors, not language meaning.
5. Save a versioned corpus JSON manifest. It includes temporal numeric tracks when available and never raw audio. Older manifests may lack temporal data.
6. Repeat under controls: different microphones, noise, speakers, shuffled order, and dissimilar content.

## Next steps

Continuous hop-based audio features (e.g. 10 ms hop), documented VAD, pitch/formant estimates, phoneme-aware representations, speaker-independent splits, held-out language families, and cluster-aware confidence intervals. Separately study signed language using its own modality. Replication, uncertainty and falsifiable controls should precede sweeping claims.
