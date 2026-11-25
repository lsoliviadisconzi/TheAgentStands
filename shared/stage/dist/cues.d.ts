import { type Ease } from './ease';
import type { Timeline } from './timeline';
export type TrackId = 'mood' | 'light' | 'lightColor' | 'room' | 'accent' | 'propL' | 'propR' | 'badge' | 'name' | 'direction' | 'panel' | 'badgeColor' | 'badgeName' | 'tension' | 'vignette' | 'grain';
export type Anchor = {
    kind: 'reel';
    ms: number;
} | {
    kind: 'hook';
    offsetMs?: number;
} | {
    kind: 'stamp';
    offsetMs?: number;
} | {
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
export declare const TRACK_KIND: Record<TrackId, TrackKind>;
export declare const DEFAULT_DURATION: Record<TrackId, number>;
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
export declare const DEFAULT_SCENE_STATE: SceneState;
interface LineLookup {
    id: string;
    s: string;
}
export declare function sceneAt(cues: Cue[], tl: Timeline, lines: LineLookup[], t: number, base?: SceneState): SceneState;
export {};
//# sourceMappingURL=cues.d.ts.map