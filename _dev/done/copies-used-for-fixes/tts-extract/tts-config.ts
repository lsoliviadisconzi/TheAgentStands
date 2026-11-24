// TTS server configuration extracted from backend/src/index.ts

/**
 * Default TTS server URLs
 * Override via environment variables:
 * - TTS_BASE_URL: MLX-Audio server (default: http://127.0.0.1:8771)
 * - TTS_MGMT_BASE_URL: TTS Management server (default: http://127.0.0.1:3229)
 */
export const DEFAULT_TTS_BASE = 'http://127.0.0.1:8771';
export const DEFAULT_TTS_MGMT_BASE = 'http://127.0.0.1:3229';

/**
 * Resolved TTS server URLs from environment or defaults
 */
export const TTS_BASE = process.env.TTS_BASE_URL || DEFAULT_TTS_BASE;
export const TTS_MGMT_BASE = process.env.TTS_MGMT_BASE_URL || DEFAULT_TTS_MGMT_BASE;

/**
 * API endpoints on each server
 */
export const TTS_ENDPOINTS = {
  // TTS Management server (port 3229) - designed voices
  MGMT: {
    LIST_VOICES: '/api/book/tts-voices',     // GET - returns { voices: [], defaultId: "" }
    SPEECH: '/api/tts/speech',                // POST - generate speech for designed voices
  },
  // MLX-Audio server (port 8771) - raw models
  MLX: {
    LIST_MODELS: '/v1/models',                // GET - returns { data: [{ id: "model-name" }] }
    SPEECH: '/v1/audio/speech',               // POST - generate speech (OpenAI-compatible)
  },
} as const;

/**
 * Default timeouts
 */
export const TTS_TIMEOUTS = {
  LIST_VOICES: 4000,      // 4 seconds for voice listing
  SPEECH: 240000,         // 4 minutes for speech generation
} as const;

/**
 * Voice cache TTL (30 seconds)
 */
export const VOICE_CACHE_TTL = 30000;

/**
 * Build full URL for a TTS endpoint
 */
export function buildTtsUrl(server: 'mgmt' | 'mlx', endpoint: string): string {
  const base = server === 'mgmt' ? TTS_MGMT_BASE : TTS_BASE;
  return `${base}${endpoint}`;
}