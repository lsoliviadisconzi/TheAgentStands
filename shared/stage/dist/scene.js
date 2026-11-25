import { sceneAt as evalCues, DEFAULT_SCENE_STATE } from './cues';
import { typedText } from './typed';
import { mouthOpen } from './mouth';
export function frameAt(cues, tl, lines, t, pace = 'classic') {
    const scene = evalCues(cues, tl, lines, t, DEFAULT_SCENE_STATE);
    const inHook = t < tl.starts[0];
    const inStamp = t >= tl.stampAt;
    let lineIndex = -1;
    for (let i = 0; i < tl.starts.length; i++) {
        if (t >= tl.starts[i] && t < tl.ends[i]) {
            lineIndex = i;
            break;
        }
    }
    // Between lines: hold the last-completed line's scene state.
    if (lineIndex < 0 && !inHook && !inStamp) {
        for (let i = tl.starts.length - 1; i >= 0; i--) {
            if (t >= tl.starts[i]) {
                lineIndex = i;
                break;
            }
        }
    }
    const phase = inHook ? 'hook' : inStamp ? 'stamp' : lineIndex >= 0 && t < tl.ends[lineIndex] ? 'line' : 'gap';
    const line = lineIndex >= 0 ? lines[lineIndex] : null;
    const typed = line ? typedText(tl, lineIndex, t, line.s, pace) : '';
    const mouth = line && phase === 'line' && tl.starts[lineIndex] !== undefined && line.speechMs !== undefined
        ? mouthOpen(t, tl.starts[lineIndex], line.speechMs)
        : 0;
    return { ...scene, lineIndex, typed, mouth, phase };
}
