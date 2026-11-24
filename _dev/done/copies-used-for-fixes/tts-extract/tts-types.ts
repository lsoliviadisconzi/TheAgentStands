// TTS-related type definitions extracted from backend/src/index.ts

/**
 * Voice configuration as returned by the TTS management server
 * or derived from raw MLX-Audio models.
 */
export interface Voice {
  id: string;
  label: string;
  model: string;
  designModel?: string;
  kind: string;                    // 'designed' | 'model'
  instruct: string;                // System prompt for the voice
  voice: string;                   // Voice identifier for MLX-Audio
  langCode: string;                // Language code (e.g., 'en', 'it')
  source: 'studio' | 'local';      // Where the voice came from
  refine?: Record<string, any> | null;  // Optional refinement parameters
  /** Designed voices: id of the saved design in the voice manager */
  designId?: string;
  /** Designed voices: reference audio (absolute path, http(s) URL, or /api/... path on the mgmt server) */
  refAudio?: string;
  /** Designed voices: exact transcript of the reference audio */
  refText?: string;
}

/**
 * Response from the voices listing endpoint
 */
export interface VoicesResponse {
  voices: Voice[];
  defaultId: string;
  source: 'studio' | 'local' | 'none';
  error?: string;
}

/**
 * Cached voices data with timestamp
 */
export interface VoiceCache {
  at: number;
  data: VoicesResponse;
}

/**
 * TTS generation request body (for /api/reels/:id/lines/:lineId/tts)
 */
export interface TtsGenerateRequest {
  voiceId: string;
  text?: string;    // Optional: on-screen text overrides saved text
}

/**
 * TTS generation response (serialized Reel with updated line)
 */
export interface TtsGenerateResponse {
  // ... Reel fields with updated line.audio
}

/**
 * Configuration for TTS server connections
 */
export interface TtsConfig {
  /** Base URL for MLX-Audio server (default: http://127.0.0.1:8771) */
  ttsBaseUrl: string;
  /** Base URL for TTS Management server (default: http://127.0.0.1:3229) */
  ttsMgmtBaseUrl: string;
  /** Cache TTL for voices list (default: 30000ms) */
  voiceCacheTtl: number;
  /** Request timeout for voice listing (default: 4000ms) */
  listVoicesTimeout: number;
  /** Request timeout for speech generation (default: 240000ms) */
  speakTimeout: number;
}