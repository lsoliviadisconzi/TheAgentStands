/* Cues: "at this moment, this track changes to this value (over durMs)". Pure. */
import { EASE, type Ease } from './ease';
import type { Timeline } from './timeline';

export type TrackId =
  | 'mood' | 'light' | 'lightColor' | 'room' | 'accent' | 'propL' | 'propR'
  | 'badge' | 'name' | 'direction' | 'panel'
  | 'badgeColor' | 'badgeName'
  | 'tension' | 'vignette' | 'grain';

export type Anchor =
  | { kind: 'reel'; ms: number }
  | { kind: 'hook'; offsetMs?: number }
  | { kind: 'stamp'; offsetMs?: number }
  | {
      kind: 'line';
      line: string;
      at: 'start' | 'end' | 'speechEnd' | 'word';
      word?: number;
      offsetMs?: number;
    };

export interface Cue {
  id: string;
  track: TrackId;
  anchor: Anchor;
  value: unknown;
  durMs?: number;
  ease?: Ease;
}

export type TrackKind = 'step' | 'number' | 'color';

export const TRACK_KIND: Record<TrackId, TrackKind> = {
  mood: 'step', light: 'step', lightColor: 'color', room: 'color', accent: 'color',
  propL: 'step', propR: 'step',
  badge: 'step', name: 'step', direction: 'step', panel: 'step',
  badgeColor: 'step', badgeName: 'step',
  tension: 'number', vignette: 'number', grain: 'number',
};

export const DEFAULT_DURATION: Record<TrackId, number> = {
  mood: 0, light: 0, lightColor: 240, room: 240, accent: 240,
  propL: 0, propR: 0, badge: 0, name: 0, direction: 0, panel: 0,
  badgeColor: 0, badgeName: 0,
  tension: 320, vignette: 320, grain: 320,
};

export interface SceneState {
  mood: string;
  light: string;
  lightColor: string;
  room: string;
  accent: string;
  propL: string | null;
  propR: string | null;
  badge: string;
  name: string;
  direction: string | null;
  panel: string | null;
  tension: number;
  vignette: number;
  grain: number;
  badgeColor?: string;
  badgeName?: string;
}

export const DEFAULT_SCENE_STATE: SceneState = {
  mood: 'calm',
  light: 'sway',
  lightColor: '#f0b060',
  room: '#3a1f3a',
  accent: '#d4a44a',
  propL: null,
  propR: null,
  badge: 'The Man',
  name: 'The Man',
  direction: null,
  panel: null,
  tension: 0.3,
  vignette: 0.2,
  grain: 0.1,
  badgeColor: undefined,
  badgeName: undefined,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

function lerpHex(a: string, b: string, u: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * u, ag + (bg - ag) * u, ab + (bb - ab) * u);
}

interface LineLookup { id: string; s: string; }

function resolveAnchor(anchor: Anchor, tl: Timeline, lines: LineLookup[]): number {
  if (anchor.kind !== 'line') {
    switch (anchor.kind) {
      case 'reel': return anchor.ms;
      case 'hook': return anchor.offsetMs ?? 0;
      case 'stamp': return tl.stampAt + (anchor.offsetMs ?? 0);
    }
  }
  const i = lines.findIndex((l) => l.id === anchor.line);
  if (i < 0) return Number.POSITIVE_INFINITY;
  const start = tl.starts[i];
  const offset = anchor.offsetMs ?? 0;
  switch (anchor.at) {
    case 'start': return start + offset;
    case 'end': return tl.ends[i] + offset;
    case 'speechEnd': return tl.speechEnds[i] + offset;
    case 'word': {
      const words = lines[i].s.split(/\s+/).filter(Boolean);
      const w = anchor.word ?? 0;
      if (w >= words.length) return start + tl.typingMs[i] + offset;
      let charPos = 0;
      for (let k = 0; k < w; k++) charPos += words[k].length + 1;
      const total = Math.max(1, lines[i].s.length);
      return start + tl.typingMs[i] * (charPos / total) + offset;
    }
  }
}

interface ResolvedCue { cue: Cue; at: number; }

function evalTrack(
  cues: Cue[],
  tl: Timeline,
  lines: LineLookup[],
  t: number,
  baseValue: unknown,
): unknown {
  const kind = TRACK_KIND[cues[0].track];
  const fired: ResolvedCue[] = cues
    .map((c) => ({ cue: c, at: resolveAnchor(c.anchor, tl, lines) }))
    .filter((x) => x.at <= t)
    .sort((a, b) => a.at - b.at);
  if (fired.length === 0) return undefined;

  const last = fired[fired.length - 1];
  if (kind === 'step') return last.cue.value;

  const dur = last.cue.durMs ?? DEFAULT_DURATION[last.cue.track];
  if (dur <= 0) return last.cue.value;

  const u = clamp01((t - last.at) / dur);
  if (u >= 1) return last.cue.value;
  const prev = fired.length >= 2 ? fired[fired.length - 2].cue.value : baseValue;
  const eased = EASE[last.cue.ease ?? 'ease'](u);
  if (kind === 'color') return lerpHex(String(prev), String(last.cue.value), eased);
  return Number(prev) + (Number(last.cue.value) - Number(prev)) * eased;
}

export function sceneAt(
  cues: Cue[],
  tl: Timeline,
  lines: LineLookup[],
  t: number,
  base: SceneState = DEFAULT_SCENE_STATE,
): SceneState {
  const byTrack: Partial<Record<TrackId, Cue[]>> = {};
  for (const c of cues) (byTrack[c.track] ||= []).push(c);

  const out: SceneState = { ...base };
  for (const track of Object.keys(byTrack) as TrackId[]) {
    const v = evalTrack(byTrack[track]!, tl, lines, t, (base as unknown as Record<string, unknown>)[track]);
    if (v === undefined) continue;
    if (track === 'badge' || track === 'name') {
      out.badge = String(v);
      out.name = String(v);
    } else if (track === 'badgeColor' || track === 'badgeName') {
      // These are not in SceneState but are handled by the runtime
      (out as unknown as Record<string, unknown>)[track] = v;
    } else {
      (out as unknown as Record<string, unknown>)[track] = v;
    }
  }
  return out;
}