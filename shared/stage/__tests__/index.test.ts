import { describe, it, expect } from 'vitest';
import {
  buildTimeline, TICK, HOOK_MS,
  sceneAt, DEFAULT_SCENE_STATE,
  frameAt, migrateStagefx,
  type Cue, type TimedLine,
} from '../index';

const L = (id: string, s: string, h = 0, speechMs = 0, offset?: number): TimedLine =>
  ({ id, s, h, speechMs, offset: offset ?? undefined });

describe('buildTimeline — parity with planReel (classic)', () => {
  it('single line, speech longer than typing', () => {
    const tl = buildTimeline([L('a', 'Hello', 500, 1200)]);
    expect(tl.starts).toEqual([HOOK_MS]);
    expect(tl.typingMs).toEqual([5 * TICK]);
    expect(tl.speechEnds[0]).toBe(HOOK_MS + 1200);
    // hold = snap(1200 - 200 + 500) = snap(1500) = 1520
    expect(tl.holds[0]).toBe(1520);
    expect(tl.ends[0]).toBe(HOOK_MS + 5 * TICK + 1520);
  });

  it('offset on the next line stretches the previous hold', () => {
    const tl = buildTimeline([
      L('a', 'Hi', 0, 400),
      L('b', 'There', 0, 800, HOOK_MS + 3000),
    ]);
    expect(tl.starts[1]).toBeGreaterThanOrEqual(HOOK_MS + 3000);
    expect(tl.clamped).toEqual([]);
  });

  it('missing speech still types', () => {
    const tl = buildTimeline([L('a', 'x'.repeat(50), 200, 0)]);
    expect(tl.speechEnds[0]).toBe(tl.starts[0] + 50 * TICK);
  });
});

describe('buildTimeline — pace: speech', () => {
  it('typing matches speech when audio exists', () => {
    const tl = buildTimeline([L('a', 'Hello', 0, 1200)], { pace: 'speech' });
    expect(tl.typingMs[0]).toBe(1200);
    expect(tl.speechEnds[0]).toBe(tl.starts[0] + 1200);
  });
});

describe('sceneAt — step tracks', () => {
  it('fires at the line start and holds until the next cue', () => {
    const lines = [L('a', 'A', 0, 100), L('b', 'B', 0, 100)];
    const tl = buildTimeline(lines);
    const cues: Cue[] = [
      { id: 'c1', track: 'mood', anchor: { kind: 'line', line: 'a', at: 'start' }, value: 'worried' },
      { id: 'c2', track: 'mood', anchor: { kind: 'line', line: 'b', at: 'start' }, value: 'calm' },
    ];
    expect(sceneAt(cues, tl, lines, tl.starts[0]).mood).toBe('worried');
    expect(sceneAt(cues, tl, lines, tl.starts[1] - 1).mood).toBe('worried');
    expect(sceneAt(cues, tl, lines, tl.starts[1]).mood).toBe('calm');
  });
});

describe('sceneAt — number tracks', () => {
  it('interpolates between cues', () => {
    const lines = [L('a', 'A', 0, 100), L('b', 'B', 0, 100)];
    const tl = buildTimeline(lines);
    const cues: Cue[] = [
      { id: 'c1', track: 'tension', anchor: { kind: 'line', line: 'a', at: 'start' }, value: 0, durMs: 0 },
      { id: 'c2', track: 'tension', anchor: { kind: 'line', line: 'b', at: 'start' }, value: 1, durMs: 400, ease: 'linear' },
    ];
    const mid = tl.starts[1] + 200;
    expect(sceneAt(cues, tl, lines, mid).tension).toBeCloseTo(0.5, 2);
    expect(sceneAt(cues, tl, lines, tl.starts[1] + 400).tension).toBe(1);
  });
});

describe('sceneAt — color tracks', () => {
  it('interpolates hex in sRGB', () => {
    const lines = [L('a', 'A', 0, 100), L('b', 'B', 0, 100)];
    const tl = buildTimeline(lines);
    const cues: Cue[] = [
      { id: 'c1', track: 'room', anchor: { kind: 'line', line: 'a', at: 'start' }, value: '#000000', durMs: 0 },
      { id: 'c2', track: 'room', anchor: { kind: 'line', line: 'b', at: 'start' }, value: '#ffffff', durMs: 400, ease: 'linear' },
    ];
    const mid = sceneAt(cues, tl, lines, tl.starts[1] + 200).room;
    expect(mid).toBe('#808080');
  });
});

describe('frameAt', () => {
  it('is pure: same t gives the same frame', () => {
    const lines = [L('a', 'Hello world', 0, 500)];
    const tl = buildTimeline(lines);
    const cues: Cue[] = [{ id: 'c1', track: 'mood', anchor: { kind: 'line', line: 'a', at: 'start' }, value: 'calm' }];
    const a = frameAt(cues, tl, lines, tl.starts[0] + 100);
    const b = frameAt(cues, tl, lines, tl.starts[0] + 100);
    expect(a).toEqual(b);
  });

  it('mouth is gated to the speech window', () => {
    const lines = [L('a', 'Hello', 0, 1000)];
    const tl = buildTimeline(lines);
    const cues: Cue[] = [];
    expect(frameAt(cues, tl, lines, tl.starts[0] + 500).mouth).toBeGreaterThan(0);
    expect(frameAt(cues, tl, lines, tl.ends[0] + 10).mouth).toBe(0);
  });
});

describe('migrateStagefx', () => {
  it('produces lossless step cues', () => {
    const cues = migrateStagefx([
      { id: 'a', m: 'worried', fx: { light: 'candle', color: '#ff0000', room: '#000080' } },
    ]);
    expect(cues.map((c) => c.track).sort()).toEqual(['light', 'lightColor', 'mood', 'room']);
    expect(cues.every((c) => c.durMs === undefined)).toBe(true);
    expect(cues.every((c) => c.anchor.kind === 'line' && (c.anchor as any).at === 'start')).toBe(true);
  });
});