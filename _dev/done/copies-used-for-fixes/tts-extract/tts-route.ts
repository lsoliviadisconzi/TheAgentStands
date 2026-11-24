// TTS generation route extracted from backend/src/index.ts
// This is the POST /api/reels/:id/lines/:lineId/tts endpoint
// Dependencies: express, fs, path, axios, lineKey, getReel, updateReel, DATA_DIR, MEDIA_URL, serialize, listVoices, speak, probeDurationMs

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

// These would be imported from the main model/index in the actual app
// import { DATA_DIR, MEDIA_URL, Reel, Line, getReel, updateReel, lineKey, serialize } from './model';
// import { listVoices, speak, probeDurationMs } from './tts-client';

// Placeholder types for standalone reference
interface LineAudio {
  file: string;
  durationMs: number;
  key: string;
  voiceLabel?: string;
  voiceId?: string;
  text?: string;
}

interface Line {
  id: string;
  s: string;
  h: number;
  d?: string;
  m?: string;
  log?: string[];
  sw?: [string, string][];
  voiceId?: string;
  offset?: number;
  audio?: LineAudio;
}

interface Reel {
  id: string;
  title: string;
  theme: string;
  lang: string;
  hook: string;
  stamp: string;
  next: string;
  lines: Line[];
  music?: any;
  coverFile?: string;
  coverAuto?: boolean;
  videoFile?: string;
  onLanding: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

interface Voice {
  id: string;
  label: string;
  model: string;
  designModel?: string;
  kind: string;
  instruct: string;
  voice: string;
  langCode: string;
  source: 'studio' | 'local';
  refine?: Record<string, any> | null;
}

// Async error wrapper for Express routes
const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => 
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

const P = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

/**
 * TTS Generation Route
 * 
 * POST /api/reels/:id/lines/:lineId/tts
 * 
 * Generates (or regenerates) narration for a single line using the chosen voice.
 * 
 * Request body:
 *   - voiceId: string (required) - Voice to use for generation
 *   - text?: string (optional) - On-screen text to use instead of saved text.
 *     This allows generating from unsaved edits.
 * 
 * Response: Serialized Reel with updated line.audio
 * 
 * Key behaviors:
 * - Uses on-screen text if provided (wins over debounced autosave)
 * - Stores text hash (key) to detect stale audio later
 * - Cleans up old audio file when regenerating
 * - Updates line.s with the text that was actually spoken
 * - Returns 409 if line was deleted during generation
 */
export function createTtsRoute(
  getReelFn: (id: string) => Reel | null,
  updateReelFn: (id: string, fn: (r: Reel) => void) => Reel | null,
  lineKeyFn: (text: string, voiceId?: string) => string,
  serializeFn: (r: Reel) => any,
  dataDir: string,
  mediaUrl: string,
  listVoicesFn: () => Promise<{ voices: Voice[]; defaultId: string }>,
  speakFn: (text: string, v: Voice) => Promise<Buffer>,
  probeDurationFn: (file: string) => Promise<number>
) {
  return wrap(async (req: Request, res: Response) => {
    const reelId = P(req.params.id);
    const lineId = P(req.params.lineId);
    
    const reel = getReelFn(reelId);
    const line = reel?.lines.find((l) => l.id === lineId);
    
    if (!reel || !line) {
      return res.status(404).json({ error: 'Reel or line not found' });
    }

    const voiceId = String(req.body?.voiceId || line.voiceId || '');
    // Use on-screen text if provided, otherwise fall back to saved text
    const text = (typeof req.body?.text === 'string' ? req.body.text : line.s).trim();
    
    if (!text) {
      return res.status(400).json({ error: 'This line has no text yet.' });
    }

    const { voices } = await listVoicesFn();
    const voice = voices.find((v) => v.id === voiceId);
    
    if (!voice) {
      return res.status(400).json({ error: 'Choose a voice first.' });
    }

    // Generate content hash for stale detection
    const key = lineKeyFn(text, voice.id);
    const rel = `audio/${reelId}/${lineId}-${key}.mp3`;
    const abs = path.join(dataDir, rel);
    
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const isNewFile = !fs.existsSync(abs);
    
    let durationMs: number;
    try {
      // Generate audio and save to file
      fs.writeFileSync(abs, await speakFn(text, voice));
      durationMs = await probeDurationFn(abs);
    } catch (e) {
      // Clean up on failure
      if (isNewFile) fs.rmSync(abs, { force: true });
      throw e;
    }

    let applied = false;
    const updated = updateReelFn(reelId, (r) => {
      const l = r.lines.find((x) => x.id === lineId);
      if (!l) return; // Line was deleted while generating
      
      // Clean up old audio file if different
      if (l.audio && l.audio.file !== rel) {
        fs.rmSync(path.join(dataDir, l.audio.file), { force: true });
      }
      
      // Update line with generated audio info
      l.s = text;                    // Store the text that was actually spoken
      l.voiceId = voice.id;          // Remember which voice was used
      l.audio = {
        file: rel,
        durationMs,
        key,
        voiceId: voice.id,
        text,
        voiceLabel: voice.label.replace(/\s*·\s*designed voice$/i, ''),
      };
      applied = true;
    });

    if (!updated) {
      if (isNewFile) fs.rmSync(abs, { force: true });
      return res.status(404).json({ error: 'Reel was deleted while generating.' });
    }
    
    if (!applied) {
      if (isNewFile) fs.rmSync(abs, { force: true });
      return res.status(409).json({ error: 'That line was removed while its narration was generating.' });
    }

    res.json(serializeFn(updated));
  });
}

/**
 * Voices List Route
 * 
 * GET /api/tts/voices
 * Query: ?refresh=1 to bypass cache
 * 
 * Returns: VoicesResponse { voices, defaultId, source, error? }
 */
export function createVoicesRoute(listVoicesFn: (force?: boolean) => Promise<any>) {
  return wrap(async (req: Request, res: Response) => {
    const force = req.query.refresh === '1';
    res.json(await listVoicesFn(force));
  });
}