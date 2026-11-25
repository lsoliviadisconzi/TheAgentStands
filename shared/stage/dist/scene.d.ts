import type { Timeline, TimedLine, Pace } from './timeline';
import { type Cue, type SceneState } from './cues';
export interface FrameState extends SceneState {
    lineIndex: number;
    typed: string;
    mouth: number;
    phase: 'hook' | 'line' | 'gap' | 'stamp';
}
export declare function frameAt(cues: Cue[], tl: Timeline, lines: TimedLine[], t: number, pace?: Pace): FrameState;
//# sourceMappingURL=scene.d.ts.map