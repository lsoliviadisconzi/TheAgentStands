# The Agent Stands — UI Documentation

## Overview

This document describes the user interface of **The Agent Stands** application, covering the frontend implementation, referenced files, capabilities, and a design review with areas for improvement.

The application is a full‑stack web app for managing "reels" (short video clips), generating TTS narrations, editing reel text, and exporting the final video as MP4. It features a dark AFS‑inspired theme, a left‑hand drawer for narration/import browsing, a central preview area with a timeline, and an audio panel on the right.

---

## 1. UI Layout

The page is split into three vertical sections inside a `.app` container:

| Section | Position | Description |
|---------|----------|-------------|
| **Header** | Top‑center | App title "TheAgentStands · Reel Manager" |
| **Left Drawer** | Collapsible sidebar (≈360 px) | Library, narration browser, theme browser, and reel list |
| **Center** | Main area | Reel preview (iframe), timeline, video controls |
| **Right Audio Panel** | Collapsible panel (appears when a reel is selected) | Audio upload, playback, per‑line controls |

The drawer can be resized by dragging the handle on its right edge (`handleResizeStart` in `App.tsx`).

---

## 2. Left Drawer (Library)

### 2.1 Reel Creation

- **Form** (`form.sec first`): title, theme selector, language selector → creates a new reel via `POST /api/reels`.
- **Narrations section** (AFS‑style): theme → language → reel list with title, hook, scene count → "Import" creates a reel pre‑filled with narration JSON.
- **Legacy Theme browser (HTML)**: theme → language → reel list from parsed HTML files → "Import" creates a reel.
- **My reels section**: list of user's reels with title, duration, cover/video thumbnail, and "On Landing" checkbox.

### 2.2 Narration Browser (New)

- **State** (`narrationThemes`, `narrationTheme`, `narrationLanguage`): fetched from `GET /api/narrations`.
- **Theme dropdown**: shows all themes with language counts.
- **Language dropdown**: shows languages with reel counts.
- **Reel list**: each reel shows title, hook, and scene count. Clicking "Import" calls `POST /api/reels/import-narration`.
- **Benefits**: JSON‑based, no runtime HTML parsing, easy to edit/translate, matches AFS pattern.

### 2.3 Legacy Theme Browser (HTML)

- Parses `data/*.html` files using `GET /api/themes/:theme/:language/reels`.
- Provides backward compatibility for existing HTML‑based themes.

### 2.4 Reel List

- Each reel shows cover/video thumbnail, title, theme/lang, line count, duration.
- Checkbox toggles "On Landing" (POST `/api/reels/:id`).
- Clicking a reel selects it for preview.

---

## 3. Center Preview Area

### 3.1 Reel Preview (Iframe)

- `<iframe class="preview">` loads `/{API}/reels/:id/player?v=:nonce`.
- Supports `autoplay` attribute.
- Receives messages (`start`, `line`, `pause`, `end`, `audioblocked`) from the preview player.

### 3.2 Timeline

- **Horizontal band** with draggable line segments (`tl-line` buttons).
- Each segment represents a narration line; `left` = start offset, `width` = length.
- **Drag‑to‑move**: click‑drag any line segment to reposition it (changes `offset`, preserves length).
- **Visual feedback**: offset value shown below each segment (`tl-offset`).
- **Playhead**: follows the real player position; clamped to timeline bounds.
- **Missing audio warning**: red note if any line lacks narration.

### 3.3 Video Export

- Button "Export MP4" → starts polling `GET /api/reels/:id/export`.
- Progress bar shows `%` complete.
- On completion, `fetchReels()` refreshes the list (new `videoUrl`).

### 3.4 Audio Controls

- **Upload audio** per line: file input → `POST /api/reels/:id/lines/:lineId/audio`.
- Shows "Uploading…" state while request in flight.
- Replaces TTS‑generated audio with user recordings.

---

## 4. Right Audio Panel (`AudioPanel` component)

- **Per‑line audio**: play/pause, duration display, waveform visualization.
- **Global TTS generation**: "Generate all" button.
- **Voice selection** dropdown.
- **Music upload** and removal.
- **Try line** button: sends `fx-try` message to the preview iframe.

---

## 5. Referenced Files

| Path | Purpose |
|------|---------|
| `frontend/src/App.tsx` | Main app component: state, API calls, drawer, timeline, preview, export. |
| `frontend/src/studio.css` | AFS‑inspired dark theme: colors, drawer layout, timeline styling, typography. |
| `frontend/src/AudioPanel.tsx` | Right‑hand audio panel: per‑line controls, upload, TTS, waveform. |
| `frontend/src/useReelEditor.ts` | Custom hook: `useReelEditor` provides reel state, `handleEdit`, `saveState`, `generate`, `export`, etc. |
| `frontend/src/types.ts` | TypeScript interfaces: `Reel`, `StageLook`, `NarrationsMasterIndex`, etc. |
| `frontend/src/lib.ts` | Utility functions: `audition`, `errMsg`, `fmt`, `hue`, `lineState`. |
| `frontend/src/App.css` (if exists) | Additional component‑level styles. |
| `backend/src/index.ts` | API routes: `/api/reels`, `/api/narrations`, `/api/themes`, `/api/reels/:id/lines/:lineId/audio`, export, cover, music. |
| `backend/src/model.ts` | Type definitions for narration data (scenes, directions, mood, swatches). |
| `backend/sync-narrations.js` | Sync script that extracts narration text from HTML theme files into JSON (`data/narrations/`). |
| `data/narrations/` | Generated JSON narration index (themes → languages → reels → scenes). |
| `pages/TheAgentStands.html` | Static landing‑page HTML (see Section 6). |
| `frontend/vite.config.ts` | Vite dev config, proxying `/api` to the backend. |

---

## 6. Static Landing Page (`pages/TheAgentStands.html`)

The `pages/TheAgentStands.html` file is a **standalone static landing page** that serves as the public-facing entry point for the project. Its role is:

- **Marketing/presentation**: introduces "The Agent Takes the Stand" tech‑noir reel series.
- **Five episode cards** ( Episodes 01‑03 shown, more can be added ) with title, description, and "log" metadata.
- **Language switching** (English, Français, Español, Português, Italiano, Deutsch, Polski, Srpski) via a `<select>` that updates all text content and the `lang` attribute on `<html>`.
- **Hero section**: animated "lamp" background, SVG agent illustration, headline and tagline.
- **Responsive grid**: episode cards (`<div class="card">`) hover with lift effect and a revealing tag line.
- **No backend dependency**: pure HTML/CSS/JS; can be hosted anywhere (GitHub Pages, Netlify, etc.).
- **Translations**: embedded `translations` object; `updateLanguage(lang)` function swaps all text.
- **SEO**: `<title>`, `<meta charset>`, `<meta name="viewport">`, semantic headings.

**How it relates to the app:**

- The landing page is **separate** from the React app (`frontend/src/App.tsx`). It does not import any of the reel‑management logic.
- It provides a **public face** for the project, showcasing the reels concept before users access the full‑stack editor.
- The episode data (titles, descriptions) mirrors the kind of data managed inside the app's reels, but is static HTML rather than dynamic JSON.
- The language selector and translation mechanism in the landing page inspired the multilingual support later added to the app's narration browser and theme browser.

---

## 7. Functionalities & Capabilities

| Feature | Status | Description |
|---------|--------|-------------|
| **Reel creation** | ✅ | Title, theme, language via form. |
| **Import from narration JSON** | ✅ | AFS‑style left‑drawer browser; theme → language → reel → Import. |
| **Import from legacy HTML** | ✅ | Theme browser (HTML) section preserved. |
| **Text editing** | ✅ | Inline text per line (via `handleEdit`). |
| **TTS generation** | ✅ | Backend POST to local TTS service. |
| **Audio upload (replace TTS)** | ✅ | Per‑line `POST /api/reels/:id/lines/:lineId/audio`. |
| **Timeline drag‑to‑move** | ✅ | Reposition lines without changing length. |
| **Preview playback** | ✅ | Iframe player with playhead sync. |
| **Video export (FFmpeg)** | ✅ | `POST /api/reels/:id/export`; polls for completion. |
| **Cover image upload** | ✅ | `POST /api/reels/:id/cover`. |
| **Music upload** | ✅ | `POST /api/reels/:id/music`. |
| **On Landing toggle** | ✅ | Checkbox per reel for landing‑page inclusion. |
| **Multilingual support** | ✅ | Theme/languages dropdowns; narration JSON has language codes. |
| **Responsive drawer** | ✅ | Collapsible/expandable; resize handle. |
| **Progress tracking** | ✅ | Export job progress bar; "Uploading…" states. |

---

## 8. Design Review & Areas for Improvement

### Strengths

1. **Consistent AFS dark theme** – `studio.css` provides a cohesive, professional look matching the "Agent" branding.
2. **Drawer‑based navigation** – Keeps the UI compact; the left drawer houses all library/import functions without crowding the preview.
3. **Timeline drag‑to‑move** – Unique UX for repositioning narration lines; visual offset feedback is clear.
4. **Narration JSON system** – Eliminates runtime HTML parsing; makes data version‑control friendly and easy to translate.
5. **Multilingual support** – Both the static landing page and the app support multiple languages via dropdown/translation object.
6. **Progress & state management** – Uploading, generating, and exporting all show clear loading states and progress.

### Areas for Improvement

1. **Drawer collapse/expand** – Currently the drawer width is fixed at ~360 px with a resize handle. Adding a "collapse to icon-only" button would improve power‑user workflow.
2. **Timeline segment selection** – Dragging starts on any part of a line button. Dedicated small "grip" handles at the left end of each segment would reduce accidental moves and make the intent clearer.
3. **Keyboard accessibility** – Timeline segments are `<button>` elements, which is good, but:
   - Arrow‑key nudge (move selected line by 1 second) is not implemented.
   - Focus management when opening/closing the drawer could be more robust.
4. **Error handling for missing audio** – The warning line (`plan.missingAudio`) is present but could be more prominent (e.g., inline red text on each affected line).
5. **Mobile responsiveness** – The timeline becomes cramped on narrow screens. Consider:
   - Horizontal scroll on mobile.
   - A "compact" view that shows only line numbers and a simplified offset.
6. **Narration browser performance** – When many themes/languages/reels are loaded, the drawer rendering could benefit from virtualization (e.g., `react-virtual` or simple `windowing`).
7. **Language flag icons** – The language dropdown shows language codes (`en`, `es`, etc.). Adding small flag icons next to each option would improve UX, especially for non‑English speakers.
8. **Undo/Redo** – Timeline edits (drag‑to‑move, offset changes) lack an undo stack. Integrating a simple state history would be a quality‑of‑life improvement.
9. **Cover image preview** – When uploading a cover, there is no visual preview before saving. Adding a small preview would reduce mistakes.
10. **Export cancellation** – The export poll interval cannot be manually stopped without navigating away; a "Cancel export" button would be useful.

---

## 9. Suggested Next Steps

- Add **collapse/expand** button for the left drawer.
- Implement **dedicated drag grips** on timeline segments.
- Add **arrow‑key nudge** for timeline repositioning.
- Introduce **flag icons** in language dropdowns.
- Add **undo/Redo** support for timeline edits.
- Improve **mobile timeline** handling (horizontal scroll or compact view).
- Add **cover preview** before upload confirmation.
- Consider **virtualization** for the narration browser if the number of themes/languages grows.

---
*Document generated on 2026‑11‑25. Based on codebase revision with Phase 5‑7 fully delivered.*