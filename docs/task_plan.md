# Project Plan: Reel Management with TTS

## Goal
Create a full‑stack web application that lets users manage "reels" (short video clips), generate and link TTS narrations, edit reel text, and export the final video as MP4. The landing page shows selectable reels; users can enable/disable them for the landing page. All metadata and assets are stored in JSON files.

## Tech Stack
- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, TypeScript, Vite
- **Storage**: JSON files in `data/`
- **TTS**: Existing local service (see `tts-api.json` and `tts-management.html`)
- **Video Export**: FFmpeg (invoked via a Node child process)

## Phases
| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Initialize repo, add package.json for backend and frontend, set up TypeScript configs. | completed |
| 2 | Design data model (reel JSON schema) and create storage directory. | completed |
| 3 | Implement backend API endpoints: list reels, create reel, update text, trigger TTS generation, export MP4. | completed |
| 4 | Integrate with local TTS service (POST to `/tts` using config from `tts-api.json`). | completed |
| 5 | Implement video composition using FFmpeg (concatenate background, overlay narration, add optional cover image). | completed |
| 6 | Build frontend UI: landing page showing reels, edit modal, TTS generation button, export button. | completed |
| 7 | End‑to‑end testing, error handling, documentation. | completed |

## Next Steps
- Phase 5 complete: richer ffmpeg composition now supports optional cover image (loop 1) and fallback black background; cover upload endpoint added.
- Phase 6 complete: frontend UI built with React + Vite; allows creating reels, selecting voices from TTS service, generating TTS narration, exporting MP4 (with cover if provided), uploading cover images, and deleting reels.
- Phase 7 complete: added theme browser with theme/language selection dropdowns, backend endpoints for themes/languages/reels parsing, and landing page preview.

## Theme Browser (New Feature)
- Backend endpoints:
  - `GET /api/themes` - lists available theme folders
  - `GET /api/themes/:theme/languages` - lists available language HTML files for a theme
  - `GET /api/themes/:theme/:language/reels` - parses the R array from HTML files and returns reel data
- Frontend UI:
  - Theme dropdown (Agent, Colors)
  - Language dropdown (en, es, fr, etc.)
  - Reel list with title, hook, script preview
  - Import button to add reels to the collection
  - Landing page preview showing enabled reels
  - Toggle "On Landing" for each reel

## Narration JSON System (NEW - AFS-style)
- **Sync script**: `backend/sync-narrations.js` extracts narration text from HTML theme files into JSON
- **Data structure**: `data/narrations/{theme-slug}/{language}/{reel-slug}.json` with full scene data
- **Master index**: `data/narrations/index.json` lists all themes with languages
- **Backend endpoints**:
  - `GET /api/narrations` - lists all narration themes with language counts
  - `GET /api/narrations/:themeSlug` - theme metadata + languages with reel counts
  - `GET /api/narrations/:themeSlug/:language` - language metadata + reel list (title, hook, sceneCount)
  - `GET /api/narrations/:themeSlug/:language/:reelSlug` - full reel with all scenes
  - `POST /api/reels/import-narration` - imports a narration reel with all scenes pre-filled
- **Frontend UI (AFS-style left drawer)**:
  - **Narrations section** (replaces legacy Theme browser):
    - Theme dropdown showing all themes with language counts
    - Language dropdown showing languages with reel counts
    - Reel list showing title, hook, and scene count
    - Click "Import" to create reel with full narration text pre-filled
  - Legacy "Theme browser (HTML)" section preserved for backward compatibility
- **Benefits**:
  - No more extracting text from HTML files at runtime
  - JSON files are easy to edit, version control, and translate
  - Each scene has direction, text, mood, panel lines, hold time, swatches
  - Matches AFS pattern: themes → languages → reels → scenes

## Files Created/Modified
- `frontend/src/studio.css` - AFS-inspired dark theme with drawer layout
- `frontend/src/App.tsx` - Enhanced with narration browser
- `backend/src/model.ts` - Added narration types and functions
- `backend/src/index.ts` - Added narration API endpoints
- `backend/sync-narrations.js` - Sync script (run once)
- `data/narrations/` - Generated JSON narration files
- `frontend/src/types.ts` - Added narration TypeScript interfaces

---
*Update this file after each phase changes status.*