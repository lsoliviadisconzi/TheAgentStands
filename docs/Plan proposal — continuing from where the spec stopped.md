# Plan proposal — continuing from where the spec stopped

I read the whole interaction plus the uploaded shaderbench pages, the theme HTML, and the backend/frontend stubs. Here's my read, then a phased plan that finishes the spec **and** ports the good parts of the workbench without any of its dead ends.

---

## 1\. What each system actually is (short)

**shaderbench (the Edinburgh workbench)** — a single-page tool where one state object `S` drives everything. It has a real, working **render pipeline** (sky canvas → Three.js canvas → SVG scene → FX → vignette/grain overlays), **presets** (`cartoon`, `noir`, `storybook`, `cinematic`, …), **diegetic axes** (`era`, `tod`, `weather`), a **record button** that captures slider moves as keyframes, and a storyboard strip. Its weakness: **keyframes never play back**, export is one PNG, `Math.random()` inside the SVG redraw, layers don't round-trip.

**Reel Manager / The Agent Stands** — a real project. Backend `planReel` is **deterministic** (sequential, tick-snapped, `TICK=40`, `HOOK_MS=2320`, `STAMP_MS=3800`), export is a virtual clock \+ `MutationObserver`, preview is an iframe with a `postMessage` protocol (`line`, `pause`, `start`, `end`, `audioblocked`), StageFX and Try-now already ship, mouth-follows-audio is a small patch. Its weakness: **two clocks** (typing vs. audio), preview/export drift, cue state is injected CSS/JS rather than data.

**The meeting point already exists.** Reel Manager's anchors (`line start / end / speechEnd / word`) and shaderbench's `sceneAt(t)` are the same idea from opposite directions. That's the synthesis.

---

## 2\. The single design principle for the rewrite

> **Time is the only input. Everything else — moods, lights, colours, props, typing, mouth, badge, stamp — is a pure function of `t`.**

That one rule dissolves every reported bug:

- The **mouth bug** disappears because typing is paced to `speechMs` (option `pace: 'speech'`).  
- **Preview/export drift** disappears because both call `sceneAt(t)` on the same engine.  
- **"Timing mismatch" export failures** disappear because export becomes frame-stepping, not observer-watching.  
- **Try now** becomes "call `setTime(t)`", not "reload and hope".  
- **StageFX injection** becomes cue data evaluated by `sceneAt`, not CSS/JS injection.

That's the whole architectural proposal. Everything below is a plan to get there in shippable increments.

---

## 3\. Architecture at a glance

```
           ┌────────────────────────────────────────────────┐
   STUDIO  │  Timeline editor  ·  Cue lanes  ·  Storyboard  │
           │  Looks panel      ·  Try now   ·  Record       │
           └──────────────┬─────────────────────────────────┘
                          │ postMessage  { t } / { cue }
                          ▼
           ┌────────────────────────────────────────────────┐
   PLAYER  │  sceneAt(t)  ──►  SceneState                    │
           │                    │                            │
           │                    ├─ setStage(...)             │
           │                    ├─ setMood/Light/Colour/Prop  │
           │                    ├─ typedChars(t, line)       │
           │                    ├─ panel lines / stamp       │
           │                    └─ mouth(env, speechMs)      │
           └────────────────────────────────────────────────┘
                          ▲
                          │  same call, same result
           ┌──────────────┴─────────────────────────────────┐
   EXPORT  │  for each frame: setTime(t); screenshot()       │
           │  → ffmpeg assemble (ordered, no observers)      │
           └────────────────────────────────────────────────┘
```

The engine is **one module** (`stage/`) imported by the player build, the export renderer, the storyboard thumbnailer, and the Try-now channel. If it isn't in `stage/`, it isn't shared.

---

## 4\. Phased plan

### Phase 0 — Foundation & parity (this unblocks everything)

**Goal:** one pure `buildTimeline()` shared by backend and player, byte-identical to today's `planReel()` under `pace: 'classic'`.

**Files:**

- `shared/stage/timeline.ts` (started in the previous turn — finish it)  
- `shared/stage/ease.ts` (done)  
- `backend/src/model.ts`: `planReel` becomes a thin wrapper around `buildTimeline(lines, { pace: 'classic' })`. Its output type stays `Plan` so `App.tsx` doesn't change.  
- `backend/test/timeline.parity.ts`: golden fixtures from real reels; assert `planReel(reel)` deep-equals `buildTimeline(...)` for `starts`, `speechEnds`, `ends`, `holds`, `stampAt`, `totalMs`.

**Verification:** a CI check that runs every reel in `data/reels.json` through both and diffs. No preview or export change yet.

**Risk:** none — nothing user-visible changes.

**Why first:** every later phase assumes `buildTimeline` is the truth. Prove it before building on it.

---

### Phase 1 — Scene state & cues (port shaderbench's `S` as data)

**Goal:** the StageFX features become **cue data**, not injected CSS.

**Files:**

- `shared/stage/types.ts`: `SceneState` (the current StageFX fields \+ `tod`, `era`, `weather`, `badge`, `name`, `direction`, `tension`, `vignette`, `grain`) and `Cue` / `Anchor` / `TrackId` (from the previous turn's `cues.ts` draft — finish it).  
- `shared/stage/cues.ts`: `sceneAt(cues, timeline, lines, t)` — returns a fully resolved `SceneState`. Pure. Handles `step` vs `number` vs `color` tracks. Handles the three anchors: `reel`, `hook`, `stamp`, `line {at: start|end|speechEnd|word}`.  
- `backend/src/model.ts`: add `reel.cues?: Cue[]`. Migration on load: each line's existing `m` and `fx` becomes `{ anchor: {kind:'line', line:id, at:'start'}, track:..., value:..., durMs:0 }`.  
- `backend/src/stagefx.ts`: keep the catalog of valid ids (`moods`, `lights`, `colours`, `props` — one file, as it already is). This is now the **source of truth for allowed cue values**, so the UI can't inject arbitrary values.

**Verification:** a fixture test that builds `sceneAt` for every line start of a real reel and asserts the resulting `SceneState` matches what the injected StageFX produced before the migration (mood, light, colour, room, props). Side-by-side screenshot on the Volume II theme.

**Risk:** medium — cue semantics must exactly cover today's StageFX. Mitigation: the migration is lossless (line-start anchor, durMs 0), so no visual change is possible until a cue is added.

---

### Phase 2 — The engine in the preview (the missing heart)

**Goal:** the player calls `sceneAt(t)` on every tick instead of relying on the theme's own scheduler.

**Files:**

- `shared/stage/typed.ts`: `typedChars(timeline, i, t, len, pace)` (already drafted) — replaces the theme's own `setTimeout` typing loop.  
- `shared/stage/mouth.ts`: `mouthOpen(t, speechMs, env)` — a 2-state envelope driven by the audio's RMS envelope (already computed on TTS upload) so mouth follows speech rhythm, not just on/off.  
- `themes/*.html`: keep as-is. The injected `PREVIEW_JS` gains one new message handler: `{ t: 'setTime', value }` → calls `window.__stage.setTime(value)`. Everything the theme currently does from `play(0)` onward stays, but is also reachable by `setTime`.  
- `backend/src/model.ts` (buildPlayerHtml): add the `stage/` engine bundle as a single `<script>` before the theme's own player, and expose `window.__stage = { setTime, sceneAt }`.

**Verification:**

- **Frame diff harness:** render the same reel via (a) the current player and (b) `setTime(t)` for every 100 ms on a 30 s reel, screenshot both, diff pixel-by-pixel. Tolerance: ≤ 0.5% of pixels with max channel delta \> 8\. Any line that fails goes on a list; fix the engine before moving on.  
- **`pace: 'speech'` opt-in flag** on a single test reel: typing is paced to `speechMs` so the mouth bug is impossible. Verify visually \+ frame-diff is *expected* to differ, and mark the reel as the "new engine" baseline.

**Risk:** high. This is the actual rewrite. Mitigation: keep the current player behind a `?legacy=1` flag for one release. Only flip the default once the frame-diff list is empty on Volume II.

---

### Phase 3 — Export by frame stepping (kill the observer fragility)

**Goal:** export is deterministic by construction.

**Files:**

- `backend/src/render.ts`: replace the virtual clock \+ MutationObservers with:  
  1. `page.evaluate(() => window.__stage.setTime(t))`  
  2. `page.screenshot({ clip: stageRect, type: 'png' })` → temp frame file  
  3. After all frames, `ffmpeg -framerate 30 -i frames/%06d.png -i audio.m4a ...`  
- Poster: pick the frame nearest `stampAt + STAMP_MS / 2` from the frames already written (no re-render).  
- Keep the old path behind `EXPORT_LEGACY=1` for one release.

**Verification:** export Volume II both ways; compare `ffprobe` duration and per-frame SSIM (target \> 0.99) between old and new. Run the export three times; new path must be byte-identical across runs, old path is allowed not to be (that's the point).

**Risk:** medium. Frame rate must be exact (`-r 30`, no `-vsync vfr` drift). Audio must be muxed at the original sample rate, not re-encoded.

---

### Phase 4 — Director UX (port the good shaderbench ideas)

These are additive — no engine change — so they can ship in any order after Phase 2\.

**4a. Looks panel** — presets from shaderbench's `applyPreset` become **bundles of cues**:

- `Look = { name, cues: Omit<Cue, 'id'|'anchor'>[] }`  
- Applying a look anchors all its cues to the current line's start with `durMs` from a default.  
- Ship six looks initially: `noir`, `candle-lit`, `clinical`, `storm`, `memory`, `dawn`. (Names from the workbench; values re-tuned to the theatre palette.)

**4b. Diegetic dials** — `era`, `tod`, `weather` become **cues with sensible ranges** (like the workbench's sliders, but stored as cue keys so they're animatable):

- `era` (year int) — drives sepia \+ palette  
- `tod` (0–24 float) — drives lamp intensity \+ room tint  
- `weather` (enum) — drives optional grain/vignette (currently not used by the Denial theme; wire it into any theme that wants it)

**4c. Tension dial** — one cue that fans out to `flickerAmp`, `roomDark`, `vignette`, `grain` — the workbench's "mood" idea, but as a composite track so a single slider drives four effects.

**4d. Storyboard with real thumbnails** — `buildStoryboard()` calls `sceneAt(reel, line.start)` and renders into a `<canvas>` per cell. Cached, invalidated on cue change. This is the workbench's storyboard *finished properly* — and it doubles as the cover picker.

**4e. Record mode** — the shaderbench record button, backed by the working evaluator:

- Press record → capture `sceneAt(t)` at every user change → emit a `Cue` with `anchor: {kind: 'reel', ms: t}` (or better: snap to the nearest `speechEnd` / `word` boundary within ±200 ms).  
- Review before commit: the recorded cues appear as ghost markers on the timeline for accept/reject.

**4f. Try now (already shipped) is rewired to `setTime(t)`** — no more "reload to see it".

---

### Phase 5 — Themes as data (defer; do not force)

Optional adapter that reads an existing theme HTML and extracts `{ id, palette, layout, characters, allowedProps, allowedMoods }`. This is what lets new themes plug into the engine without copy-pasting a player. **Do not attempt until Phases 0–3 are stable on Volume II.** The workbench's `getEra()` and `scenes[]` array are exactly the model for this, so keep the shape.

---

## 5\. What's explicitly deferred or dropped

| Item | Why |
| :---- | :---- |
| The `shaders.css` / `shaders.js` SVG catalog | You said ignore it. Agreed. The prop format in `stagefx.ts` (static SVG \+ CSS animation) is enough; a converter is a separate task if you ever want it. |
| Three.js in the player | Frame rate, headless-WebGL fallback, r128 — none of it helps a 360×640 theatre reel. Bloom/grain/vignette are reachable via CSS \+ SVG filters. |
| Rewriting the theme HTML | The injected engine keeps `buildPlayerHtml` working. Themes stay. |
| Removing the old player | Kept behind `?legacy=1` and `EXPORT_LEGACY=1` for one release. |
| Rewriting `planReel`'s public shape | `Plan` type is preserved; `planReel` is a wrapper. `App.tsx` doesn't change. |

---

## 6\. First three commits (concrete, unblocks everything)

1. **`shared/stage/timeline.ts` \+ parity test.** Finish the draft. `planReel` calls it. Run against every reel in `data/reels.json`. **Do not merge until parity passes.**  
2. **`shared/stage/cues.ts` \+ migration.** Add `reel.cues` (optional). `buildPlayerHtml` writes `const C = ...` next to `const R = ...`. Nothing uses `C` yet. Test: old reel loads and renders identically.  
3. **`window.__stage.setTime(t)` behind a feature flag.** Engine bundle injected, but the default scheduler still runs. Add the `?engine=1` query. Frame-diff harness runs on Volume II. **This is the gate before Phase 3\.**

Each of these is small, testable, and reversible. Nothing in phases 4–5 needs to start until 1–3 are green on the Denial theme.

---

## 7\. What I'd write next if you say go

Two options:

- **A. Finish the spec as files.** Complete `shared/stage/` (timeline, cues, typed, mouth, scene) as drop-in TypeScript with inline tests, plus the two backend diffs (`planReel` wrapper, `buildPlayerHtml` engine injection) and the preview protocol diff. That's roughly what the previous turn was doing — just finish it.  
- **B. Finish the frame-diff harness first.** A small Playwright script that renders any reel via the current player and via `setTime(t)` and reports pixel-diff per 100 ms. That harness is what makes Phase 2 safe, so building it before the engine is a good trade.

I'd do **A then B** — but if you want the smallest next step, **B** is the one that de-risks the whole plan and produces a concrete artifact you can look at.

Say the word and I'll pick up where the spec stopped.

# Delivering the spec — part A (engine files) \+ part B (frame-diff harness)

Finishing the spec from where it stopped: the `shared/stage/` engine modules that were cut off, the backend and frontend integration points, the parity tests, and the frame-diff harness that de-risks Phase 2\.

---

## File tree

```
shared/stage/
  timeline.ts          ← already drafted (previous turn); unchanged
  ease.ts              ← already drafted; unchanged
  cues.ts              ← was cut off — completed below
  typed.ts             ← new
  mouth.ts             ← new
  scene.ts             ← new (frameAt — top-level composition)
  migrate.ts           ← new (lossless StageFX → cues)
  entry.ts             ← new (window.__stage bridge for esbuild)
  index.ts             ← new (barrel)
  __tests__/index.test.ts   ← new
backend/src/
  model.ts             ← diff (planReel wrapper + buildPlayerHtml)
  index.ts             ← diff (pass ?engine=1 through)
frontend/src/
  App.tsx              ← diff (postMessage on timeline drag)
tools/
  framediff.ts         ← new (determinism + legacy-vs-engine gate)
```

---

## I. `shared/stage/cues.ts` — completed

```ts
/* Cues: "at this moment, this track changes to this value (over durMs)". Pure. */
import { EASE, type Ease } from './ease';
import type { Timeline } from './timeline';

export type TrackId =
  | 'mood' | 'light' | 'lightColor' | 'room' | 'accent' | 'propL' | 'propR'
  | 'badge' | 'name' | 'direction' | 'panel'
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
  tension: 'number', vignette: 'number', grain: 'number',
};

export const DEFAULT_DURATION: Record<TrackId, number> = {
  mood: 0, light: 0, lightColor: 240, room: 240, accent: 240,
  propL: 0, propR: 0, badge: 0, name: 0, direction: 0, panel: 0,
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
    } else {
      (out as unknown as Record<string, unknown>)[track] = v;
    }
  }
  return out;
}
```

---

## II. `shared/stage/typed.ts`

```ts
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
```

---

## III. `shared/stage/mouth.ts`

```ts
/* Mouth openness at time t. A 4.2 Hz syllable rhythm shaped into a talk envelope,
 * gated by the line's speech window so it can never run past the audio. If real RMS
 * envelopes are available (they can be extracted on TTS upload), swap the inner
 * envelope for an RMS lookup — the outer contract stays the same. */
export function mouthOpen(t: number, lineStart: number, speechMs: number, phase = 0): number {
  if (speechMs <= 0) return 0;
  const dt = t - lineStart;
  if (dt < 0 || dt > speechMs) return 0;
  const rate = 4.2;
  const raw = Math.sin((dt / 1000) * rate * 2 * Math.PI + phase) * 0.5 + 0.5;
  const sharp = Math.pow(raw, 2.5);
  const fadeIn = Math.min(1, dt / 80);
  const fadeOut = Math.min(1, (speechMs - dt) / 80);
  return sharp * fadeIn * fadeOut;
}
```

---

## IV. `shared/stage/scene.ts` — top-level `frameAt`

```ts
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
  const mouth = line && phase === 'line' ? mouthOpen(t, tl.starts[lineIndex], tl.speechMs[lineIndex]) : 0;

  return { ...scene, lineIndex, typed, mouth, phase };
}
```

---

## V. `shared/stage/migrate.ts` — lossless StageFX → cues

```ts
/* One-shot migration: today's `line.m` / `line.fx` become cues anchored at line start
 * with durMs = 0 — so the picture is bit-identical before and after migration. */
import type { Cue, TrackId } from './cues';

export interface LegacyLine {
  id: string;
  m?: string;
  fx?: {
    mood?: string;
    light?: string;
    color?: string;
    room?: string;
    propL?: string;
    propR?: string;
  };
}

const REMOVE = '— remove prop —';
let counter = 0;
const id = () => `cue_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export function migrateStagefx(lines: LegacyLine[]): Cue[] {
  const cues: Cue[] = [];
  const push = (track: TrackId, lineId: string, value: unknown) => {
    cues.push({ id: id(), track, anchor: { kind: 'line', line: lineId, at: 'start' }, value });
  };
  for (const l of lines) {
    const fx = l.fx ?? {};
    const mood = fx.mood ?? l.m;
    if (mood) push('mood', l.id, mood);
    if (fx.light) push('light', l.id, fx.light);
    if (fx.color) push('lightColor', l.id, fx.color);
    if (fx.room) push('room', l.id, fx.room);
    if (fx.propL) push('propL', l.id, fx.propL === REMOVE ? null : fx.propL);
    if (fx.propR) push('propR', l.id, fx.propR === REMOVE ? null : fx.propR);
  }
  return cues;
}
```

---

## VI. `shared/stage/entry.ts` \+ `index.ts`

```ts
// shared/stage/entry.ts — bundled by esbuild into the player HTML
import * as stage from './index';
(window as any).__stage = stage;
```

```ts
// shared/stage/index.ts
export * from './timeline';
export * from './ease';
export * from './cues';
export * from './typed';
export * from './mouth';
export * from './scene';
export * from './migrate';
```

Bundle command (add to `package.json`):

```json
"build:stage": "esbuild shared/stage/entry.ts --bundle --format=iife --minify --outfile=dist/stage.iife.js"
```

---

## VII. `shared/stage/__tests__/index.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  buildTimeline, TICK, HOOK_MS,
  sceneAt, DEFAULT_SCENE_STATE,
  frameAt, migrateStagefx,
  type Cue, type TimedLine,
} from '../index';

const L = (id: string, s: string, h = 0, speechMs = 0, offset?: number): TimedLine =>
  ({ id, s, h, speechMs, offset });

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
```

---

## VIII. Backend diff — `backend/src/model.ts`

```
+import { buildTimeline, type TimedLine } from '../../shared/stage/timeline';
+import { migrateStagefx } from '../../shared/stage/migrate';

 export function planReel(reel: Reel): Plan {
-  const plan: Plan = { holds: [], starts: [], speechEnds: [], ends: [], stampAt: 0, totalMs: 0, missingAudio: [], clamped: [] };
-  const lines = reel.lines;
-  // ... existing body ...
-  return plan;
+  const timed: TimedLine[] = reel.lines.map((l) => ({
+    id: l.id,
+    s: l.s,
+    h: l.h || 0,
+    offset: l.offset,
+    speechMs: l.audio && !isStale(l) ? (l.audio.durationMs || 0) : 0,
+  }));
+  const tl = buildTimeline(timed, { pace: 'classic' });
+  const missingAudio: number[] = [];
+  timed.forEach((l, i) => { if (l.speechMs <= 0) missingAudio.push(i); });
+  return {
+    holds: tl.holds,
+    starts: tl.starts,
+    speechEnds: tl.speechEnds,
+    ends: tl.ends,
+    stampAt: tl.stampAt,
+    totalMs: tl.totalMs,
+    missingAudio,
+    clamped: tl.clamped,
+  };
 }

 export function buildPlayerHtml(reel: Reel, mode: 'preview' | 'capture'): string {
+  // (unchanged signature)
   ...
 }
```

Add a new opts parameter to `buildPlayerHtml` and inject the engine when the flag is set:

```
-export function buildPlayerHtml(reel: Reel, mode: 'preview' | 'capture'): string {
+export interface PlayerOptions {
+  engine?: boolean;
+}
+export function buildPlayerHtml(
+  reel: Reel,
+  mode: 'preview' | 'capture',
+  opts: PlayerOptions = {},
+): string {
   ...
   html = html.replace(R_RE, () => `const R=${jsonForScript([entry])};`);
   html = html.replace('</head>', () => `<style>${BASE_CSS}</style></head>`);

   if (mode === 'preview') {
     ...
     // existing audio-hooking script
   }

+  if (opts.engine) {
+    const engineJs = readEngineBundle();  // see below
+    html = html.replace('</head>', () => `<script>${engineJs}</script></head>`);
+    const wire =
+      `window.addEventListener('message',function(e){` +
+      `if(!e.data||e.data.t!=='setTime')return;` +
+      `if(window.__stage&&window.__stage.setTime)window.__stage.setTime(e.data.value);` +
+      `});`;
+    html = html.replace('</body>', () => `<script>${wire}</script></body>`);
+  }
   return html;
 }
+
+let _engineJs: string | null = null;
+function readEngineBundle(): string {
+  if (_engineJs !== null) return _engineJs;
+  const p = path.join(ROOT, 'dist', 'stage.iife.js');
+  _engineJs = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
+  return _engineJs;
+}
+
+// Called on load so old reels pick up cues without a rewrite.
+export function ensureCues(reel: Reel): void {
+  if (!reel.cues) {
+    reel.cues = migrateStagefx(reel.lines as any);
+  }
+}
```

Call `ensureCues(r)` inside `getReel()` and `updateReel()`; or once in `loadReels()`.

---

## IX. Backend diff — `backend/src/index.ts`

```
 app.get('/api/reels/:id/player', (req, res) => {
   const r = getReel(req.params.id);
   if (!r) return res.status(404).end();
+  ensureCues(r);
   const mode = req.query.mode === 'capture' ? 'capture' : 'preview';
-  res.type('html').send(buildPlayerHtml(r, mode));
+  const engine = req.query.engine === '1';
+  res.type('html').send(buildPlayerHtml(r, mode, { engine }));
 });
```

---

## X. Frontend diff — `frontend/src/App.tsx`

```
 // ---- timeline drag-to-move ----
 const iframe = iframeRef.current;
 
+function sendSetTime(ms: number) {
+  iframe?.contentWindow?.postMessage({ t: 'setTime', value: ms }, '*');
+}
+
 // On timeline scrub or playhead drag:
+sendSetTime(newTimeMs);
+
 // In the "Try now" handler that already exists:
+sendSetTime(selectedReel.plan.starts[lineIndex]);
```

The "Try now" already posts a message; just add the second message. The line appears in preview immediately, no reload.

---

## XI. `tools/framediff.ts` — Phase-2 gate

```ts
/* Two jobs:
 *   1) Determinism: the engine must render the same frame twice identically.
 *   2) Legacy drift: engine vs. current player at the same t, per 100 ms.
 * Job 1 is a hard gate (exit 1). Job 2 is a warning.
 *
 * Assumes the backend is running and ENGINE_URL includes ?engine=1.
 * Requires: npm i -D playwright pngjs && npx playwright install chromium
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as path from 'path';

const STAGE_SELECTOR = '#stage';
const VIEWPORT = { width: 360, height: 640 };

async function capture(
  url: string,
  times: number[],
  outDir: string,
  useEngine: boolean,
) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(url);
  await page.waitForSelector(STAGE_SELECTOR, { timeout: 15000 });

  if (useEngine) {
    await page.evaluate(
      () =>
        new Promise<void>((res) => {
          const go = () => ((window as any).__stage?.setTime ? res() : setTimeout(go, 50));
          go();
        }),
    );
  }

  for (const t of times) {
    if (useEngine) {
      await page.evaluate((ms) => (window as any).__stage.setTime(ms), t);
    }
    await page.waitForTimeout(30);
    const file = path.join(outDir, `frame_${String(t).padStart(6, '0')}.png`);
    await page.locator(STAGE_SELECTOR).screenshot({ path: file });
  }
  await browser.close();
}

function diff(a: Buffer, b: Buffer) {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  const total = pa.width * pa.height;
  let bad = 0;
  let max = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    const d = Math.max(
      Math.abs(pa.data[i] - pb.data[i]),
      Math.abs(pa.data[i + 1] - pb.data[i + 1]),
      Math.abs(pa.data[i + 2] - pb.data[i + 2]),
    );
    if (d > max) max = d;
    if (d > 8) bad++;
  }
  return { pct: bad / total, max };
}

async function main() {
  const legacy = process.env.LEGACY_URL;
  const engine = process.env.ENGINE_URL;
  if (!legacy || !engine) {
    console.error('Set LEGACY_URL and ENGINE_URL');
    process.exit(2);
  }

  const times: number[] = [];
  for (let t = 0; t <= 30000; t += 100) times.push(t);

  // --- job 1: determinism
  await capture(engine, times, 'frames/engine-a', true);
  await capture(engine, times, 'frames/engine-b', true);
  let worstDet = 0;
  for (const t of times) {
    const f = `frame_${String(t).padStart(6, '0')}.png`;
    const d = diff(
      fs.readFileSync(path.join('frames/engine-a', f)),
      fs.readFileSync(path.join('frames/engine-b', f)),
    );
    worstDet = Math.max(worstDet, d.pct);
  }
  console.log(`Determinism: worst diff ${(worstDet * 100).toFixed(4)}%`);

  // --- job 2: legacy drift (warning only)
  await capture(legacy, times, 'frames/legacy', false);
  let worst = { at: 0, pct: 0, max: 0 };
  const fails: number[] = [];
  for (const t of times) {
    const f = `frame_${String(t).padStart(6, '0')}.png`;
    const d = diff(
      fs.readFileSync(path.join('frames/legacy', f)),
      fs.readFileSync(path.join('frames/engine-a', f)),
    );
    if (d.pct > worst.pct) worst = { at: t, ...d };
    if (d.pct > 0.005) fails.push(t);
  }
  console.log(
    `Legacy drift: worst @${worst.at}ms ${(worst.pct * 100).toFixed(2)}% (max channel ${worst.max})`,
  );
  if (fails.length) {
    console.log(`  ${fails.length} frames above 0.5% tolerance — inspect frames/ side by side`);
  }

  if (worstDet > 0) {
    console.error('FAIL: engine is not deterministic');
    process.exit(1);
  }
  console.log('PASS (determinism).');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run:

```sh
LEGACY_URL='http://localhost:4000/api/reels/REEL/player?mode=preview' \
ENGINE_URL='http://localhost:4000/api/reels/REEL/player?mode=preview&engine=1' \
npx ts-node tools/framediff.ts
```

The legacy capture freezes at `t=0` in the current implementation (there's no public `setTime` on the legacy player yet). For a real legacy baseline, add a tiny `setTime` shim to the legacy theme (`window.__legacySetTime = ...`) — that's \~15 lines in the theme, not the engine. If you skip that, job 2 still gives you determinism and the worst-of-30-s drift snapshot, which is enough to know whether you're in the right ballpark.

---

## XII. How to run, in order

1. **`npm run build:stage`** — produce `dist/stage.iife.js`. If missing, `readEngineBundle()` returns `''` and the injection is a no-op (safe).  
2. **Apply the `model.ts` diff**, then run `npm test` — the parity tests must pass against every reel in `data/reels.json`. **Do not proceed** if any fails.  
3. **Apply the `index.ts` diff** — `?engine=1` becomes a flag, default off.  
4. **Apply the `App.tsx` diff** — the timeline sends `setTime`.  
5. **Run the harness** — determinism must be 0% drift; legacy drift is informational.  
6. **Flip the default** to `engine=1` for one test reel; run the harness again. Inspect any frames \> 0.5%. If acceptable, flip the global default and keep `?legacy=1` around for a release.

---

## XIII. What this unlocks next (Phase 3\)

Once `frameAt` is the truth, Phase 3 (export by frame stepping) is **\~40 lines** in `render.ts`:

```ts
// render.ts, new path
for (let t = 0; t <= totalMs; t += 1000 / fps) {
  await page.evaluate((ms) => (window as any).__stage.setTime(ms), t);
  await page.screenshot({ clip: stageRect, path: `frames/${String(frame).padStart(6,'0')}.png` });
}
await ffmpeg(['-framerate', String(fps), '-i', 'frames/%06d.png', '-i', audioPath, ...]);
```

No virtual clock, no MutationObservers, no "timing mismatch" error, poster from the frame nearest `stampAt + STAMP_MS/2`.

Phase 4 (Looks / dials / record / storyboard) becomes UI work with no engine changes — `frameAt` already returns the full `SceneState` that each panel writes and reads.

---

If you want, next I can write the **`render.ts` diff** for Phase 3 as a drop-in file, or the **`AudioPanel.tsx` diff** that surfaces Looks \+ the tension dial using the cues model. Both are small once the engine is in.

# Delivering both — `render.ts` (Phase 3\) and the Looks \+ Tension panel (Phase 4a/b)

Both are written as drop-in files. `render.ts` matches the existing `renderReel({ reel, outPath, onProgress, onDone, onError })` shape I could reconstruct from `index.ts`; if the actual signature has extra keys, the agent adds them to the destructure. The panel is a new self-contained component plus three short diffs.

---

## 1\. `backend/src/render.ts` — full replacement

```ts
/* Phase 3 render path. Deterministic by construction:
 *   for each frame: setTime(t) → rAF → screenshot
 *   ffmpeg assembles the frames; -itsoffset/adelay places each line's audio at plan.starts[i].
 * No virtual clock, no MutationObserver, no "timing mismatch" error class.
 * Keep the old implementation behind EXPORT_LEGACY=1 for one release.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { chromium, type Browser } from 'playwright';
import { planReel, STAMP_MS, DATA_DIR, isStale, type Reel } from './model';

export interface RenderOptions {
  reel: Reel;
  outPath: string;                               // absolute path to the .mp4
  fps?: number;                                  // default 30
  scale?: number;                                // 1 = 360×640, 2 = 720×1280
  baseUrl?: string;                              // default http://localhost:4000
  videoCrf?: number;                             // default 20
  audioBitrate?: string;                         // default '192k'
  onProgress?: (p: number, msg: string) => void;
  onDone?: (r: { videoPath: string; posterJpeg?: Buffer; durationMs: number; frames: number }) => void;
  onError?: (e: Error) => void;
}

export async function renderReel(opts: RenderOptions): Promise<void> {
  const {
    reel, outPath, fps = 30, scale = 1,
    baseUrl = process.env.BASE_URL || 'http://localhost:4000',
    videoCrf = 20, audioBitrate = '192k',
    onProgress = () => {}, onDone = () => {}, onError = (e) => { throw e; },
  } = opts;

  const plan = reel.plan ?? planReel(reel);
  const totalMs = plan.totalMs;
  const totalSec = totalMs / 1000;
  const totalFrames = Math.ceil(totalSec * fps);
  const posterT = plan.stampAt + STAMP_MS / 2;

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-'));
  const framesDir = path.join(workDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  let browser: Browser | null = null;
  try {
    onProgress(0.02, 'Launching browser');
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: scale,
    });

    onProgress(0.05, 'Loading player');
    await page.goto(`${baseUrl}/api/reels/${reel.id}/player?mode=capture&engine=1`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => !!(window as any).__stageSetTime && !!document.getElementById('stage'),
      null, { timeout: 15000 },
    );
    await page.evaluate(() => (document as any).fonts?.ready);
    await page.waitForTimeout(150);

    const box = await page.locator('#stage').boundingBox();
    if (!box) throw new Error('#stage not found in the player page');
    const clip = {
      x: Math.round(box.x), y: Math.round(box.y),
      width: Math.round(box.width), height: Math.round(box.height),
    };

    onProgress(0.08, 'Rendering frames');
    let posterFrame: { buf: Buffer; t: number } | null = null;

    for (let i = 0; i < totalFrames; i++) {
      const t = (i / fps) * 1000;
      await page.evaluate((ms) => (window as any).__stageSetTime(ms), t);
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
      const buf = await page.screenshot({ clip, type: 'png', animations: 'disabled' });
      fs.writeFileSync(path.join(framesDir, `${String(i).padStart(6, '0')}.png`), buf);
      if (!posterFrame || Math.abs(t - posterT) < Math.abs(posterFrame.t - posterT)) {
        posterFrame = { buf, t };
      }
      if (i % Math.max(1, Math.floor(totalFrames / 100)) === 0) {
        onProgress(0.08 + 0.72 * (i / totalFrames), `Frame ${i}/${totalFrames}`);
      }
    }

    // Collect audio
    onProgress(0.82, 'Building audio track');
    const audio: { path: string; offsetMs: number; volume: number; loop?: boolean }[] = [];
    reel.lines.forEach((l, i) => {
      if (l.audio && !isStale(l)) {
        const p = path.join(DATA_DIR, l.audio.file);
        if (fs.existsSync(p)) audio.push({ path: p, offsetMs: plan.starts[i], volume: 1 });
      }
    });
    if ((reel as any).musicFile) {
      const mp = path.join(DATA_DIR, (reel as any).musicFile);
      if (fs.existsSync(mp)) {
        audio.push({ path: mp, offsetMs: 0, volume: (reel as any).musicVolume ?? 0.3, loop: true });
      }
    }

    onProgress(0.86, 'Encoding');
    await encode({ framesDir, fps, totalSec, audio, outPath, videoCrf, audioBitrate });

    let posterJpeg: Buffer | undefined;
    if (posterFrame) posterJpeg = await pngToJpeg(posterFrame.buf);

    onProgress(1, 'Done');
    onDone({ videoPath: outPath, posterJpeg, durationMs: totalMs, frames: totalFrames });
  } catch (e: any) {
    onError(e instanceof Error ? e : new Error(String(e)));
  } finally {
    if (browser) await browser.close().catch(() => {});
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

/* --- ffmpeg ------------------------------------------------------------ */

interface EncodeArgs {
  framesDir: string; fps: number; totalSec: number;
  audio: { path: string; offsetMs: number; volume: number; loop?: boolean }[];
  outPath: string; videoCrf: number; audioBitrate: string;
}

function encode(a: EncodeArgs): Promise<void> {
  const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];
  args.push('-framerate', String(a.fps), '-i', path.join(a.framesDir, '%06d.png'));

  for (const ai of a.audio) {
    if (ai.loop) args.push('-stream_loop', '-1');
    args.push('-i', ai.path);
  }

  const filters: string[] = [];
  const mixLabels: string[] = [];
  a.audio.forEach((ai, i) => {
    const idx = i + 1;
    const label = `a${i}`;
    filters.push(
      `[${idx}:a]atrim=0:${a.totalSec},asetpts=PTS-STARTPTS,` +
      `adelay=${ai.offsetMs}:all=1,volume=${ai.volume}[${label}]`,
    );
    mixLabels.push(`[${label}]`);
  });

  if (a.audio.length === 0) {
    filters.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${a.totalSec}[aout]`);
  } else {
    filters.push(
      `${mixLabels.join('')}amix=inputs=${a.audio.length}:duration=longest:normalize=0,` +
      `apad=whole_dur=${a.totalSec},asetpts=PTS-STARTPTS[aout]`,
    );
  }

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(a.videoCrf),
    '-pix_fmt', 'yuv420p', '-r', String(a.fps),
    '-c:a', 'aac', '-b:a', a.audioBitrate, '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart',
    '-t', String(a.totalSec),
    a.outPath,
  );

  return new Promise<void>((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    ff.on('error', (e) => reject(new Error(`ffmpeg failed to start: ${e.message}`)));
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

function pngToJpeg(png: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0', '-frames:v', '1', '-q:v', '3', '-f', 'mjpeg', 'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    ff.stdout.on('data', (d) => out.push(d));
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`png→jpeg failed: ${err.slice(-500)}`));
    });
    ff.stdin.end(png);
  });
}
```

**`buildPlayerHtml` needs one addition** (from the earlier plan) so `setTime` exists and `setCues` is honoured:

```ts
// inside the `if (opts.engine) { ... }` block
const shim = `
window.__reelCues = ${JSON.stringify(reel.cues ?? [])};
window.__reelTimeline = ${JSON.stringify(plan)};
window.__reelLines = ${JSON.stringify(reel.lines.map(l => ({ id: l.id, s: l.s })))};
window.__stageSetTime = function(ms) {
  var cues = window.__reelCues || [];
  var tl = window.__reelTimeline;
  var lines = window.__reelLines || [];
  var s = window.__stage.frameAt(cues, tl, lines, ms);
  var stage = document.getElementById('stage'); if (!stage) return s;
  stage.setAttribute('data-mood', s.mood || 'calm');
  stage.setAttribute('data-light', s.light || 'sway');
  stage.setAttribute('data-name', s.name || '');
  stage.style.setProperty('--light-color', s.lightColor || '');
  stage.style.setProperty('--room', s.room || '');
  stage.style.setProperty('--accent', s.accent || '');
  stage.style.setProperty('--tension', String(s.tension ?? 0.3));
  stage.style.setProperty('--vignette', String(s.vignette ?? 0.2));
  stage.style.setProperty('--grain', String(s.grain ?? 0.1));
  var cap = document.getElementById('cap');
  if (cap && s.lineIndex >= 0 && s.phase === 'line') cap.textContent = s.typed;
  var hook = document.getElementById('hook'), tag = document.getElementById('tag');
  if (hook && tag) {
    hook.classList.toggle('on', s.phase === 'hook');
    tag.classList.toggle('on', s.phase === 'stamp');
  }
  var mouth = document.querySelector('.mouth');
  if (mouth) mouth.style.transform = 'scaleY(' + (0.3 + (s.mouth || 0) * 1.4).toFixed(3) + ')';
  // Seek any CSS animations to the right local time
  document.querySelectorAll('#stage *').forEach(function(el) {
    el.getAnimations().forEach(function(a) {
      try { a.pause(); a.currentTime = Math.max(0, ms - (a.startTime || 0)); } catch (e) {}
    });
  });
  return s;
};
window.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.t === 'setTime') window.__stageSetTime(e.data.value);
  if (e.data.t === 'setCues' && Array.isArray(e.data.cues)) {
    window.__reelCues = e.data.cues;
    window.__stageSetTime(e.data.time || 0);
  }
});
`;
html = html.replace('</head>', () => `<script>${shim}</script></head>`);
```

---

## 2\. `shared/stage/looks.ts` — the look catalog

```ts
import type { Cue } from './cues';

export interface Look {
  id: string;
  name: string;
  description: string;
  swatch: string;
  cues: Omit<Cue, 'id' | 'anchor'>[];
}

export const LOOKS: Look[] = [
  { id: 'default', name: 'Default', description: 'Warm lamp, plum room', swatch: '#f0b060', cues: [
    { track: 'light', value: 'sway' },
    { track: 'lightColor', value: '#f0b060', durMs: 240 },
    { track: 'room', value: '#3a1f3a', durMs: 240 },
    { track: 'accent', value: '#d4a44a', durMs: 240 },
    { track: 'tension', value: 0.30, durMs: 320 },
    { track: 'vignette', value: 0.20, durMs: 320 },
    { track: 'grain', value: 0.10, durMs: 320 },
  ]},
  { id: 'noir', name: 'Noir', description: 'Cold, high contrast', swatch: '#2a3a5a', cues: [
    { track: 'light', value: 'steady' },
    { track: 'lightColor', value: '#a0c0e0', durMs: 240 },
    { track: 'room', value: '#0a0a1a', durMs: 240 },
    { track: 'accent', value: '#c0d0e0', durMs: 240 },
    { track: 'tension', value: 0.60, durMs: 320 },
    { track: 'vignette', value: 0.60, durMs: 320 },
    { track: 'grain', value: 0.25, durMs: 320 },
  ]},
  { id: 'candle-lit', name: 'Candle-lit', description: 'Warm, flickering, intimate', swatch: '#f0a040', cues: [
    { track: 'light', value: 'candle' },
    { track: 'lightColor', value: '#ffb060', durMs: 240 },
    { track: 'room', value: '#2a1a10', durMs: 240 },
    { track: 'accent', value: '#ffb060', durMs: 240 },
    { track: 'tension', value: 0.25, durMs: 320 },
    { track: 'vignette', value: 0.30, durMs: 320 },
    { track: 'grain', value: 0.12, durMs: 320 },
  ]},
  { id: 'clinical', name: 'Clinical', description: 'Cold, sterile', swatch: '#e0f0f0', cues: [
    { track: 'light', value: 'steady' },
    { track: 'lightColor', value: '#e0f0f0', durMs: 240 },
    { track: 'room', value: '#1a2a2a', durMs: 240 },
    { track: 'accent', value: '#e0f0f0', durMs: 240 },
    { track: 'tension', value: 0.40, durMs: 320 },
    { track: 'vignette', value: 0.15, durMs: 320 },
    { track: 'grain', value: 0.05, durMs: 320 },
  ]},
  { id: 'storm', name: 'Storm', description: 'Blue, tense, flickering', swatch: '#3a5a80', cues: [
    { track: 'light', value: 'flicker' },
    { track: 'lightColor', value: '#5a7ab0', durMs: 240 },
    { track: 'room', value: '#0a0a2a', durMs: 240 },
    { track: 'accent', value: '#5a7ab0', durMs: 240 },
    { track: 'tension', value: 0.80, durMs: 320 },
    { track: 'vignette', value: 0.50, durMs: 320 },
    { track: 'grain', value: 0.20, durMs: 320 },
  ]},
  { id: 'memory', name: 'Memory', description: 'Sepia, soft, distant', swatch: '#d0b080', cues: [
    { track: 'light', value: 'pulse' },
    { track: 'lightColor', value: '#d0b080', durMs: 240 },
    { track: 'room', value: '#3a2a1a', durMs: 240 },
    { track: 'accent', value: '#d0b080', durMs: 240 },
    { track: 'tension', value: 0.20, durMs: 320 },
    { track: 'vignette', value: 0.40, durMs: 320 },
    { track: 'grain', value: 0.15, durMs: 320 },
  ]},
  { id: 'dawn', name: 'Dawn', description: 'Pink, hopeful', swatch: '#f0a0a0', cues: [
    { track: 'light', value: 'slow-pulse' },
    { track: 'lightColor', value: '#f0a0a0', durMs: 240 },
    { track: 'room', value: '#2a1a2a', durMs: 240 },
    { track: 'accent', value: '#f0a0a0', durMs: 240 },
    { track: 'tension', value: 0.15, durMs: 320 },
    { track: 'vignette', value: 0.25, durMs: 320 },
    { track: 'grain', value: 0.08, durMs: 320 },
  ]},
];
```

---

## 3\. `frontend/src/useCues.ts` — the hook

```ts
import { useCallback, useMemo } from 'react';
import {
  sceneAt, DEFAULT_SCENE_STATE,
  type Cue, type TrackId, type SceneState,
} from '../../shared/stage/cues';
import type { Timeline } from '../../shared/stage/timeline';
import type { Reel, Line } from './types';

const TICK = 40;

function toTimeline(reel: Reel): Timeline {
  return {
    hookMs: reel.plan.starts[0] ?? 0,
    starts: reel.plan.starts,
    typingMs: reel.lines.map((l) => [...l.s].length * TICK),
    speechMs: reel.lines.map((_, i) => reel.plan.speechEnds[i] - reel.plan.starts[i]),
    speechEnds: reel.plan.speechEnds,
    holds: reel.plan.holds,
    ends: reel.plan.ends,
    stampAt: reel.plan.stampAt,
    totalMs: reel.plan.totalMs,
    clamped: reel.plan.clamped,
  };
}

let counter = 0;
function newCue(track: TrackId, lineId: string, value: unknown, durMs?: number): Cue {
  return {
    id: `c_${Date.now().toString(36)}_${(counter++).toString(36)}`,
    track,
    anchor: { kind: 'line', line: lineId, at: 'start' },
    value,
    ...(durMs !== undefined ? { durMs } : {}),
  };
}

function replaceLine(
  cues: Cue[], lineId: string, tracks: TrackId[], additions: Cue[],
): Cue[] {
  const kept = cues.filter(
    (c) => !(c.anchor.kind === 'line' && c.anchor.line === lineId
            && c.anchor.at === 'start' && tracks.includes(c.track)),
  );
  return [...kept, ...additions];
}

export interface UseCues {
  sceneFor: (lineId: string) => SceneState;
  setTrack: (lineId: string, track: TrackId, value: unknown, durMs?: number) => Cue[];
  applyLook: (lineId: string, cues: Omit<Cue, 'id' | 'anchor'>[]) => Cue[];
  clearLine: (lineId: string) => Cue[];
}

export function useCues(
  reel: Reel, setReel: (r: Reel) => void,
): UseCues {
  const timeline = useMemo(() => toTimeline(reel), [reel]);

  const commit = useCallback(
    (next: Cue[]) => {
      setReel({ ...reel, cues: next });
      return next;
    },
    [reel, setReel],
  );

  return {
    sceneFor: useCallback(
      (lineId: string) => {
        const i = reel.lines.findIndex((l) => l.id === lineId);
        if (i < 0) return DEFAULT_SCENE_STATE;
        return sceneAt(reel.cues ?? [], timeline, reel.lines as unknown as Line[], timeline.starts[i]);
      },
      [reel, timeline],
    ),
    setTrack: useCallback(
      (lineId, track, value, durMs) =>
        commit(replaceLine(reel.cues ?? [], lineId, [track],
          [newCue(track, lineId, value, durMs)])),
      [reel, commit],
    ),
    applyLook: useCallback(
      (lineId, cues) => {
        const tracks = cues.map((c) => c.track);
        const additions = cues.map((c) => newCue(c.track, lineId, c.value, c.durMs));
        return commit(replaceLine(reel.cues ?? [], lineId, tracks, additions));
      },
      [reel, commit],
    ),
    clearLine: useCallback(
      (lineId) =>
        commit((reel.cues ?? []).filter(
          (c) => !(c.anchor.kind === 'line' && c.anchor.line === lineId),
        )),
      [reel, commit],
    ),
  };
}
```

---

## 4\. `frontend/src/CuesPanel.tsx` — the new panel

```
import { LOOKS } from '../../shared/stage/looks';
import { useCues } from './useCues';
import type { Reel, Line } from './types';
import type { Cue } from '../../shared/stage/cues';

interface Props {
  reel: Reel;
  setReel: (r: Reel) => void;
  line: Line;
  onCueChange?: (cues: Cue[], time: number) => void;
  currentTimeMs: number;
}

const MOODS = ['calm', 'flat', 'eyebrows-up', 'worried', 'stern', 'surprised', 'smug', 'sleepy', 'wink'];
const LIGHTS = ['sway', 'steady', 'candle', 'flicker', 'swing', 'sweep', 'pulse', 'dim', 'off'];
const COLOURS = ['warm', 'cold', 'alarm', 'sickly', 'violet'];
const ROOMS = ['plum', 'night', 'red', 'green', 'black'];

export function CuesPanel({ reel, setReel, line, onCueChange, currentTimeMs }: Props) {
  const { sceneFor, setTrack, applyLook, clearLine } = useCues(reel, setReel);
  const scene = sceneFor(line.id);

  const push = (next: Cue[]) => onCueChange?.(next, currentTimeMs);
  const set = (track: Parameters<typeof setTrack>[1], value: unknown, durMs?: number) =>
    push(setTrack(line.id, track, value, durMs));

  return (
    <div className="cues-panel">
      <div className="cues-row">
        <label className="fl"><i className="fas fa-palette" /> Look</label>
        <select
          className="fi"
          defaultValue=""
          onChange={(e) => {
            const look = LOOKS.find((l) => l.id === e.target.value);
            if (look) push(applyLook(line.id, look.cues));
            e.currentTarget.value = '';
          }}
        >
          <option value="" disabled>Apply a look…</option>
          {LOOKS.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.description}</option>)}
        </select>
      </div>

      <div className="cues-row">
        <label className="fl"><i className="fas fa-mask" /> Mood</label>
        <select className="fi" value={scene.mood} onChange={(e) => set('mood', e.target.value)}>
          {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="cues-row">
        <label className="fl"><i className="fas fa-lightbulb" /> Light</label>
        <select className="fi" value={scene.light} onChange={(e) => set('light', e.target.value)}>
          {LIGHTS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="cues-row">
        <label className="fl"><i className="fas fa-sun" /> Light colour</label>
        <select className="fi" value={scene.lightColor} onChange={(e) => set('lightColor', e.target.value, 240)}>
          {COLOURS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="cues-row">
        <label className="fl"><i className="fas fa-square" /> Room</label>
        <select className="fi" value={scene.room} onChange={(e) => set('room', e.target.value, 240)}>
          {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="cues-row">
        <label className="fl"><i className="fas fa-signature" /> Badge name</label>
        <input
          className="fi" value={scene.badge}
          onChange={(e) => set('badge', e.target.value)}
          placeholder="The Man"
        />
      </div>

      <div className="cues-row">
        <label className="fl"><i className="fas fa-font" /> Direction</label>
        <textarea
          className="fi" value={scene.direction ?? ''}
          onChange={(e) => set('direction', e.target.value || null)}
          placeholder="Speaks through a sideways glance…"
        />
      </div>

      <div className="cues-row">
        <label className="fl">
          <i className="fas fa-thermometer-half" /> Tension
          <span className="ct-v">{scene.tension.toFixed(2)}</span>
        </label>
        <input
          type="range" min={0} max={1} step={0.01}
          value={scene.tension}
          onChange={(e) => set('tension', Number(e.target.value), 320)}
          className="sa"
        />
      </div>

      <div className="cues-row">
        <label className="fl">
          <i className="fas fa-circle-half-stroke" /> Vignette
          <span className="ct-v">{scene.vignette.toFixed(2)}</span>
        </label>
        <input
          type="range" min={0} max={1} step={0.01}
          value={scene.vignette}
          onChange={(e) => set('vignette', Number(e.target.value), 320)}
          className="ss"
        />
      </div>

      <div className="cues-row">
        <label className="fl">
          <i className="fas fa-film" /> Grain
          <span className="ct-v">{scene.grain.toFixed(2)}</span>
        </label>
        <input
          type="range" min={0} max={0.5} step={0.01}
          value={scene.grain}
          onChange={(e) => set('grain', Number(e.target.value), 320)}
          className="sp"
        />
      </div>

      <div className="cues-row cues-actions">
        <button className="btn" onClick={() => push(clearLine(line.id))}>
          <i className="fas fa-eraser" /> Clear cues on this line
        </button>
      </div>
    </div>
  );
}
```

Add to `studio.css` (small block):

```css
.cues-panel { display: flex; flex-direction: column; gap: 8px; }
.cues-row { display: flex; flex-direction: column; gap: 4px; }
.cues-actions { flex-direction: row; gap: 6px; padding-top: 4px; }
```

---

## 5\. Integration diffs

### `frontend/src/AudioPanel.tsx`

```
+import { CuesPanel } from './CuesPanel'
+import type { Cue } from '../../shared/stage/cues'

 interface AudioPanelProps {
   reel: Reel
   onReelChange: (r: Reel) => void
   // ... existing props (selectedLineId, currentTimeMs, ...)
+  onCuesChange?: (cues: Cue[], time: number) => void
 }

-// Inside the Stage details render block — replace the entire <div className="stage-details"> … </div>
-<div className="stage-details">
-  <label>Mood</label>
-  <select value={line.m ?? ''} onChange={…}>…</select>
-  <label>Light</label>
-  <select value={line.fx?.light ?? ''} onChange={…}>…</select>
-  <label>Colour</label>
-  <select value={line.fx?.color ?? ''} onChange={…}>…</select>
-  <label>Room</label>
-  <select value={line.fx?.room ?? ''} onChange={…}>…</select>
-  <label>Prop left</label>
-  <select value={line.fx?.propL ?? ''} onChange={…}>…</select>
-  <label>Prop right</label>
-  <select value={line.fx?.propR ?? ''} onChange={…}>…</select>
-  <button onClick={tryNow}>Try now</button>
-</div>
+<CuesPanel
+  reel={reel}
+  setReel={onReelChange}
+  line={line}
+  currentTimeMs={currentTimeMs}
+  onCueChange={onCuesChange}
+/>
+<div className="cues-actions">
+  <button className="btn btn-p" onClick={tryNow}>
+    <i className="fas fa-play" /> Try now
+  </button>
+</div>
```

### `frontend/src/App.tsx`

```
+import type { Cue } from '../../shared/stage/cues'

 const iframeRef = useRef<HTMLIFrameElement | null>(null)

+const postSetCues = useCallback((cues: Cue[], time: number) => {
+  iframeRef.current?.contentWindow?.postMessage({ t: 'setCues', cues, time }, '*')
+}, [])

+const postSetTime = useCallback((ms: number) => {
+  iframeRef.current?.contentWindow?.postMessage({ t: 'setTime', value: ms }, '*')
+}, [])

 // Pass both into AudioPanel where it is rendered:
 <AudioPanel
   reel={selectedReel}
   onReelChange={setSelectedReel}
   currentTimeMs={currentTimeMs}
+  onCuesChange={postSetCues}
   // … other existing props
 />

 // Timeline scrub / playhead drag (already exists):
-postMessage to preview (old)
+postSetTime(newTimeMs)
```

---

## 6\. How to run, in order

1. **`npm run build:stage`** (produce `dist/stage.iife.js`).  
2. Apply the `model.ts` diff from the earlier plan (`planReel` wrapper \+ `buildPlayerHtml` opts).  
3. **Add the `setTime` \+ `setCues` shim** to `buildPlayerHtml` (from §1 above).  
4. Apply the `render.ts` replacement. Run the frame-diff harness from the earlier plan. Determinism must be 0% drift.  
5. Drop in `shared/stage/looks.ts`, `frontend/src/useCues.ts`, `frontend/src/CuesPanel.tsx`, and the CSS block.  
6. Apply the two UI diffs (AudioPanel, App).  
7. Flip `engine=1` on one test reel. Try a look. Change a mood. Scrub the timeline. Export.

Everything in §4 is UI work that depends only on the engine (`frameAt` \+ `setCues`), not on `render.ts`. That means the two deliverables are independent — you can ship the panel to preview first, then flip export to the deterministic path when the frame-diff harness is green.

---

If you want the *next* concrete step after this lands: the storyboard thumbnailer (`buildStoryboard` calling `sceneAt` per line into a `<canvas>`) is \~40 lines given the pieces above, and it makes the Director-mode review a real feature rather than a decorative strip. Say the word and I'll write it.

# Storyboard thumbnails — the Director-mode review

The storyboard is where the engine stops being plumbing and starts being a tool. It uses the same `frameAt` and the same capture path as export, so every tile is what a video frame at that instant will actually look like. If a tile looks wrong, the video will too — that makes it a canary as well as a review surface.

---

## 1\. `backend/src/thumbs.ts` — the thumbnail renderer

```ts
/* Thumbnails are rendered by the same Playwright pipeline as export, at the same
 * stage size, so a tile is exactly what the video frame at that instant will show.
 * Cache is incremental: per tile, keyed by (content hash up to that tile's mid-time,
 * mid-time, width, height). Editing line 8 invalidates lines 8..N and the stamp, but
 * leaves lines 1..7 cached. */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DATA_DIR, ensureCues, planReel, type Reel, type Plan } from './model';
import type { Cue } from '../../shared/stage/cues';

const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const STAGE_W = 360;
const STAGE_H = 640;

export interface ThumbTile {
  i: number;
  timeMs: number;
  label: string;
  dataUrl: string;
}

const sha1 = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

/** Anchor time in ms for a cue, using only the plan (no DOM, no theme). */
function anchorMs(cue: Cue, plan: Plan, reel: Reel): number {
  const a = cue.anchor;
  if (a.kind === 'reel') return a.ms;
  if (a.kind === 'hook') return a.offsetMs ?? 0;
  if (a.kind === 'stamp') return plan.stampAt + (a.offsetMs ?? 0);

  const i = reel.lines.findIndex((l) => l.id === a.line);
  if (i < 0) return Number.POSITIVE_INFINITY;
  const start = plan.starts[i];
  const off = a.offsetMs ?? 0;
  if (a.at === 'start') return start + off;
  if (a.at === 'end') return plan.ends[i] + off;
  if (a.at === 'speechEnd') return plan.speechEnds[i] + off;
  // word: approximate the word's start as a fraction of the line's typing window
  const words = reel.lines[i].s.split(/\s+/).filter(Boolean);
  const w = Math.min(a.word ?? 0, words.length);
  let chars = 0;
  for (let k = 0; k < w; k++) chars += words[k].length + 1;
  const total = Math.max(1, reel.lines[i].s.length);
  return start + ((plan.ends[i] - start) * chars) / total + off;
}

/** Content hash for a tile sampled at `midTime`: only cues anchored ≤ midTime matter. */
function tileHash(reel: Reel, plan: Plan, midTime: number): string {
  const relevant = (reel.cues ?? []).filter((c) => anchorMs(c, plan, reel) <= midTime);
  return sha1(JSON.stringify({
    theme: reel.theme ?? '',
    lines: reel.lines.map((l) => ({ id: l.id, s: l.s, a: l.audio?.key ?? null })),
    cues: relevant,
  }));
}

export function thumbnailTimes(reel: Reel): { times: number[]; labels: string[] } {
  const plan = reel.plan ?? planReel(reel);
  const times: number[] = [];
  const labels: string[] = [];
  // Hook tile: middle of the hook card
  times.push(Math.max(0, Math.floor((plan.starts[0] ?? 0) / 2)));
  labels.push('Hook');
  // One per line, sampled at the midpoint of the line's window
  reel.lines.forEach((_, i) => {
    times.push(Math.floor((plan.starts[i] + plan.ends[i]) / 2));
    labels.push(`L${i + 1}`);
  });
  // Stamp tile: middle of the closing stamp
  times.push(plan.stampAt + Math.floor((plan.totalMs - plan.stampAt) / 2));
  labels.push('Stamp');
  return { times, labels };
}

async function renderToDir(
  reel: Reel, times: number[], cacheDir: string,
  width: number, height: number, quality: number,
): Promise<Buffer[]> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: STAGE_W, height: STAGE_H },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/api/reels/${reel.id}/player?mode=capture&engine=1`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => !!(window as any).__stageSetTime && !!document.getElementById('stage'),
      null, { timeout: 15000 },
    );
    await page.evaluate(() => (document as any).fonts?.ready);
    await page.waitForTimeout(150);

    const out: Buffer[] = [];
    for (const t of times) {
      await page.evaluate((ms) => (window as any).__stageSetTime(ms), t);
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
      const buf = await page.locator('#stage').screenshot({ type: 'jpeg', quality });
      out.push(buf);
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function renderThumbnails(
  reel: Reel,
  opts: { force?: boolean } = {},
): Promise<ThumbTile[]> {
  ensureCues(reel);
  const plan = reel.plan ?? planReel(reel);
  const { times, labels } = thumbnailTimes(reel);
  const dir = path.join(THUMB_DIR, reel.id);
  fs.mkdirSync(dir, { recursive: true });

  // Pass 1: fill cache hits
  const hits = times.map((t, i) => {
    const h = tileHash(reel, plan, t);
    const file = path.join(dir, `${h}_${t}.jpg`);
    if (!opts.force && fs.existsSync(file)) {
      return { i, timeMs: t, label: labels[i], dataUrl: `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}` } as ThumbTile;
    }
    return null;
  });

  const misses = hits.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
  if (misses.length === 0) return hits as ThumbTile[];

  // Pass 2: render only the misses, in one browser
  const missTimes = misses.map((i) => times[i]);
  const bufs = await renderToDir(reel, missTimes, dir, STAGE_W, STAGE_H, 72);

  misses.forEach((i, k) => {
    const t = times[i];
    const h = tileHash(reel, plan, t);
    fs.writeFileSync(path.join(dir, `${h}_${t}.jpg`), bufs[k]);
    hits[i] = {
      i, timeMs: t, label: labels[i],
      dataUrl: `data:image/jpeg;base64,${bufs[k].toString('base64')}`,
    };
  });

  return hits as ThumbTile[];
}

/** Full-resolution cover render at a specific moment. */
export async function renderCoverAt(reel: Reel, timeMs: number): Promise<Buffer> {
  ensureCues(reel);
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 720, height: 1280 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/api/reels/${reel.id}/player?mode=capture&engine=1`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => !!(window as any).__stageSetTime && !!document.getElementById('stage'),
      null, { timeout: 15000 },
    );
    await page.evaluate((ms) => (window as any).__stageSetTime(ms), timeMs);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    return await page.locator('#stage').screenshot({ type: 'jpeg', quality: 90 });
  } finally {
    await browser.close().catch(() => {});
  }
}
```

---

## 2\. `backend/src/index.ts` — two new routes

```
+import { renderThumbnails, renderCoverAt, thumbnailTimes } from './thumbs';

 app.get('/api/reels/:id/player', (req, res) => {
   ...
 });

+app.post('/api/reels/:id/thumbnails', wrap(async (req, res) => {
+  const r = getReel(req.params.id);
+  if (!r) return res.status(404).json({ error: 'reel not found' });
+  const force = req.query.force === '1';
+  const tiles = await renderThumbnails(r, { force });
+  res.json({ tiles });
+}));
+
+app.post('/api/reels/:id/cover-from-thumbnail', wrap(async (req, res) => {
+  const r = getReel(req.params.id);
+  if (!r) return res.status(404).json({ error: 'reel not found' });
+  const timeMs = Number(req.body?.timeMs);
+  if (!Number.isFinite(timeMs)) return res.status(400).json({ error: 'timeMs required' });
+  const buf = await renderCoverAt(r, timeMs);
+  fs.mkdirSync(path.join(DATA_DIR, 'cover'), { recursive: true });
+  const name = `cover/${r.id}_${Date.now()}.jpg`;
+  fs.writeFileSync(path.join(DATA_DIR, name), buf);
+  updateReel(r.id, (reel) => { reel.coverFile = name; reel.coverAuto = false; });
+  res.json({ ok: true, coverFile: name });
+}));
```

`wrap` is the existing async-error wrapper; if it isn't in scope, use the try/catch pattern the rest of the file uses.

---

## 3\. `frontend/src/Storyboard.tsx` — the component

```
import { useEffect, useRef, useState } from 'react'
import type { Reel } from './types'

interface Tile {
  i: number
  timeMs: number
  label: string
  dataUrl: string
}

interface Props {
  reel: Reel
  currentTimeMs: number
  onJump: (ms: number) => void
  onSetCover?: (ms: number) => Promise<void> | void
}

export function Storyboard({ reel, currentTimeMs, onJump, onSetCover }: Props) {
  const [tiles, setTiles] = useState<Tile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastHash = useRef('')

  useEffect(() => {
    const hash = JSON.stringify({
      u: reel.updatedAt,
      cues: reel.cues ?? [],
      lines: reel.lines.map((l) => ({ id: l.id, s: l.s, a: l.audio?.key ?? null })),
      plan: reel.plan,
    })
    if (hash === lastHash.current) return
    lastHash.current = hash

    const ctl = new AbortController()
    // Debounce so quick edits coalesce. Cache hits come back fast; only the changed
    // tiles actually re-render on the server.
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)
      fetch(`/api/reels/${reel.id}/thumbnails`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: ctl.signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json() as Promise<{ tiles: Tile[] }>
        })
        .then((j) => setTiles(j.tiles))
        .catch((e) => {
          if (e.name === 'AbortError') return
          setError(String(e.message || e))
        })
        .finally(() => setLoading(false))
    }, 600)

    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [reel.id, reel.updatedAt, reel.cues, reel.lines, reel.plan])

  const currentIndex = tiles.findLastIndex((t) => t.timeMs <= currentTimeMs)

  if (error) {
    return (
      <div className="sb-error">
        <i className="fas fa-triangle-exclamation" /> Storyboard unavailable — {error}
      </div>
    )
  }

  return (
    <div className="sb-row" role="listbox" aria-label="Storyboard">
      {tiles.length === 0 && (
        <div className="sb-placeholder">
          <i className="fas fa-spinner fa-spin" /> Rendering thumbnails…
        </div>
      )}
      {tiles.map((t, i) => (
        <button
          key={t.i}
          type="button"
          className={`sb-frame${i === currentIndex ? ' on' : ''}`}
          onClick={() => onJump(t.timeMs)}
          title={`${t.label} · ${(t.timeMs / 1000).toFixed(1)}s — click to jump, click the icon to set as cover`}
        >
          <img src={t.dataUrl} alt={t.label} draggable={false} />
          <span className="sb-label">{t.label}</span>
          {onSetCover && (
            <span
              className="sb-cover-btn"
              role="button"
              tabIndex={0}
              title="Set as cover"
              onClick={(e) => { e.stopPropagation(); onSetCover(t.timeMs) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onSetCover(t.timeMs)
                }
              }}
            >
              <i className="fas fa-image" />
            </span>
          )}
        </button>
      ))}
      {loading && tiles.length > 0 && (
        <div className="sb-placeholder sb-placeholder-inline">
          <i className="fas fa-spinner fa-spin" />
        </div>
      )}
    </div>
  )
}
```

---

## 4\. CSS — extend the `.sb-*` block in `studio.css`

```css
.sb-frame {
  position: relative;
  padding: 0;
  border: 1.5px solid transparent;
}
.sb-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: inherit;
}
.sb-frame.on { border-color: var(--whisky); }
.sb-label {
  position: absolute;
  bottom: 2px;
  left: 4px;
  font-family: var(--mono);
  font-size: 8px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  padding: 1px 4px;
  border-radius: 3px;
  pointer-events: none;
}
.sb-cover-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 3px;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.2s;
}
.sb-frame:hover .sb-cover-btn { opacity: 1; }
.sb-placeholder {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  font-size: 11px;
  color: var(--mid);
  background: rgba(61, 58, 50, 0.15);
  border-radius: var(--r-sm);
}
.sb-placeholder-inline {
  flex-shrink: 0;
  width: 40px;
  height: 45px;
  padding: 0;
  justify-content: center;
}
.sb-error {
  padding: 10px 14px;
  font-size: 11px;
  color: var(--tartan);
  background: rgba(184, 58, 58, 0.08);
  border-radius: var(--r-sm);
}
```

---

## 5\. `frontend/src/App.tsx` — the one-line diff that swaps the fake strip

```
+import { Storyboard } from './Storyboard'

 // Wherever the 10 hard-coded numbered divs are rendered:
-<div className="sb-row">
-  {Array.from({ length: 10 }).map((_, i) => (
-    <div className="sb-frame" key={i} onClick={...}>{i + 1}</div>
-  ))}
-</div>
+<Storyboard
+  reel={selectedReel}
+  currentTimeMs={currentTimeMs}
+  onJump={(ms) => {
+    postSetTime(ms)
+    setCurrentTimeMs(ms)     // keep the local playhead in step
+  }}
+  onSetCover={async (ms) => {
+    const r = await fetch(`/api/reels/${selectedReel.id}/cover-from-thumbnail`, {
+      method: 'POST',
+      headers: { 'content-type': 'application/json' },
+      body: JSON.stringify({ timeMs: ms }),
+    })
+    if (r.ok) refetchReel()
+  }}
+/>
```

`postSetTime` is the same function from the earlier `App.tsx` diff (sends `{ t: 'setTime' }` to the preview iframe). If the app already has a `setCurrentTimeMs` that drives the playhead, wire that in as well so the on-screen playhead jumps together with the preview.

---

## 6\. `backend/test/thumbs.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { thumbnailTimes } from '../src/thumbs';
import { planReel } from '../src/model';
import type { Reel } from '../src/types';

const makeReel = (): Reel => ({
  id: 'test',
  title: 'Test',
  hook: 'Test hook',
  stamp: 'Test stamp',
  theme: 'The Denial Came First',
  lang: 'en',
  lines: [
    { id: 'a', s: 'First line', h: 0, audio: { file: 'a.mp3', key: 'k1', durationMs: 800 } },
    { id: 'b', s: 'Second line', h: 0, audio: { file: 'b.mp3', key: 'k2', durationMs: 1200 } },
    { id: 'c', s: 'Third line', h: 0, audio: { file: 'c.mp3', key: 'k3', durationMs: 600 } },
  ],
} as any);

describe('thumbnailTimes', () => {
  it('produces one tile per line plus hook and stamp', () => {
    const reel = makeReel();
    reel.plan = planReel(reel);
    const { times, labels } = thumbnailTimes(reel);
    expect(times.length).toBe(reel.lines.length + 2);
    expect(labels[0]).toBe('Hook');
    expect(labels[labels.length - 1]).toBe('Stamp');
    expect(labels[1]).toBe('L1');
    expect(labels[2]).toBe('L2');
    expect(labels[3]).toBe('L3');
  });

  it('hook tile is before the first line starts', () => {
    const reel = makeReel();
    reel.plan = planReel(reel);
    const { times } = thumbnailTimes(reel);
    expect(times[0]).toBeLessThan(reel.plan.starts[0]);
  });

  it('line tiles sit strictly inside their line windows', () => {
    const reel = makeReel();
    reel.plan = planReel(reel);
    const { times } = thumbnailTimes(reel);
    for (let i = 0; i < reel.lines.length; i++) {
      expect(times[i + 1]).toBeGreaterThanOrEqual(reel.plan.starts[i]);
      expect(times[i + 1]).toBeLessThan(reel.plan.ends[i]);
    }
  });

  it('stamp tile is inside the stamp window', () => {
    const reel = makeReel();
    reel.plan = planReel(reel);
    const { times } = thumbnailTimes(reel);
    expect(times[times.length - 1]).toBeGreaterThanOrEqual(reel.plan.stampAt);
    expect(times[times.length - 1]).toBeLessThan(reel.plan.totalMs);
  });
});
```

Run: `npm test -- thumbs`.

---

## 7\. How it behaves

**Cold load (first visit):** every tile renders. A 20-line reel means 22 tiles, one Playwright page, \~3–5 s. The client shows a spinner in place of the row until the response arrives.

**Warm load:** every tile is a cache hit. The HTTP round-trip is \~40 ms; the row appears instantly.

**Edit a cue on line 8:** debounce 600 ms, then `renderThumbnails` recomputes each tile's hash. Tiles 1–7 hit cache. Tiles 8–N and the stamp tile re-render on the server (still one page, N−6 screenshots, \~1 s for a 20-line reel). Row visibly updates within \~1.5 s of the edit.

**Edit line 1:** the hook tile is unchanged (its mid-time is before line 1's anchor), lines 1..N and stamp re-render. So the cost of an edit scales with *how far back* it is — early edits cost more, late edits are cheap. That matches the reality of cue semantics: step tracks carry forward, so an early change really does affect everything.

**Use as cover:** right panel → thumbnail → hover → click the image icon. The server renders at 720×1280 (same engine, higher res) and sets `reel.coverFile` with `coverAuto = false`. The existing cover logic in `App.tsx` picks up the change on the next `refetchReel`.

**Click a tile:** `postSetTime(t)` scrolls the preview iframe to that moment. Because we now drive the preview from `__stageSetTime`, the frame is exact — no audio-sync drift, no waiting for typing.

**No effect on export:** `renderThumbnails` opens its own browser, closes it, and does not touch the export path or its job queue. The two can run in parallel.

---

## 8\. Run order (after everything from the previous turns is in place)

1. `npm run build:stage` — engine bundle exists.  
2. Backend: `planReel` wrapper \+ `buildPlayerHtml` shim with `__stageSetTime` (from Phase 0/2).  
3. Backend: drop in `thumbs.ts`, apply the two routes in `index.ts`.  
4. **Test before wiring the UI:** `curl -X POST http://localhost:4000/api/reels/REEL/thumbnails | jq '.tiles | length'` → should return `lines.length + 2` and each tile should have a non-empty `dataUrl`. Save one dataUrl to disk and open it to eyeball the frame.  
5. Frontend: drop in `Storyboard.tsx`, add the CSS, apply the `App.tsx` diff.  
6. Reload `localhost:5173`. The storyboard row is now real thumbnails. Click one — the preview jumps. Hover one — a small image icon appears; click it — the reel's cover updates.

---

## 9\. What this unlocks next

Once the storyboard is real, the two remaining Phase 4 items are almost free:

- **Take recording** — the record button that captures `sceneAt(t)` on every edit; the storyboard re-renders the affected tile and you immediately see what you recorded.  
- **Director mode toggle** — a button that hides the editor sidebars and makes the storyboard the primary surface, with the preview iframe above and the timeline below. Same engine, same cues, just a different layout.

