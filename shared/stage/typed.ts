/* Typing progress at time t. The classic player shows the first character on the line's
 * start tick and advances one character per TICK. Speech pace spreads typing across the
 * audio, which is what eliminates the "mouth finishes early" bug. */
import { TICK, type Timeline, type Pace } from './timeline';

export function typedChars(
  tl: Timeline,
  i: number,
  t: number,
  len: number,
  pace: Pace = 'classic',
): number {
  const dt = t - tl.starts[i];
  if (dt < 0) return 0;
  if (pace === 'speech' && tl.speechMs[i] > 0) {
    return Math.min(len, Math.floor((dt / tl.typingMs[i]) * len) + 1);
  }
  return Math.min(len, Math.floor(dt / TICK) + 1);
}

export function typedText(
  tl: Timeline,
  i: number,
  t: number,
  text: string,
  pace: Pace = 'classic',
): string {
  const chars = [...text];
  return chars.slice(0, typedChars(tl, i, t, chars.length, pace)).join('');
}