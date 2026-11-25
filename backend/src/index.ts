import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import axios from 'axios';
import multer from 'multer';
import cors from 'cors';
import {
  DATA_DIR, PAGES_DIR, MEDIA_URL, Reel, Line, newId, lineKey, isStale, planReel, loadReels, getReel, updateReel,
  addReel, removeReel, listThemes, listLanguages, themeFile, parseThemeFile, themeReelToReel, buildPlayerHtml,
  listNarrationThemes, getNarrationTheme, getNarrationLanguage, getNarrationReel, narrationReelToReel, NARRATIONS_DIR,
  ensureCues,
} from './model';
import { renderReel } from './render';
import { catalogForClient, cleanFx } from './stagefx';

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(MEDIA_URL, express.static(DATA_DIR)); // audio / video / cover files, reachable through Vite's /api proxy
app.use('/pages', express.static(PAGES_DIR)); // e.g. http://localhost:4000/pages/TheAgentStands.html
app.use('/api/narrations/files', express.static(NARRATIONS_DIR)); // narration JSON files

const P = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';
const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

/* ------------------------------------------------------------ serialising */

function serialize(r: Reel) {
  const plan = planReel(r);
  return {
    ...r,
    lines: r.lines.map((l) => ({
      ...l,
      audio: l.audio ? { ...l.audio, url: `${MEDIA_URL}/${l.audio.file}` } : undefined,
      stale: isStale(l),
    })),
    music: r.music ? { ...r.music, url: `${MEDIA_URL}/${r.music.file}` } : undefined,
    coverUrl: r.coverFile ? `${MEDIA_URL}/${r.coverFile}?v=${r.updatedAt}` : undefined,
    videoUrl: r.videoFile ? `${MEDIA_URL}/${r.videoFile}?v=${r.updatedAt}` : undefined,
    plan,
  };
}

/* ------------------------------------------------------------- stage effects */
// Moods, lamp behaviours, colours, room tints and props the studio can offer (ids + labels only).
app.get('/api/stagefx', (_req, res) => res.json(catalogForClient()));

/* ----------------------------------------------------------------- themes */

app.get('/api/themes', (_req, res) => res.json(listThemes()));
app.get('/api/themes/:theme/languages', (req, res) => {
  const langs = listLanguages(P(req.params.theme));
  if (!langs.length) return res.status(404).json({ error: 'Theme not found' });
  res.json(langs);
});
app.get('/api/themes/:theme/:language/reels', (req, res) => {
  const f = themeFile(P(req.params.theme), P(req.params.language));
  if (!f) return res.status(404).json({ error: 'File not found' });
  try {
    res.json(parseThemeFile(f)); // { title, sub, reels: [...] }  (any number of reels)
  } catch (e) {
    res.status(500).json({ error: 'Failed to parse reels data', details: String(e) });
  }
});

/* ---------------------------------------------------------------- narrations */

app.get('/api/narrations', (_req, res) => {
  const themes = listNarrationThemes();
  const themesMap: Record<string, { title: string; languages: string[] }> = {};
  for (const t of themes) themesMap[t.slug] = { title: t.title, languages: t.languages };
  res.json({ themes: themesMap });
});

app.get('/api/narrations/:themeSlug', (req, res) => {
  const theme = getNarrationTheme(P(req.params.themeSlug));
  if (!theme) return res.status(404).json({ error: 'Theme not found' });
  res.json(theme);
});

app.get('/api/narrations/:themeSlug/:language', (req, res) => {
  const lang = getNarrationLanguage(P(req.params.themeSlug), P(req.params.language));
  if (!lang) return res.status(404).json({ error: 'Language not found' });
  res.json(lang);
});

app.get('/api/narrations/:themeSlug/:language/:reelSlug', (req, res) => {
  const reel = getNarrationReel(P(req.params.themeSlug), P(req.params.language), P(req.params.reelSlug));
  if (!reel) return res.status(404).json({ error: 'Reel not found' });
  res.json(reel);
});

// Import one reel from narrations JSON, keeping its full structure
app.post('/api/reels/import-narration', (req, res) => {
  const { themeSlug, language, reelSlug } = req.body || {};
  const nr = getNarrationReel(String(themeSlug), String(language), String(reelSlug));
  if (!nr) return res.status(404).json({ error: 'Narration reel not found' });
  // Find original theme name for the reel
  const themeIndex = getNarrationTheme(String(themeSlug));
  const originalTheme = themeIndex?.theme || themeSlug;
  const reel = narrationReelToReel(originalTheme, String(language), nr, loadReels().length);
  addReel(reel);
  res.status(201).json(serialize(reel));
});

/* ------------------------------------------------------------------ reels */

app.get('/api/reels', (_req, res) => res.json(loadReels().map(serialize)));

app.get('/api/landing', (_req, res) =>
  res.json(loadReels().filter((r) => r.onLanding && r.videoFile).sort((a, b) => a.order - b.order).map(serialize))
);

// Import one reel from a theme file, keeping its full structure (lines, moods, panels, stamp, next...).
app.post('/api/reels/import', (req, res) => {
  const { theme, lang, index } = req.body || {};
  const f = themeFile(String(theme), String(lang));
  if (!f) return res.status(404).json({ error: 'Theme file not found' });
  const parsed = parseThemeFile(f);
  const tr = parsed.reels[Number(index)];
  if (!tr) return res.status(404).json({ error: 'Reel index out of range' });
  const reel = themeReelToReel(String(theme), String(lang), tr, loadReels().length);
  addReel(reel);
  res.status(201).json(serialize(reel));
});

app.post('/api/reels', (req, res) => {
  const { title, theme, lang } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const now = Date.now();
  const reel: Reel = {
    id: 'r' + now.toString(36) + newId().slice(0, 3),
    title: String(title), theme: String(theme || ''), lang: String(lang || 'en'),
    hook: String(title), stamp: '', next: '',
    lines: [{ id: newId(), s: '', h: 1000 }],
    onLanding: false, order: loadReels().length, createdAt: now, updatedAt: now,
  };
  addReel(reel);
  res.status(201).json(serialize(reel));
});

app.get('/api/reels/:id', (req, res) => {
  const r = getReel(P(req.params.id));
  return r ? res.json(serialize(r)) : res.status(404).json({ error: 'Not found' });
});

app.put('/api/reels/:id', (req, res) => {
  const b = req.body || {};
  const r = updateReel(P(req.params.id), (reel) => {
    for (const k of ['title', 'hook', 'stamp', 'next', 'theme', 'lang'] as const) if (typeof b[k] === 'string') reel[k] = b[k];
    if (typeof b.onLanding === 'boolean') reel.onLanding = b.onLanding;
    if (Number.isFinite(b.order)) reel.order = b.order;
    if (b.music && reel.music && Number.isFinite(b.music.volume)) reel.music.volume = Math.max(0, Math.min(1, b.music.volume));
    if (Array.isArray(b.lines) && b.lines.length) { // never wipe a reel down to zero lines
      const old = new Map(reel.lines.map((l) => [l.id, l]));
      reel.lines = (b.lines as Partial<Line>[]).map((n) => {
        // Audio is only ever set by the TTS endpoint, never by the client; keep what the server already has.
        const prev = old.get(String(n.id));
        const clientId = /^[\w-]{3,40}$/.test(String(n.id)) ? String(n.id) : '';
        return {
          id: prev ? prev.id : clientId || newId(), // new lines keep the id the studio gave them
          s: String(n.s ?? ''),
          h: Number.isFinite(n.h) ? Math.max(0, Number(n.h)) : 1000,
          ...(Number.isFinite(n.offset) && Number(n.offset) > 0 ? { offset: Math.round(Number(n.offset)) } : {}), // was silently dropped
          ...(n.d ? { d: String(n.d) } : {}),
          ...(n.m ? { m: String(n.m) } : {}),
          ...(cleanFx(n.fx) ? { fx: cleanFx(n.fx) } : {}), // whitelisted ids only
          ...(Array.isArray(n.log) && n.log.length ? { log: n.log.map(String) } : {}),
          ...(Array.isArray(n.sw) && n.sw.length ? { sw: n.sw } : {}),
          ...(n.voiceId ? { voiceId: String(n.voiceId) } : {}),
          ...(n.ttsInstruct ? { ttsInstruct: String(n.ttsInstruct) } : {}),
          ...(Number.isFinite(n.ttsSpeed) && Number(n.ttsSpeed) > 0 && Number(n.ttsSpeed) !== 1 ? { ttsSpeed: Math.round(Number(n.ttsSpeed) * 100) / 100 } : {}),
          ...(n.ttsAccent ? { ttsAccent: String(n.ttsAccent) } : {}),
          ...(prev?.audio ? { audio: prev.audio } : {}),
        };
      });
    }
  });
  return r ? res.json(serialize(r)) : res.status(404).json({ error: 'Not found' });
});

app.delete('/api/reels/:id', (req, res) => {
  const id = P(req.params.id);
  if (!getReel(id)) return res.status(404).json({ error: 'Not found' });
  removeReel(id);
  res.json({ ok: true });
});

// The theme's own animated player with this reel swapped in. Used by the studio preview (iframe).
app.get('/api/reels/:id/player', (req, res) => {
  const r = getReel(P(req.params.id));
  if (!r) return res.status(404).send('Not found');
  try {
    ensureCues(r);
    const mode = req.query.mode === 'capture' ? 'capture' : 'preview';
    const engine = req.query.engine === '1';
    res.set('Cache-Control', 'no-store').type('html').send(buildPlayerHtml(r, mode, { engine }));
  } catch (e) {
    res.status(500).send(String(e));
  }
});

/* -------------------------------------------------------------------- TTS */
// Voices come from the tts-management server (port 3229) which manages designed voices,
// falling back to the bare MLX-Audio server (port 8771) if tts-management is not running.

const TTS_BASE = process.env.TTS_BASE_URL || 'http://127.0.0.1:8771';
const TTS_MGMT_BASE = process.env.TTS_MGMT_BASE_URL || 'http://127.0.0.1:3229';

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
let voiceCache: { at: number; data: { voices: Voice[]; defaultId: string; source: string; error?: string } } | null = null;

async function listVoices(force = false) {
  if (!force && voiceCache && Date.now() - voiceCache.at < 30000 && voiceCache.data.voices.length) return voiceCache.data;
  const studioVoices: Voice[] = [];
  const localVoices: Voice[] = [];
  let studioDefaultId = '';
  let studioOk = false;
  let localOk = false;

  try {
    // 1. Fetch designed/studio voices from tts-management server (port 3229)
    const { data: j } = await axios.get(`${TTS_MGMT_BASE}/api/book/tts-voices`, { timeout: 4000 });
    studioOk = true;
    studioDefaultId = String(j.defaultId || '');
    for (const v of j.voices || []) {
      const id = String(v.id || '');
      if (!id) continue;
      studioVoices.push({
        id,
        label: String(v.label || id),
        model: String(v.model || ''),
        designModel: String(v.designModel || ''),
        kind: String(v.kind || 'designed'),
        instruct: String(v.instruct || ''),
        voice: String(v.voice || 'default'),
        langCode: String(v.langCode || ''),
        source: 'studio',
        refine: v.refine || null,
      });
    }
  } catch { /* studio server optional if local MLX-Audio is up */ }

  const baseModels = new Set<string>();
  for (const v of studioVoices) {
    if (v.model) baseModels.add(v.model);
  }

  try {
    // 2. Also fetch raw MLX-Audio base/flow models (port 8771) so user can choose either
    const { data: j } = await axios.get(`${TTS_BASE}/v1/models`, { timeout: 4000 });
    localOk = true;
    for (const m of j?.data || []) {
      const rawId = String(m.id || '');
      if (rawId) baseModels.add(rawId);
    }
  } catch { /* local MLX-Audio optional if studio server is up */ }

  const seen = new Set(studioVoices.map((v) => v.id));
  for (const rawId of baseModels) {
    const id = seen.has(rawId) ? `base:${rawId}` : rawId;
    localVoices.push({
      id,
      label: rawId,
      model: rawId,
      kind: 'model',
      instruct: '',
      voice: 'default',
      langCode: '',
      source: 'local',
    });
  }

  const voices = [...studioVoices, ...localVoices];
  const defaultId = studioDefaultId || voices[0]?.id || '';
  const source = studioOk && localOk ? 'both' : studioOk ? 'studio' : localOk ? 'local' : 'none';
  const error = !voices.length
    ? `No TTS service reachable at ${TTS_MGMT_BASE} or ${TTS_BASE}.`
    : (!studioOk ? `Studio voices unavailable (${TTS_MGMT_BASE}); showing base TTS models.` : undefined);

  const data = { voices, defaultId, source, ...(error ? { error } : {}) };
  voiceCache = { at: Date.now(), data };
  return data;
}

const LANG_NAME: Record<string, string> = {
  en: 'english',
  pt: 'portuguese',
  es: 'spanish',
  fr: 'french',
  it: 'italian',
  de: 'german',
  pl: 'polish',
  ja: 'japanese',
  ko: 'korean',
  zh: 'chinese',
  ru: 'russian',
};

function toTtsLang(lang?: string): string {
  if (!lang) return '';
  const base = lang.toLowerCase().split('-')[0];
  return LANG_NAME[base] || lang;
}

interface SpeakOpts {
  instruct?: string;
  speed?: number;
  accent?: string;
  lang?: string;
}

async function speak(text: string, v: Voice, opts: SpeakOpts = {}): Promise<Buffer> {
  const isDesigned = v.kind === 'designed';
  const model = isDesigned ? (v.designModel || v.model) : v.model;
  const body: Record<string, unknown> = {
    model,
    input: text,
    voice: v.voice || 'default',
    response_format: 'mp3',
  };

  if (isDesigned) {
    // Designed voices use the VoiceDesign model on MLX-Audio (:8771/v1/audio/speech) with their baked instruct + any per-line override.
    const combinedInstruct = [v.instruct, opts.instruct].filter(Boolean).join(' ');
    if (combinedInstruct) body.instruct = combinedInstruct;
    const langCode = v.langCode || toTtsLang(opts.lang);
    if (langCode) body.lang_code = langCode;
    const speed = opts.speed && opts.speed !== 1 ? opts.speed : (typeof v.refine?.rate === 'number' && v.refine.rate !== 1 ? v.refine.rate : undefined);
    if (speed) body.speed = speed;
    if (typeof v.refine?.pitch === 'number' && v.refine.pitch !== 0) body.pitch = v.refine.pitch;
  } else {
    // Base/flow model on MLX-Audio (:8771/v1/audio/speech): apply regional accent + emotional/delivery instruct + reel language.
    const accentPart = opts.accent ? `${opts.accent} accent` : '';
    const combinedInstruct = [v.instruct, accentPart, opts.instruct].filter(Boolean).join(', ');
    if (combinedInstruct) body.instruct = combinedInstruct;
    const langCode = v.langCode || toTtsLang(opts.lang);
    if (langCode) body.lang_code = langCode;
    if (opts.speed && opts.speed !== 1) body.speed = opts.speed;
  }

  const url = `${TTS_BASE}/v1/audio/speech`;
  const r = await axios.post(url, body, { responseType: 'arraybuffer', timeout: 240000, validateStatus: () => true });
  if (r.status >= 400) {
    const raw = Buffer.from(r.data).toString('utf-8');
    let msg = `${r.status}`;
    try {
      const j = JSON.parse(raw);
      const val = j.error ?? j.detail ?? j.message;
      if (val !== undefined) msg = typeof val === 'string' ? val : JSON.stringify(val);
    } catch {
      if (raw.trim()) msg = raw.trim();
    }
    console.error(`[TTS ${r.status}] ${url}`, { voice: v.id, kind: v.kind, source: v.source, model: v.model, msg });
    throw new Error(`TTS failed (${r.status}): ${msg.slice(0, 300)}`);
  }
  const buf = Buffer.from(r.data);
  if (!buf.length) throw new Error('The voice server returned empty audio.');
  return buf;
}

function probeDurationMs(file: string): Promise<number> {
  return new Promise((resolve, reject) =>
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], (err, out) => {
      const s = parseFloat(String(out).trim());
      return err || !Number.isFinite(s) ? reject(new Error('ffprobe could not read the generated audio')) : resolve(Math.round(s * 1000));
    })
  );
}

app.get('/api/tts/voices', wrap(async (req, res) => res.json(await listVoices(req.query.refresh === '1'))));

// Generate (or regenerate) the narration of ONE line with the chosen designed voice.
// The client may send the text it is showing: that is what the person is looking at, so it wins over
// whatever the debounced autosave has (or has not yet) written, and is stored on the line.
app.post('/api/reels/:id/lines/:lineId/tts', wrap(async (req, res) => {
  const reelId = P(req.params.id), lineId = P(req.params.lineId);
  const reel = getReel(reelId);
  const line = reel?.lines.find((l) => l.id === lineId);
  if (!reel || !line) return res.status(404).json({ error: 'Reel or line not found' });
  const voiceId = String(req.body?.voiceId || line.voiceId || '');
  const text = (typeof req.body?.text === 'string' ? req.body.text : line.s).trim();
  const ttsInstruct = (typeof req.body?.ttsInstruct === 'string' ? req.body.ttsInstruct : (line.ttsInstruct || '')).trim();
  const rawSpeed = req.body?.ttsSpeed !== undefined ? Number(req.body.ttsSpeed) : (line.ttsSpeed ?? 1);
  const ttsSpeed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? Math.round(rawSpeed * 100) / 100 : 1;
  const ttsAccent = (typeof req.body?.ttsAccent === 'string' ? req.body.ttsAccent : (line.ttsAccent || '')).trim();
  if (!text) return res.status(400).json({ error: 'This line has no text yet.' });
  const { voices } = await listVoices();
  const voice = voices.find((v) => v.id === voiceId);
  if (!voice) return res.status(400).json({ error: 'Choose a voice first.' });

  const key = lineKey(text, voice.id, ttsInstruct, ttsSpeed, ttsAccent);
  const rel = `audio/${reelId}/${lineId}-${key}.mp3`;
  const abs = path.join(DATA_DIR, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const isNewFile = !fs.existsSync(abs);
  let durationMs: number;
  try {
    fs.writeFileSync(abs, await speak(text, voice, { instruct: ttsInstruct, speed: ttsSpeed, accent: ttsAccent, lang: reel.lang }));
    durationMs = await probeDurationMs(abs);
  } catch (e) {
    if (isNewFile) fs.rmSync(abs, { force: true }); // never leave an unreferenced / unreadable mp3 behind
    throw e;
  }

  let applied = false;
  const updated = updateReel(reelId, (r) => {
    const l = r.lines.find((x) => x.id === lineId);
    if (!l) return; // line was deleted while we were generating
    if (l.audio && l.audio.file !== rel) fs.rmSync(path.join(DATA_DIR, l.audio.file), { force: true });
    l.s = text;
    l.voiceId = voice.id;
    if (ttsInstruct) l.ttsInstruct = ttsInstruct; else delete l.ttsInstruct;
    if (ttsSpeed !== 1) l.ttsSpeed = ttsSpeed; else delete l.ttsSpeed;
    if (ttsAccent) l.ttsAccent = ttsAccent; else delete l.ttsAccent;
    l.audio = {
      file: rel,
      durationMs,
      key,
      voiceId: voice.id,
      text,
      voiceLabel: voice.label.replace(/\s*·\s*designed voice$/i, ''),
      ...(ttsInstruct ? { ttsInstruct } : {}),
      ...(ttsSpeed !== 1 ? { ttsSpeed } : {}),
      ...(ttsAccent ? { ttsAccent } : {}),
    };
    applied = true;
  });
  if (!updated) { if (isNewFile) fs.rmSync(abs, { force: true }); return res.status(404).json({ error: 'Reel was deleted while generating.' }); }
  if (!applied) { if (isNewFile) fs.rmSync(abs, { force: true }); return res.status(409).json({ error: 'That line was removed while its narration was generating.' }); }
  res.json(serialize(updated));
}));

/* --------------------------------------------------- line audio upload */

// Let the user replace a line's narration with their own audio file
// (recording, music bed, snippet). The file is stored alongside TTS output
// and the line keeps the same reference so the timeline updates.

const uploadAudio = (dir: (id: string) => string) =>
  multer({
    storage: multer.diskStorage({
      destination: (req, _f, cb) => { const d = path.join(DATA_DIR, dir(P((req.params as any).id))); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
      filename: (_req, _file, cb) => cb(null, `${Date.now().toString(36)}.mp3`),
    }),
    limits: { fileSize: 60 * 1024 * 1024 },
  });

app.post('/api/reels/:id/lines/:lineId/audio', uploadAudio(() => 'audio').single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
  const reelId = P(req.params.id);
  const lineId = P(req.params.lineId);
  const reel = getReel(reelId);
  if (!reel) return res.status(404).json({ error: 'Reel not found' });
  const line = reel.lines.find((l) => l.id === lineId);
  if (!line) return res.status(404).json({ error: 'Line not found' });

  // Re-file the upload under the line's own folder so it stays together with TTS audio.
  const rel = `audio/${reelId}/${lineId}-${Date.now().toString(36)}.mp3`;
  const abs = path.join(DATA_DIR, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.renameSync(req.file.path, abs);

  let durationMs: number;
  try {
    durationMs = await probeDurationMs(abs);
  } catch (e) {
    fs.rmSync(abs, { force: true });
    return res.status(500).json({ error: 'Could not read the uploaded audio. Is it a valid audio file?' });
  }

  const updated = updateReel(reelId, (r) => {
    const l = r.lines.find((x) => x.id === lineId);
    if (!l) return;
    if (l.audio) fs.rmSync(path.join(DATA_DIR, l.audio.file), { force: true });
    // The uploaded clip is authoritative: a fixed key so it never reads as stale, and
    // text/voice are snapshotted so the UI stays in sync.
    l.audio = {
      file: rel,
      durationMs,
      key: lineKey(l.s, l.voiceId),
      voiceLabel: 'Uploaded',
      voiceId: l.voiceId,
      text: l.s,
    };
  });
  if (!updated) { fs.rmSync(abs, { force: true }); return res.status(404).json({ error: 'Reel was deleted while uploading.' }); }
  res.json(serialize(updated));
});

app.delete('/api/reels/:id/lines/:lineId/audio', (req, res) => {
  const reelId = P(req.params.id);
  const lineId = P(req.params.lineId);
  const updated = updateReel(reelId, (r) => {
    const l = r.lines.find((x) => x.id === lineId);
    if (!l) return;
    if (l.audio) fs.rmSync(path.join(DATA_DIR, l.audio.file), { force: true });
    delete l.audio;
  });
  return updated ? res.json(serialize(updated)) : res.status(404).json({ error: 'Not found' });
});

/* --------------------------------------------------------- music + cover */

const upload = (dir: (id: string) => string, prefix = '') =>
  multer({
    storage: multer.diskStorage({
      destination: (req, _f, cb) => { const d = path.join(DATA_DIR, dir(P((req.params as any).id))); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
      filename: (_req, file, cb) => cb(null, `${prefix}${Date.now().toString(36)}_${file.originalname.replace(/[^\w.-]+/g, '_')}`),
    }),
    limits: { fileSize: 60 * 1024 * 1024 },
  });

app.post('/api/reels/:id/music', upload((id) => `music/${id}`).single('music'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const rel = `music/${P(req.params.id)}/${req.file.filename}`;
  const r = updateReel(P(req.params.id), (reel) => {
    if (reel.music) fs.rmSync(path.join(DATA_DIR, reel.music.file), { force: true });
    reel.music = { file: rel, name: req.file!.originalname, volume: reel.music?.volume ?? 0.15 };
  });
  return r ? res.json(serialize(r)) : res.status(404).json({ error: 'Not found' });
});

app.delete('/api/reels/:id/music', (req, res) => {
  const r = updateReel(P(req.params.id), (reel) => {
    if (reel.music) fs.rmSync(path.join(DATA_DIR, reel.music.file), { force: true });
    delete reel.music;
  });
  return r ? res.json(serialize(r)) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/reels/:id/cover', upload(() => 'cover', 'cover_').single('cover'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const r = updateReel(P(req.params.id), (reel) => { // single load -> mutate -> save (the old route saved a stale copy)
    reel.coverFile = `cover/${req.file!.filename}`;
    reel.coverAuto = false;
  });
  return r ? res.json(serialize(r)) : res.status(404).json({ error: 'Not found' });
});

/* ----------------------------------------------------------------- export */

interface Job { state: 'running' | 'done' | 'error'; progress: number; message: string }
const jobs = new Map<string, Job>();

app.get('/api/reels/:id/export', (req, res) => res.json(jobs.get(P(req.params.id)) || { state: 'idle', progress: 0, message: '' }));

app.post('/api/reels/:id/export', (req, res) => {
  const id = P(req.params.id);
  const reel = getReel(id);
  if (!reel) return res.status(404).json({ error: 'Not found' });
  if (jobs.get(id)?.state === 'running') return res.status(409).json({ error: 'An export is already running for this reel.' });

  const plan = planReel(reel);
  if (plan.missingAudio.length) {
    return res.status(400).json({
      error: `Generate narration first. Missing or out of date: line ${plan.missingAudio.map((i) => i + 1).join(', ')}.`,
      missing: plan.missingAudio,
    });
  }
  const scale = [1, 2, 3].includes(Number(req.body?.scale)) ? Number(req.body.scale) : 2; // 360p-ish / 720x1280 / 1080x1920
  const outRel = `video/${id}.mp4`;
  jobs.set(id, { state: 'running', progress: 0, message: 'Starting browser' });
  res.status(202).json(jobs.get(id));

  renderReel({
    html: buildPlayerHtml(reel, 'capture'),
    lineAudio: reel.lines.map((l) => path.join(DATA_DIR, l.audio!.file)),
    musicFile: reel.music ? path.join(DATA_DIR, reel.music.file) : undefined,
    musicVolume: reel.music?.volume,
    outFile: path.join(DATA_DIR, outRel),
    scale, fps: 30, expectedMs: plan.totalMs,
    onProgress: (progress, message) => jobs.set(id, { state: 'running', progress, message }),
  })
    .then((result) => {
      let posterRel: string | undefined;
      if (result.posterJpeg) {
        posterRel = `cover/${id}_auto.jpg`;
        fs.mkdirSync(path.join(DATA_DIR, 'cover'), { recursive: true });
        fs.writeFileSync(path.join(DATA_DIR, posterRel), result.posterJpeg);
      }
      updateReel(id, (r) => {
        r.videoFile = outRel;
        if (posterRel && (!r.coverFile || r.coverAuto)) { r.coverFile = posterRel; r.coverAuto = true; } // never overwrite an uploaded cover
      });
      jobs.set(id, { state: 'done', progress: 1, message: 'Done' });
    })
    .catch((e) => {
      console.error('export failed', e);
      jobs.set(id, { state: 'error', progress: 0, message: String(e.message || e) });
    });
});

/* ------------------------------------------------------------------ errors */

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err?.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));