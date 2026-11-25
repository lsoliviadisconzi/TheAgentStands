/* Timeline math — pure, deterministic, no dependencies.
 *
 * The theme players type one character per 40 ms tick (their `w(24)` rounds up to one
 * 40 ms step), wait 1920 + 400 ms on the hook card, and show the stamp for 3800 ms.
 * Rather than patching those players, we steer them through the one knob they expose:
 * each line's `h` (hold after typing). Audio start times are re-measured during capture,
 * so a small error here can never put a voice out of sync with its text. */

export const TICK = 40;
export const HOOK_MS = 1920 + 400; // 2320
export const STAMP_MS = 3800;

export type Pace = 'classic' | 'speech';

export interface TimedLine {
  id: string;
  s: string;        // spoken + typed text
  h: number;        // beat (ms) held AFTER the line is finished speaking
  speechMs: number; // audio duration in ms (0 if no usable audio)
  offset?: number;  // start no earlier than (ms from reel start)
}

export interface Timeline {
  holds: number[];       // effective `h` per line, handed to the player
  starts: number[];      // when each line starts typing / speaking
  speechEnds: number[];  // when speech ends (max of typing and audio)
  ends: number[];        // when the player moves on to the next line
  stampAt: number;       // when the stamp card appears
  totalMs: number;       // total reel duration including stamp
  missingAudio: number[]; // 0-based indexes of lines with no usable audio
  clamped: number[];     // 0-based indexes whose requested start offset could not be honoured
  typingMs: number[];    // typing duration per line (for pace: 'speech')
  speechMs: number[];    // audio duration per line (0 if no usable audio)
}

const ceilTick = (ms: number) => Math.ceil(ms / TICK) * TICK;

function wantedOffset(line?: TimedLine): number {
  return (line?.offset && line.offset > 0) ? line.offset : 0;
}

/** Build a deterministic timeline from timed lines.
 *  - Lines are strictly sequential: line N+1 begins the moment line N's hold is over.
 *  - `h` is the only knob the theme player exposes.
 *  - A line's `offset` ("start no earlier than, ms from reel start") is implemented by
 *    stretching the PREVIOUS line's hold. That makes the plan, the live preview and the
 *    exported video agree.
 *  - What an offset cannot do is pull a line earlier than the previous line allows,
 *    or move the first line (the hook card has a fixed length); those are reported in `clamped`. */
export function buildTimeline(lines: TimedLine[], opts: { pace?: Pace } = {}): Timeline {
  const pace = opts.pace ?? 'classic';
  const plan: Timeline = {
    holds: [],
    starts: [],
    speechEnds: [],
    ends: [],
    stampAt: 0,
    totalMs: 0,
    missingAudio: [],
    clamped: [],
    typingMs: [],
    speechMs: [],
  };

  let t = HOOK_MS;
  lines.forEach((l, i) => {
    const start = t;
    const typing = pace === 'speech' && l.speechMs > 0 ? l.speechMs : [...l.s].length * TICK;
    plan.typingMs.push(typing);
    plan.speechMs.push(l.speechMs);

    const usable = l.speechMs > 0;
    if (!usable) plan.missingAudio.push(i);
    const speech = usable ? l.speechMs : 0;

    // Honour this line's own request (only reportable here, the gap was added to the previous hold).
    const req = wantedOffset(l);
    if (req && (i === 0 ? Math.abs(req - start) >= TICK : start - req >= TICK)) {
      plan.clamped.push(i);
    }

    // Natural hold: let the voice finish, then the author's beat.
    // Then stretch it if the NEXT line asks to start later.
    const natural = ceilTick(Math.max(0, speech - typing) + Math.max(0, l.h));
    const nextReq = wantedOffset(lines[i + 1]);
    const hold = nextReq ? Math.max(natural, ceilTick(nextReq - start - typing)) : natural;

    plan.holds.push(hold);
    plan.starts.push(start);
    plan.speechEnds.push(start + Math.max(typing, speech));
    plan.ends.push(start + typing + hold);
    t = start + typing + hold;
  });

  plan.stampAt = t;
  plan.totalMs = t + STAMP_MS;
  return plan;
}