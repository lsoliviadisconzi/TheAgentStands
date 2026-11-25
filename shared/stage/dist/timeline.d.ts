export declare const TICK = 40;
export declare const HOOK_MS: number;
export declare const STAMP_MS = 3800;
export type Pace = 'classic' | 'speech';
export interface TimedLine {
    id: string;
    s: string;
    h: number;
    speechMs: number;
    offset?: number;
}
export interface Timeline {
    holds: number[];
    starts: number[];
    speechEnds: number[];
    ends: number[];
    stampAt: number;
    totalMs: number;
    missingAudio: number[];
    clamped: number[];
    typingMs: number[];
    speechMs: number[];
}
/** Build a deterministic timeline from timed lines.
 *  - Lines are strictly sequential: line N+1 begins the moment line N's hold is over.
 *  - `h` is the only knob the theme player exposes.
 *  - A line's `offset` ("start no earlier than, ms from reel start") is implemented by
 *    stretching the PREVIOUS line's hold. That makes the plan, the live preview and the
 *    exported video agree.
 *  - What an offset cannot do is pull a line earlier than the previous line allows,
 *    or move the first line (the hook card has a fixed length); those are reported in `clamped`. */
export declare function buildTimeline(lines: TimedLine[], opts?: {
    pace?: Pace;
}): Timeline;
//# sourceMappingURL=timeline.d.ts.map