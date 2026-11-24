# TTS Extraction Module

Extracted TTS (Text-to-Speech) functionality from the TheAgentStands backend. This module provides a standalone, reusable implementation of the TTS generation pipeline that integrates with MLX-Audio and TTS Management servers.

## Files

| File | Description |
|------|-------------|
| `tts-types.ts` | TypeScript interfaces for Voice, VoicesResponse, TtsConfig, etc. |
| `tts-config.ts` | Server URLs, endpoints, timeouts, and URL builders |
| `tts-client.ts` | Core client functions: `listVoices()`, `speak()`, `probeDurationMs()` |
| `tts-route.ts` | Express route handlers: `createTtsRoute()`, `createVoicesRoute()` |
| `index.ts` | Main entry point with usage examples |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      TTS Generation                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   POST /api/reels/:id/lines/:lineId/tts                      │
│                      │                                       │
│                      ▼                                       │
│   ┌─────────────────────────────────────────┐               │
│   │ 1. Resolve voice from voiceId            │               │
│   │    (via listVoices() with cache)         │               │
│   └─────────────────────────────────────────┘               │
│                      │                                       │
│                      ▼                                       │
│   ┌─────────────────────────────────────────┐               │
│   │ 2. Build request body                    │               │
│   │    - model, input (text), voice          │               │
│   │    - instruct (non-designed only)        │               │
│   │    - lang_code (non-designed only)       │               │
│   └─────────────────────────────────────────┘               │
│                      │                                       │
│                      ▼                                       │
│   ┌─────────────────────────────────────────┐               │
│   │ 3. Select endpoint                       │               │
│   │    - Designed → MLX /v1/audio/speech     │               │
│   │    - Studio (non-designed) → MGMT        │               │
│   │    - Local → MLX /v1/audio/speech        │               │
│   └─────────────────────────────────────────┘               │
│                      │                                       │
│                      ▼                                       │
│   ┌─────────────────────────────────────────┐               │
│   │ 4. POST with arraybuffer response        │               │
│   │    4 min timeout, validateStatus: true   │               │
│   └─────────────────────────────────────────┘               │
│                      │                                       │
│                      ▼                                       │
│   ┌─────────────────────────────────────────┐               │
│   │ 5. Save MP3, probe duration (ffprobe)   │               │
│   │    Return Buffer                         │               │
│   └─────────────────────────────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Server Endpoints

### TTS Management Server (port 3229)
- `GET /api/book/tts-voices` — List designed voices with metadata
- `POST /api/tts/speech` — Generate speech for studio voices

### MLX-Audio Server (port 8771)
- `GET /v1/models` — List available models
- `POST /v1/audio/speech` — OpenAI-compatible speech generation

## Voice Resolution Logic

```typescript
// Designed voices (kind === 'designed'):
//   → Call MLX-Audio directly with base model
//   → Voice ID is the designed voice ID
//   → No instruct parameter (baked into design)

// Studio voices (source === 'studio', kind !== 'designed'):
//   → Call TTS Management server
//   → Includes instruct and lang_code

// Local models (source === 'local'):
//   → Call MLX-Audio directly
//   → Model ID = voice ID
```

## Usage

### As Express Routes

```typescript
import express from 'express';
import { 
  createTtsRoute, 
  createVoicesRoute,
  listVoices,
  speak,
  probeDurationMs,
  lineKey  // from model.ts
} from './tts-extract';

const app = express();

app.get('/api/tts/voices', createVoicesRoute(listVoices));

app.post('/api/reels/:id/lines/:lineId/tts', createTtsRoute(
  getReel,           // (id) => Reel | null
  updateReel,        // (id, fn) => Reel | null
  lineKey,           // (text, voiceId) => string
  serialize,         // (reel) => object
  DATA_DIR,          // string
  MEDIA_URL,         // string
  listVoices,
  speak,
  probeDurationMs
));
```

### Direct Usage

```typescript
import { listVoices, speak, clearVoiceCache } from './tts-extract';

// List voices (cached for 30s)
const { voices, defaultId, source, error } = await listVoices();

// Force refresh
const fresh = await listVoices(true);

// Generate speech
const voice = voices.find(v => v.id === 'my-voice-id');
if (voice) {
  const mp3Buffer = await speak('Hello, world!', voice);
  // Save to file, stream to client, etc.
}

// Clear cache if needed
clearVoiceCache();
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TTS_BASE_URL` | `http://127.0.0.1:8771` | MLX-Audio server URL |
| `TTS_MGMT_BASE_URL` | `http://127.0.0.1:3229` | TTS Management server URL |

## Dependencies

- `axios` — HTTP client
- `ffprobe` (system) — Audio duration probing
- `crypto` (builtin) — SHA1 hashing for stale detection (via `lineKey`)

## Key Features

1. **Dual-server support** — Seamlessly falls back from TTS Management to MLX-Audio
2. **Smart caching** — 30-second TTL for voice listings
3. **Stale detection** — Content hash (SHA1 of `text|voiceId`) tracks when regeneration needed
4. **On-screen text priority** — Generation uses request body text over saved text
5. **Cleanup** — Automatic old audio removal on regeneration
6. **Error handling** — Detailed errors with server response parsing
7. **Timeout management** — 4s for listing, 4min for generation