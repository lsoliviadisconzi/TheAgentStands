/* The single entry point every consumer (preview, export, storyboard) calls.
 * Pure: same inputs → same outputs, always. */
import type { Timeline, TimedLine, Pace } from './timeline';
import { sceneAt as evalCues, DEFAULT_SCENE_STATE, type Cue, type SceneState } from './cues';
import { typedText } from './typed';
import { mouthOpen } from './mouth';

export interface FrameState extends SceneState {
  lineIndex: number;        // -1 during hook, stamp or between lines
  typed: string;            // characters visible on the active line
  mouth: number;            // 0..1
  phase: 'hook' | 'line' | 'gap' | 'stamp';
}

export function frameAt(
  cues: Cue[],
  tl: Timeline,
  lines: TimedLine[],
  t: number,
  pace: Pace = 'classic',
): FrameState {
  const scene = evalCues(cues, tl, lines, t, DEFAULT_SCENE_STATE);

  const inHook = t < tl.starts[0];
  const inStamp = t >= tl.stampAt;

  let lineIndex = -1;
  for (let i = 0; i < tl.starts.length; i++) {
    if (t >= tl.starts[i] && t < tl.ends[i]) { lineIndex = i; break; }
  }
  // Between lines: hold the last-completed line's scene state.
  if (lineIndex < 0 && !inHook && !inStamp) {
    for (let i = tl.starts.length - 1; i >= 0; i--) {
      if (t >= tl.starts[i]) { lineIndex = i; break; }
    }
  }

  const phase: FrameState['phase'] =
    inHook ? 'hook' : inStamp ? 'stamp' : lineIndex >= 0 && t < tl.ends[lineIndex] ? 'line' : 'gap';

  const line = lineIndex >= 0 ? lines[lineIndex] : null;
  const typed = line ? typedText(tl, lineIndex, t, line.s, pace) : '';
  const mouth = line && phase === 'line' && tl.starts[lineIndex] !== undefined && line.speechMs !== undefined
    ? mouthOpen(t, tl.starts[lineIndex], line.speechMs)
    : 0;

  return { ...scene, lineIndex, typed, mouth, phase };
}