# Stage effects: integration instructions

**Audience:** the agent working in the TheAgentStands project.
**Task:** add "stage effects" (more moods, controllable lamp, light colour, room tint, SVG props) and a "Try now" live preview to the Reel Manager. Everything has already been written and tested; your job is to bring the files in, verify, and document.

**Out of scope, do not do:** anything with the shaders module or its SVG asset catalog (`shaders.js`, `shaders.css`, `*.asset.json`). The props here are a separate, self-contained catalog.

---

## 1. What this adds (user-facing)

In the right-hand Audio drawer, **Write & voice → a line → Stage details**:

| Control | Values | Notes |
|---|---|---|
| Mood | flat, eyebrows up, calm smile (theme's own) + **worried, stern, surprised, smug, sleepy, wink** | stored in the existing `Line.m` |
| Light | sway (theme default), steady, candle, flicker, swing, sweep, pulse (alarm), dim, off | the `.lamp` behind the face |
| Light colour | warm, cold white, alarm red, sickly green, violet | |
| Room | plum (default), night blue, dark red, dark green, near black | stage background tint |
| Prop left / right | clock, folder, magnifier, moth, phone (ringing), question mark, microphone, idea bulb, or "remove prop" | small animated SVG beside the face |
| **Try now** button | | shows this line's look in the preview immediately, without reloading |

Rules the user relies on:

- **Sticky, like mood.** A line that sets nothing keeps what the previous line set. The hook card resets everything, so Replay always starts clean.
- **Try now is cumulative.** It shows the line as it will look in sequence (earlier lines' settings folded in).
- **Auto-try.** Changing any of the dropdowns (mood or effects) also triggers a try automatically. To remove this, delete the `tryLine(...)` call inside `patchAndTry` in `AudioPanel.tsx` and keep the button.
- Existing reels that use none of this look and export exactly as before.

---

## 2. Files delivered

| File | Destination | Status |
|---|---|---|
| `backend/src/stagefx.ts` | `backend/src/stagefx.ts` | **NEW**. Catalog, whitelist, CSS, runtime script. |
| `backend/src/model.ts` | `backend/src/model.ts` | modified |
| `backend/src/index.ts` | `backend/src/index.ts` | modified |
| `frontend/src/types.ts` | `frontend/src/types.ts` | modified |
| `frontend/src/lib.ts` | `frontend/src/lib.ts` | modified |
| `frontend/src/AudioPanel.tsx` | `frontend/src/AudioPanel.tsx` | modified |
| `frontend/src/App.tsx` | `frontend/src/App.tsx` | modified |
| `stagefx.patch` | (repo root, not committed) | unified diff of all of the above against the versions the files were written from |

`render.ts`, `useReelEditor.ts`, `studio.css`, `App.css`, `index.css`, `main.tsx`, `index.html` and every theme HTML file are **not** changed.

---

## 3. How to apply

### Option A, the project files are unchanged since the delivery (preferred)

From the repo root:

```bash
git status                       # start from a clean tree, or at least know what is dirty
patch -p1 --dry-run < stagefx.patch   # must report every file as OK
patch -p1 < stagefx.patch
```

(`git apply stagefx.patch` also works.) `stagefx.ts` is created by the patch.

### Option B, some of these files have changed since

Do **not** overwrite them with the delivered copies. Open `stagefx.patch` and apply each hunk by hand, or have `patch` report which hunks fail and merge only those. The exact change set per file is listed below so it can be reproduced without the patch.

#### 3.1 `backend/src/stagefx.ts` (new)
Copy the delivered file as is. It has no dependencies. It exports `cleanFx`, `catalogForClient`, `stageFxCss`, `stageFxScript`, the catalog arrays (`MOODS`, `LIGHTS`, `COLORS`, `ROOMS`, `PROPS`) and the `LineFx` type.

#### 3.2 `backend/src/model.ts`
1. Add imports at the top:
   ```ts
   import { cleanFx, stageFxCss, stageFxScript } from './stagefx';
   import type { LineFx } from './stagefx';
   ```
2. `Line` interface: add `fx?: LineFx;` (and widen the comment on `m` to list the new moods).
3. `ThemeReel.l` item type: add `fx?: LineFx` (lets a theme file pre-set effects).
4. `themeReelToReel`: inside the `lines` map add
   `...(cleanFx(l.fx) ? { fx: cleanFx(l.fx) } : {}),`
5. `const BASE_CSS = ...` becomes `` `h1,.sub,.tabs{display:none!important}` + stageFxCss() `` (this makes the CSS reach **both** preview and capture, because `buildPlayerHtml` already puts `BASE_CSS` in a `<style>`).
6. In `buildPlayerHtml`, after the `<style>` replacement and before `if (mode === 'preview') {`, add:
   ```ts
   const fxScript = stageFxScript(reel.lines.map((l) => l.fx), mode);
   if (fxScript) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => fxScript + '</body>') : html + fxScript;
   ```

#### 3.3 `backend/src/index.ts`
1. Import: `import { catalogForClient, cleanFx } from './stagefx';`
2. New route, next to the themes routes:
   ```ts
   app.get('/api/stagefx', (_req, res) => res.json(catalogForClient()));
   ```
3. `PUT /api/reels/:id`, in the object built for each line, directly after the `m` line add:
   ```ts
   ...(cleanFx(n.fx) ? { fx: cleanFx(n.fx) } : {}), // whitelisted ids only
   ```
   **Important:** the PUT rebuilds every line from the payload, so if this line is missing, `fx` is silently dropped on every autosave.

#### 3.4 `frontend/src/types.ts`
Add `LineFx`, `StageOption`, `StageCatalog`, `StageLook` interfaces, and `fx?: LineFx` on `Line`.

#### 3.5 `frontend/src/lib.ts`
1. Import `LineFx` and `StageLook` types.
2. `playerSig`: add `l.fx || null` to the per-line array (so changing an effect marks the preview out of date).
3. `savePayload`: add `fx: l.fx` to each line (**without this nothing is saved**).
4. Add `nextFx(cur, key, value)`, `FALLBACK_MOODS`, and `resolveLook(lines, index)` (above the "audition" section).

`mergeServer` needs no change: it keeps local lines and only takes `audio`/`stale` from the server.

#### 3.6 `frontend/src/AudioPanel.tsx`
1. Imports: `useEffect`, `axios`, `StageCatalog`, `StageLook`, `FALLBACK_MOODS`, `nextFx`, `resolveLook`.
2. `Props`: add `onTryLine: (look: StageLook) => void`.
3. State + effect: load `/api/stagefx` into `stage` (ignore errors, an older server just shows the 3 original moods).
4. Helpers `tryLine` and `patchAndTry` next to `patchLine`.
5. Mood `<select>`: options come from `stage?.moods || FALLBACK_MOODS`; `onChange` uses `patchAndTry`.
6. New `vo-row` after the Mood/Beat/Start row: five selects (Light, Light colour, Room, Prop left, Prop right) using `patchAndTry(l.id, { fx: nextFx(l.fx, key, value) })`, plus a **Try now** button. Reuse the existing classes (`vo-row`, `vo-in`, `vo-btn`); no CSS change is needed.

#### 3.7 `frontend/src/App.tsx`
1. Add `StageLook` to the type import from `./types`.
2. Before the "live playhead" block add:
   ```ts
   const onTryLine = useCallback((look: StageLook) => {
     playerRef.current?.contentWindow?.postMessage({ t: 'fx-try', look }, window.location.origin)
   }, [])
   ```
3. Pass `onTryLine={onTryLine}` to `<AudioPanel ... />`.

---

## 4. How it works (read before changing anything)

### 4.1 Data
`Line.fx = { light?, color?, room?, propL?, propR? }` (all optional string ids). Mood stays in `Line.m`. An empty value means "keep what the previous line set". The special prop id `'none'` removes the current prop. Stored in `data/` with the reel like every other line field.

### 4.2 The theme is never re-implemented
`buildPlayerHtml` still loads the theme's own HTML and swaps in `const R=[...]`. Stage effects are **injected** next to it:
- **CSS** (`stageFxCss()`): always injected, preview and capture. It only matches new mood values and `data-light` / `.fx-*` hooks, so it is inert for existing reels.
- **Script** (`stageFxScript(lines, mode)`) before `</body>`:
  - `preview`: always injected, because it carries the "Try now" listener.
  - `capture`: injected only when at least one line has an effect, so exports of old reels are byte-for-byte unaffected.

The script finds the current line the same way `render.ts` does: a `MutationObserver` on `#cap` counting added `<p>` nodes. On each new line it applies that line's `fx` to `#stage` (a `data-light` attribute, `--lamp-rgb` / `--room` custom properties, and two absolutely positioned prop slots `.fx-slot.fx-l` / `.fx-r`). The hook overlay turning `on` resets everything.

### 4.3 Security
Ids are whitelisted server-side (`cleanFx`) on save and again when building the player; the runtime only looks ids up in server-built maps. The client can never send CSS, markup or colours. Props are static SVG authored in `stagefx.ts`; no scripts.

### 4.4 Export determinism (critical for MP4)
`render.ts` replaces timers/rAF/`performance.now` with a virtual clock and freezes `document.getAnimations()` to it each frame. Therefore **every effect must be a CSS animation or transition** (or Web Animations). Do not use `requestAnimationFrame`, `setTimeout`, `Math.random()` or `Date.now()` for visuals; they will not match between preview and export. This was tested: replaying a player under the real `render.ts` virtual clock twice produced identical effect states at identical virtual times, with a lamp-position difference of about 0.0004 (the same sub-pixel start jitter the theme's own `sway` has).

### 4.5 "Try now" message protocol
- Studio (`App.tsx`) → preview iframe: `postMessage({ t: 'fx-try', look }, window.location.origin)`, where `look = { mood, light, color, room, propL, propR }` (all strings, `''` = none/default; `light: 'sway'` = theme default).
- `look` is produced by `resolveLook(lines, index)` in `lib.ts`, which folds the sticky settings from line 0 up to the target line, the same way the player does.
- The preview script accepts it only if `e.source === parent` and `e.origin === location.origin`, validates the mood (`/^[a-z]{2,12}$/`) and light (against the known list), then sets the mood on `#av` and re-applies the stage. It deliberately does **not** touch the running line counter, so a reel that is playing carries on.
- This relies on the iframe being same-origin, which it is (`/api/reels/:id/player` via the Vite proxy). If the preview is ever served from another origin, use that origin as the `targetOrigin` and update the check.
- The existing `message` handler in `App.tsx` (the `switch (e.data.t)` for `start/line/pause/end/audioblocked`) is for the opposite direction (iframe → studio) and is not modified.

---

## 5. Verification checklist

Run, in this order:

1. **Typecheck** (this was only syntax-checked offline; a real typecheck is part of your task):
   - backend: `cd backend && npx tsc --noEmit`
   - frontend: `cd frontend && npx tsc -b` (or whatever `package.json` uses for the build/lint)
   - If the backend `tsconfig` target is older than ES2019, `Object.fromEntries` in `stagefx.ts` will error; either raise the target or replace it with a small reduce.
2. **Restart the backend**, then **hard-reload `localhost:5173`** (an iframe loaded before the restart does not have the Try-now listener).
3. `curl localhost:4000/api/stagefx` returns JSON with `moods`, `lights`, `colors`, `rooms`, `props`.
4. Open a reel → Write & voice → a line → Stage details. The mood list has 9 entries and a second row of five selects plus **Try now** is visible.
5. Change Light / Colour / Room / props and a mood: the preview iframe changes immediately, without reloading, and the text keeps typing.
6. Reload the page: the chosen effects are still there (confirms `savePayload` + PUT + `cleanFx`). Check the reel JSON in `data/` contains `fx` on that line.
7. Press **Replay**: effects occur in sequence, are sticky across lines, and are cleared at the hook card.
8. After changing an effect, the "preview out of date" indicator appears (confirms `playerSig`).
9. **Export MP4** a reel with effects and a reel without any. Watch both. Effects should match the preview; the old-style reel should look exactly as before.
10. Open another theme's reel (e.g. a non-Denial theme). If it lacks `#stage`, `#cap`, `.lamp`, `#av`, the effects must simply do nothing and nothing may break. Record which themes work fully.

---

## 6. How to extend the catalog later

All additions are in `backend/src/stagefx.ts`; the UI dropdowns pick them up from `/api/stagefx`.

- **Mood:** add `{ id, label }` to `MOODS` and a block in `MOOD_CSS` using `#av[data-mood="<id>"]` (brows: `.brow` and `.brow.r`; eyes: `.eye`, second eye is `.eye ~ .eye`, use the individual `scale` property so the theme's blink animation is not overridden; mouth: `d:path("...")`). Add the id to the `#av.talk[...] .mouth` rule so it uses the gentler `fx-talk`. Mood ids must match `/^[a-z]{2,12}$/`.
- **Light:** add to `LIGHTS`, add a `.stage[data-light="<id>"] .lamp{animation:...}` rule and a keyframes block. Keep `translateX(-50%)` in any transform keyframes (the lamp is centred that way).
- **Colour / Room:** add `{ id, label, rgb: 'r,g,b' }` to `COLORS` or `{ id, label, hex }` to `ROOMS`.
- **Prop:** add `{ id, label, svg }` to `PROPS`. Use a `viewBox="0 0 48 48"` coordinate space (the wrapper adds the `<svg>`), stroke-only shapes, `class="a"` for the accent colour and `class="t"` for text. Colours come from the theme's CSS variables (`--paper`, `--tag`), so props follow each theme's palette. Optionally add an animation under `.fx-<id>`.
- Keep strobing out. Flicker amplitude is deliberately moderate (about 45% minimum brightness) and pulses are slow; avoid anything flashing more than 3 times per second.
- `prefers-reduced-motion` is already honoured in the preview (effects stay static). Capture runs with `no-preference`, so exports are unaffected.

---

## 7. Known limitations (intentional, do not "fix" without asking)

- **Try now is a preview only.** It changes the DOM of the running iframe and saves nothing. Saving follows the existing autosave. A subsequent line in a playing reel applies its own effects on top.
- **Theme layout assumption.** Effects assume the Denial-style stage (`#stage`, `.lamp`, `#av`, `#cap`, `#hook`, `.hook.on`). Other themes may need small CSS adjustments; handle per theme once their markup is reviewed.
- `narrationReelToReel` (the "Narrations" import path) does not carry `fx`; only `themeReelToReel` does (for theme files that pre-set effects).
- Prop slots sit at the top-left and top-right of the stage, beside the avatar. Larger or other positions are a later change.

---

## 8. Documentation to leave behind

When the work is verified, copy this file into the repo as `docs/stagefx.md` (or the project's docs folder), and add a short note to the README pointing to it, plus one line in whatever changelog the project keeps. Update §5/§7 with the per-theme results from checklist step 10.

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Effects vanish after reload | `fx` missing from `savePayload` (lib.ts) or from the PUT handler (index.ts) |
| Dropdown only shows 3 moods and no effects row | `/api/stagefx` not reachable: backend not restarted, route missing, or Vite `/api` proxy |
| Try now does nothing | preview iframe loaded before the backend restart (reload the page); or `onTryLine` not passed in App.tsx; or iframe not same-origin |
| Effects show in preview but not in the MP4 | `stageFxCss()` not added to `BASE_CSS`, or script not injected in `capture` mode, or an effect uses JS timing instead of CSS animation |
| TypeScript error on `Object.fromEntries` | backend `target` below ES2019 |
| Lamp jumps sideways when the light changes | a keyframes block is missing `translateX(-50%)` |
