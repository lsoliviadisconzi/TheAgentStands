// TTS client functions extracted from backend/src/index.ts
// Dependencies: axios, Voice, VoicesResponse, TTS_BASE, TTS_MGMT_BASE, TTS_ENDPOINTS, TTS_TIMEOUTS, VOICE_CACHE_TTL

import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Voice, VoicesResponse } from './tts-types';
import { 
  TTS_BASE, 
  TTS_MGMT_BASE, 
  TTS_ENDPOINTS, 
  TTS_TIMEOUTS, 
  VOICE_CACHE_TTL 
} from './tts-config';

// Voice cache (in-memory, 30 second TTL)
let voiceCache: { at: number; data: VoicesResponse } | null = null;

/**
 * List available voices.
 * Tries TTS Management server first (for designed voices),
 * falls back to raw MLX-Audio models.
 * 
 * @param force - Bypass cache and force refresh
 * @returns VoicesResponse with voices array, defaultId, source, and optional error
 */
export async function listVoices(force = false): Promise<VoicesResponse> {
  if (!force && voiceCache && Date.now() - voiceCache.at < VOICE_CACHE_TTL && voiceCache.data.voices.length) {
    return voiceCache.data;
  }

  let data: VoicesResponse;

  try {
    // Try TTS Management server first (port 3229) for designed voices
    const { data: j } = await axios.get(
      `${TTS_MGMT_BASE}${TTS_ENDPOINTS.MGMT.LIST_VOICES}`,
      { timeout: TTS_TIMEOUTS.LIST_VOICES }
    );

    const voices: Voice[] = (j.voices || [])
      .map((v: any) => ({
        id: String(v.id || ''),
        label: String(v.label || v.id || ''),
        model: String(v.model || ''),
        designModel: String(v.designModel || ''),
        kind: String(v.kind || 'designed'),
        instruct: String(v.instruct || ''),
        voice: String(v.voice || 'default'),
        langCode: String(v.langCode || ''),
        source: 'studio' as const,
        refine: v.refine || null,
        designId: String(v.designId || ''),
        refAudio: String(v.refAudio || v.ref_audio || v.referenceAudio || v.referenceAudioUrl || ''),
        refText: String(v.refText || v.ref_text || v.referenceText || ''),
      }))
      .filter((v: Voice) => v.id);

    await attachReferences(voices);

    data = {
      voices,
      defaultId: String(j.defaultId || voices[0]?.id || ''),
      source: 'studio',
    };
  } catch (studioErr) {
    try {
      // Fallback to raw MLX-Audio models (port 8771)
      const { data: j } = await axios.get(
        `${TTS_BASE}${TTS_ENDPOINTS.MLX.LIST_MODELS}`,
        { timeout: TTS_TIMEOUTS.LIST_VOICES }
      );

      const voices: Voice[] = (j?.data || []).map((m: any) => ({
        id: String(m.id),
        label: String(m.id),
        model: String(m.id),
        kind: 'model',
        instruct: '',
        voice: 'default',
        langCode: '',
        source: 'local' as const,
      }));

      data = {
        voices,
        defaultId: voices[0]?.id || '',
        source: 'local',
        error: `Studio voices unavailable (${TTS_MGMT_BASE}); showing raw TTS models.`,
      };
    } catch {
      data = {
        voices: [],
        defaultId: '',
        source: 'none',
        error: `No TTS service reachable at ${TTS_MGMT_BASE} or ${TTS_BASE}.`,
      };
    }
  }

  voiceCache = { at: Date.now(), data };
  return data;
}



/**
 * /api/book/tts-voices does not expose the reference audio / transcript, but
 * /api/book/voice-designs (the endpoint the voice manager page uses) does. Merge them in.
 * Mirrors serve.py: reference audio + referenceText, else fall back to the preview + sample.
 */
async function attachReferences(voices: Voice[]): Promise<void> {
  if (!voices.some((v) => v.kind === 'designed' && !v.refAudio)) return;
  try {
    const { data: j } = await axios.get(`${TTS_MGMT_BASE}/api/book/voice-designs`, {
      timeout: TTS_TIMEOUTS.LIST_VOICES,
    });
    const list: any[] = Array.isArray(j) ? j : j?.designs || j?.voices || [];
    const byId = new Map<string, any>(list.map((d) => [String(d.id || d.designId || ''), d]));
    for (const v of voices) {
      if (v.kind !== 'designed' || v.refAudio) continue;
      const d = byId.get(v.designId || v.id.replace(/^design::/, ''));
      if (!d) continue;
      const refFile = d.referenceAudioFile ? `/book_files/_voice-designs/${d.referenceAudioFile}` : '';
      const audio = d.referenceAudioUrl || refFile;
      if (audio && d.referenceText) {
        v.refAudio = String(audio);
        v.refText = String(d.referenceText);
      } else if (d.previewUrl && d.sample) {
        v.refAudio = String(d.previewUrl); // same fallback serve.py uses
        v.refText = String(d.sample);
      }
    }
  } catch (e) {
    console.warn('[tts] could not load /api/book/voice-designs:', (e as Error).message);
  }
}

/** refine field -> request field, with the default that is omitted (same table as Book Studio) */
const REFINE_MAP: [string, string, unknown][] = [
  ['rate', 'speed', 1],
  ['pitch', 'pitch', 0],
  ['energy', 'energy', 0.5],
  ['reverb', 'reverb', 0],
  ['echo', 'echo_ms', 0],
  ['pan', 'pan', 0],
  ['ensemble', 'ensemble', 'solo'],
  ['ensembleCount', 'ensemble_count', 1],
];

/**
 * The MLX server must be able to open the reference audio. Absolute paths are used as-is;
 * http(s) URLs and /api/... paths (served by the management server) are downloaded to a
 * content-hashed temp file first.
 */
async function resolveRefAudio(ref: string): Promise<string> {
  let url = '';
  if (/^https?:\/\//i.test(ref)) url = ref;
  else if (ref.startsWith('/api/') || ref.startsWith('/book_files/')) url = `${TTS_MGMT_BASE}${ref}`;

  if (!url) {
    if (!fs.existsSync(ref)) throw new Error(`Reference audio not found on disk: ${ref}`);
    return ref;
  }
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: TTS_TIMEOUTS.LIST_VOICES * 5, validateStatus: () => true });
  if (r.status >= 400) throw new Error(`Could not download reference audio (${r.status}): ${url}`);
  const buf = Buffer.from(r.data);
  if (!buf.length) throw new Error(`Reference audio is empty: ${url}`);
  const dir = path.join(os.tmpdir(), 'tts-ref-cache');
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(new URL(url).pathname) || '.wav';
  const file = path.join(dir, crypto.createHash('sha1').update(buf).digest('hex') + ext);
  if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
  return file;
}

/** Stable fingerprint of everything that decides how a voice sounds (use it in cache keys). */
export function voiceFingerprint(v: Voice): string {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify([v.id, v.model, v.refAudio, v.refText, v.instruct, v.langCode, v.refine || null]))
    .digest('hex')
    .slice(0, 12);
}

/**
 * Designed voices. The MLX server has no named voices, so the voice IS the request:
 * reference audio + exact transcript (+ instruct, language, refine). Same payload Book Studio sends.
 */
async function speakDesigned(text: string, v: Voice): Promise<Buffer> {
  // Mirrors serve.py (_book_audio_post). The Qwen Base model clones from reference audio;
  // any other designed voice is driven by its instruct text with the default voice.
  const isClone = /Qwen3-TTS.*Base/i.test(v.model);

  const body: Record<string, unknown> = {
    model: v.model,
    input: text,
    text,
    response_format: 'mp3',
  };
  if (v.langCode) {
    body.language = v.langCode;
    body.lang_code = v.langCode;
  }

  if (isClone) {
    if (!v.refAudio || !v.refText) {
      throw new Error(
        `Voice "${v.label}" has no reference audio / transcript, so it cannot be reproduced. ` +
        `Refusing to generate with an unresolved voice.`
      );
    }
    body.ref_audio = await resolveRefAudio(v.refAudio);
    body.ref_text = v.refText;
    // serve.py removes instruct and sends no voice on this path.
  } else {
    body.voice = v.voice || 'default';
    if (v.instruct) body.instruct = v.instruct;
  }

  const refine = v.refine && typeof v.refine === 'object' ? v.refine : {};
  for (const [field, out, def] of REFINE_MAP) {
    const val = (refine as any)[field];
    if (val !== undefined && val !== null && val !== def) body[out] = val;
  }
  const params = (refine as any).params;
  if (params && typeof params === 'object' && Object.keys(params).length) body.params = params;

  if (process.env.TTS_DEBUG) {
    console.log('[tts] designed voice', v.id, JSON.stringify({ ...body, input: String(text).slice(0, 60), text: undefined }));
  }

  return postSpeech(`${TTS_BASE}${TTS_ENDPOINTS.MLX.SPEECH}`, body);
}

async function postSpeech(url: string, body: Record<string, unknown>): Promise<Buffer> {
  const response = await axios.post(url, body, {
    responseType: 'arraybuffer',
    timeout: TTS_TIMEOUTS.SPEECH,
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    let msg = `${response.status}`;
    try {
      const errorData = JSON.parse(Buffer.from(response.data).toString('utf-8'));
      msg = errorData.error || errorData.detail || msg;
    } catch { /* not JSON */ }
    throw new Error(`TTS failed: ${String(msg).slice(0, 200)}`);
  }
  const buf = Buffer.from(response.data);
  if (!buf.length) throw new Error('The voice server returned empty audio.');
  return buf;
}

/**
 * Generate speech audio from text using the specified voice.
 * 
 * @param text - Text to synthesize
 * @param v - Voice configuration
 * @returns Audio buffer (MP3 format)
 * @throws Error if TTS fails or returns empty audio
 */
export async function speak(text: string, v: Voice): Promise<Buffer> {
  if (v.kind === 'designed') return speakDesigned(text, v);

  const body: Record<string, unknown> = {
    model: v.model,
    input: text,
    voice: v.kind === 'designed' ? v.id : v.voice || 'default',
    response_format: 'mp3',
  };

  // For designed voices, the instruction is baked into the voice design
  // Don't send instruct parameter for designed voices
  if (v.instruct && v.kind !== 'designed') {
    body.instruct = v.instruct;
  }
  if (v.kind !== 'designed' && v.langCode) {
    body.lang_code = v.langCode;
  }

  // Determine which endpoint to use:
  // - Designed voices: call MLX-Audio directly with their base model
  // - Studio voices (non-designed): call TTS Management server
  // - Local models: call MLX-Audio directly
  const url = v.kind === 'designed'
    ? `${TTS_BASE}${TTS_ENDPOINTS.MLX.SPEECH}`
    : v.source === 'studio'
      ? `${TTS_MGMT_BASE}${TTS_ENDPOINTS.MGMT.SPEECH}`
      : `${TTS_BASE}${TTS_ENDPOINTS.MLX.SPEECH}`;

  const response = await axios.post(url, body, {
    responseType: 'arraybuffer',
    timeout: TTS_TIMEOUTS.SPEECH,
    validateStatus: () => true,  // Don't throw on non-2xx, handle manually
  });

  if (response.status >= 400) {
    let msg = `${response.status}`;
    try {
      const errorData = JSON.parse(Buffer.from(response.data).toString('utf-8'));
      msg = errorData.error || errorData.detail || msg;
    } catch {
      // Response body is not JSON
    }
    throw new Error(`TTS failed: ${String(msg).slice(0, 200)}`);
  }

  const buf = Buffer.from(response.data);
  if (!buf.length) {
    throw new Error('The voice server returned empty audio.');
  }

  return buf;
}

/**
 * Probe audio file duration using ffprobe.
 * 
 * @param file - Path to audio file
 * @returns Duration in milliseconds
 * @throws Error if ffprobe fails or returns invalid duration
 */
export async function probeDurationMs(file: string): Promise<number> {
  const { execFile } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      (err, out) => {
        const s = parseFloat(String(out).trim());
        if (err || !Number.isFinite(s)) {
          reject(new Error('ffprobe could not read the generated audio'));
        } else {
          resolve(Math.round(s * 1000));
        }
      }
    );
  });
}

/**
 * Clear the voice cache (useful for testing or after config change)
 */
export function clearVoiceCache(): void {
  voiceCache = null;
}

/**
 * Get current voice cache status (for debugging)
 */
export function getVoiceCacheStatus(): { cached: boolean; age: number; count: number } | null {
  if (!voiceCache) return null;
  return {
    cached: true,
    age: Date.now() - voiceCache.at,
    count: voiceCache.data.voices.length,
  };
}