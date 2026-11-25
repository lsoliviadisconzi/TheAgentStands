/* Mouth openness at time t. A 4.2 Hz syllable rhythm shaped into a talk envelope,
 * gated by the line's speech window so it can never run past the audio. If real RMS
 * envelopes are available (they can be extracted on TTS upload), swap the inner
 * envelope for an RMS lookup — the outer contract stays the same. */
export function mouthOpen(t, lineStart, speechMs, phase = 0) {
    if (speechMs <= 0)
        return 0;
    const dt = t - lineStart;
    if (dt < 0 || dt > speechMs)
        return 0;
    const rate = 4.2;
    const raw = Math.sin((dt / 1000) * rate * 2 * Math.PI + phase) * 0.5 + 0.5;
    const sharp = Math.pow(raw, 2.5);
    const fadeIn = Math.min(1, dt / 80);
    const fadeOut = Math.min(1, (speechMs - dt) / 80);
    return sharp * fadeIn * fadeOut;
}
