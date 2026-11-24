# Reel Management System - Architecture Documentation

## Overview
This is a complete reel management and narration generation system for TheAgentStands, implementing an AFS (Asset Studio) style three-panel UI with JSON-based narration files, TTS generation using designed voices, timeline preview, and video export.

---

## Directory Structure

```
reel-management-export/
├── backend/
│   ├── src/
│   │   ├── index.ts          # Main Express server + API routes
│   │   ├── model.ts          # Core types, Reel/Line/Narration logic, planReel()
│   │   └── render.ts         # FFmpeg video rendering pipeline
│   ├── package.json
│   ├── tsconfig.json
│   ├── sync-narrations.js    # One-time migration: HTML → JSON narrations
│   └── data/
│       └── narrations/       # JSON narration files (7 themes × 8-9 languages)
└── frontend/
    ├── src/
    │   ├── App.tsx           # Main three-panel UI + state management
    │   ├── AudioPanel.tsx    # Right drawer: voice selection, TTS, line editing
    │   ├── studio.css        # AFS-style dark theme + timeline CSS
    │   ├── types.ts          # Shared TypeScript interfaces
    │   ├── lib.ts            # Axios API client
    │   ├── App.css           # Legacy styles
    │   ├── index.css         # Global styles
    │   └── main.tsx          # React entry point
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts        # Vite config with /api proxy
    └── index.html
```

---

## Backend Components

### `backend/src/index.ts` - Express Server & API
**Port:** 4000 (proxied via Vite `/api`)

**Key Responsibilities:**
- Static file serving for narrations (`/api/narrations/files`), media (`/api/data`)
- **Narration API** (`/api/narrations`, `/api/themes/*/languages`, `/api/themes/*/*/reels`)
- **TTS Voices Proxy** (`/api/tts/voices`) → fetches from tts-management (port 3229)
- **TTS Generation** (`POST /api/reels/:id/lines/:lineId/tts`)
- **Reel CRUD** (GET/POST/PUT `/api/reels`)
- **Export** (`POST /api/reels/:id/export`)

**TTS Architecture (Critical):**
```
Frontend → Backend (4000) → MLX-Audio Server (8771) → returns audio buffer
                    ↑
            tts-management (3229) for voice catalog only
```
- **Designed voices** (40 voices) come from `http://127.0.0.1:3229/api/book/tts-voices`
- **Speech generation** goes to `http://127.0.0.1:8771/v1/audio/speech`
- **Fix applied:** `instruct` parameter NOT sent for designed voices (baked into design)

### `backend/src/model.ts` - Core Logic
**Types:**
- `Line` - text, voiceId, audio{}, offset (ms), holdMs, direction, mood, log[]
- `Reel` - lines[], theme, lang, coverUrl, videoUrl
- `Plan` - starts[], ends[], speechEnds[], holds[], totalMs, missingAudio[]
- Narration types: `NarrationScene`, `NarrationReel`, `NarrationLanguageIndex`, `NarrationThemeIndex`

**Key Functions:**
- `planReel(reel)` - **Core timing engine**: calculates start/end times respecting `line.offset`
- `isStale(line)` - checks if audio needs regeneration
- `serialize(reel)` - adds audio URLs for frontend
- `narrationReelToReel()` - converts JSON narration → Reel with lines
- `listNarrationThemes()`, `getNarrationTheme()`, `getNarrationLanguage()`, `getNarrationReel()`

**planReel Algorithm:**
1. Lines with explicit `offset` → start at that time
2. Lines without offset → sequential after previous line's end
3. Returns `Plan` with all timing arrays for frontend timeline + export

### `backend/src/render.ts` - Video Export
- Uses `planReel()` for timing
- FFmpeg concatenates video segments + narration audio at exact `plan.starts[i]` positions
- Outputs MP4 to `/data/exports/`

### `backend/sync-narrations.js` - Migration Script
- One-time extraction of `const R = [...]` from HTML theme files
- Outputs structured JSON: `index.json`, `{theme}/index.json`, `{theme}/{lang}/index.json`, `{theme}/{lang}/{reel}.json`

### `backend/data/narrations/` - JSON Narration Store
```
narrations/
├── index.json                              # Master: { themes: { [slug]: { title, languages } } }
├── {theme-slug}/
│   ├── index.json                          # { slug, title, languages: [{code,name}] }
│   └── {lang}/
│       ├── index.json                      # { slug, title, reels: [{slug,title,scenes}] }
│       └── {reel-slug}.json                # Full narration: scenes[] with text, direction, mood, panel, holdMs
```

---

## Frontend Components

### `frontend/src/App.tsx` - Main Three-Panel UI
**State Management:**
- `themes`, `languages`, `reels`, `selectedReel`, `voices`
- `busy` (per-line TTS), `lineErr`, `generatingAll`
- `liveLine` (websocket-like playback position), `playheadPercent`, `isScrubbing`

**Layout (AFS Pattern):**
```
┌─────────────┬──────────────────┬──────────────┐
│ Left Drawer │   Center Canvas  │ Right Drawer │
│ Themes/     │  Preview +       │ Audio Panel  │
│ Languages/  │  Timeline/Seeker │ (voices,     │
│ Reels       │  (resizable)     │  TTS, edit)  │
└─────────────┴──────────────────┴──────────────┘
```
- **Resizable drawers** via drag handles (`data-resizing` attribute)
- **Dark theme** using CSS custom properties (`--bg`, `--pan`, `--card`, `--ac`, etc.)

**Key Features:**
- Theme → Language → Reel cascading selection
- Timeline component (click/drag to seek, visual segments at `plan.starts[i]`)
- `formatTime()` helper for mm:ss display
- `fetchReels()` + `setSelectedReel()` pattern (critical: uses TTS response to update immediately)

### `frontend/src/AudioPanel.tsx` - Right Drawer
**Tabs:**
1. **Cast & Voices** - Voice selection per line, designed voice badges
2. **Write & Voice** - Line editing (text, direction, mood, hold, **offset**), TTS buttons

**Line Editing (Stage Details):**
- Text textarea
- Direction input
- Mood dropdown (flat/up/calm)
- Beat after (holdMs) input
- **Start offset (seconds) input** → patches `line.offset` in ms
- **Apply button** → commits offset, triggers timeline re-render
- Terminal panel log lines

**TTS Generation:**
- `onGenerate(lineId, voiceId)` → POST `/tts` → **updates selectedReel from response** → play button appears
- `onGenerateAll(voiceId)` → batch generates stale/new lines

### `frontend/src/studio.css` - AFS Dark Theme + Timeline
**CSS Custom Properties:**
```css
:root {
  --bg:#0b0d10; --pan:#111418; --card:#161a1f;
  --line:#22272e; --ink:#e6edf3; --mu:#8b949e;
  --ac:#58a6ff; --warn:#d29922; --err:#f85149;
}
```

**Timeline Styles:**
- `.timeline-container` - wrapper
- `.timeline` - clickable track
- `.timeline-track` - background line
- `.timeline-segment` - positioned by `left%` / `width%` from `plan.starts/speechEnds`
- `.timeline-playhead` - current position
- `.timeline-labels` - 0:00 to total duration

**Resizable Drawers:**
- `.resize-handle` - 5px drag zone
- `.studio[data-resizing="true"]` - global cursor during drag

### `frontend/src/types.ts` - Shared Interfaces
- `Line` (with `offset?: number`)
- `Reel`, `Plan`, `Theme`, `Language`, `Voice`
- `Voice.kind`: `'studio' | 'designed' | 'system'`

### `frontend/src/lib.ts` - Axios Client
- Base URL: `/api` (proxied to `localhost:4000`)
- `patchLine(id, patch)` helper for line updates

---

## Data Flow Summary

### 1. Narration Loading
```
User selects Theme → GET /api/themes/:theme/languages
User selects Language → GET /api/themes/:theme/:lang/reels
User selects Reel → GET /api/reels/:id (or creates from narration JSON)
```

### 2. TTS Generation
```
User clicks Generate → POST /api/reels/:id/lines/:lineId/tts {voiceId}
    ↓
Backend: speak(line.s, voice) → MLX-Audio (8771) → saves MP3 to /data/audio/
    ↓
Backend: updates reel.lines[].audio {file, durationMs, url}
    ↓
Backend: returns serialize(updatedReel)
    ↓
Frontend: setSelectedReel(response) → play button (▶) appears immediately
```

### 3. Offset / Timeline Sync
```
User edits Start offset → patchLine(id, {offset: ms})
    ↓
Backend: PUT /api/reels/:id {lines} → planReel() recalculates starts[]
    ↓
Frontend: fetchReels() → timeline segments reposition at new plan.starts[i]
    ↓
Export: render.ts uses same planReel() → audio placed at exact offsets
```

### 4. Video Export
```
POST /api/reels/:id/export
    ↓
render.ts: planReel() → FFmpeg complex filter:
  - Video segments concatenated
  - Narration audio overlaid at plan.starts[i] timestamps
  - Output: /data/exports/{reelId}.mp4
```

---

## Required External Services

| Service | Port | Purpose |
|---------|------|---------|
| **tts-management** | 3229 | Designed voice catalog (`/api/book/tts-voices`) |
| **MLX-Audio** | 8771 | Speech synthesis (`/v1/audio/speech`) |
| **Backend** | 4000 | API + static files |
| **Frontend (Vite)** | 5173 | React dev server (proxies `/api` → 4000) |

**Start Order:**
1. `mlx-audio-server --port 8771` (or equivalent)
2. `tts-management` server on 3229
3. `cd backend && npm run dev` (ts-node-dev)
4. `cd frontend && npm run dev` (Vite)

---

## Key Fixes Applied

1. **TTS Crash Fix** (`index.ts: speak()`): Don't send `instruct` for `kind === 'designed'` voices
2. **Voice Loading Fix** (`index.ts: listVoices()`): Correct endpoint `/api/book/tts-voices`, access `j.voices`
3. **Play Button Fix** (`App.tsx: onGenerate`): Use TTS response to update `selectedReel` immediately
4. **Timeline Fix** (`studio.css`): Added `.center { grid-column: 2; }` for preview visibility
5. **Resizable Drawers** (`App.tsx` + `studio.css`): Drag handles + `data-resizing` attribute
6. **Offset Support** (`model.ts: planReel`, `AudioPanel.tsx`): Explicit start times per line
7. **Narration API Format** (`index.ts`): Returns `{themes: {...}}` not array

---

## Export Checklist

- [ ] MLX-Audio server running on 8771
- [ ] tts-management server running on 3229
- [ ] Backend `npm run dev` (port 4000)
- [ ] Frontend `npm run dev` (port 5173)
- [ ] Test: Select theme → language → reel → voices load
- [ ] Test: Generate narration → play button appears
- [ ] Test: Set offset → Apply → timeline updates
- [ ] Test: Export MP4 → narration synced at offsets