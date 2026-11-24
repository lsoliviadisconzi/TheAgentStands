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
} from './model';
import { renderReel } from './render';

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
    if (Array.isArray(b.lines)) {
      const old = new Map(reel.lines.map((l) => [l.id, l]));
      reel.lines = (b.lines as Partial<Line>[]).map((n) => {
        // Audio is only ever set by the TTS endpoint, never by the client; keep what the server already has.
        const prev = old.get(String(n.id));
        const clientId = /^[\w-]{3,40}$/.test(String(n.id)) ? String(n.id) : '';
        return {
          id: prev ? prev.id : clientId || newId(), // new lines keep the id the studio gave them
          s: String(n.s ?? ''),
          h: Number.isFinite(n.h) ? Math.max(0, Number(n.h)) : 1000,
          ...(n.d ? { d: String(n.d) } : {}),
          ...(n.m ? { m: String(n.m) } : {}),
          ...(Array.isArray(n.log) && n.log.length ? { log: n.log.map(String) } : {}),
          ...(Array.isArray(n.sw) && n.sw.length ? { sw: n.sw } : {}),
          ...(n.voiceId ? { voiceId: String(n.voiceId) } : {}),
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
    res.type('html').send(buildPlayerHtml(r, 'preview'));
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
  let data: { voices: Voice[]; defaultId: string; source: string; error?: string };
  try {
    // Try tts-management server first (port 3229) for designed voices
    const { data: j } = await axios.get(`${TTS_MGMT_BASE}/api/book/tts-voices`, { timeout: 4000 });
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
      }))
      .filter((v: Voice) => v.id);
    data = { voices, defaultId: String(j.defaultId || voices[0]?.id || ''), source: 'studio' };
  } catch (studioErr) {
    try {
      // Fallback to raw MLX-Audio models
      const { data: j } = await axios.get(`${TTS_BASE}/v1/models`, { timeout: 4000 });
      const voices: Voice[] = (j?.data || []).map((m: any) => ({
        id: String(m.id), label: String(m.id), model: String(m.id), kind: 'model', instruct: '', voice: 'default', langCode: '', source: 'local' as const,
      }));
      data = { voices, defaultId: voices[0]?.id || '', source: 'local', error: `Studio voices unavailable (${TTS_MGMT_BASE}); showing raw TTS models.` };
    } catch {
      data = { voices: [], defaultId: '', source: 'none', error: `No TTS service reachable at ${TTS_MGMT_BASE} or ${TTS_BASE}.` };
    }
  }
  voiceCache = { at: Date.now(), data };
  return data;
}

async function speak(text: string, v: Voice): Promise<Buffer> {
  const body: Record<string, unknown> = {
    model: v.model, input: text, voice: v.kind === 'designed' ? v.id : v.voice || 'default', response_format: 'mp3',
  };
  // For designed voices, the instruction is baked into the voice design - don't send instruct parameter
  if (v.instruct && v.kind !== 'designed') body.instruct = v.instruct;
  if (v.kind !== 'designed' && v.langCode) body.lang_code = v.langCode;
  // Designed voices use MLX-Audio directly with their base model
  const url = v.kind === 'designed' ? `${TTS_BASE}/v1/audio/speech` : (v.source === 'studio' ? `${TTS_MGMT_BASE}/api/tts/speech` : `${TTS_BASE}/v1/audio/speech`);
  const r = await axios.post(url, body, { responseType: 'arraybuffer', timeout: 240000, validateStatus: () => true });
  if (r.status >= 400) {
    let msg = `${r.status}`;
    try { const j = JSON.parse(Buffer.from(r.data).toString('utf-8')); msg = j.error || j.detail || msg; } catch { /* not JSON */ }
    throw new Error(`TTS failed: ${String(msg).slice(0, 200)}`);
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
app.post('/api/reels/:id/lines/:lineId/tts', wrap(async (req, res) => {
  const reelId = P(req.params.id), lineId = P(req.params.lineId);
  const reel = getReel(reelId);
  const line = reel?.lines.find((l) => l.id === lineId);
  if (!reel || !line) return res.status(404).json({ error: 'Reel or line not found' });
  const voiceId = String(req.body?.voiceId || line.voiceId || '');
  const text = line.s.trim();
  if (!text) return res.status(400).json({ error: 'This line has no text yet.' });
  const { voices } = await listVoices();
  const voice = voices.find((v) => v.id === voiceId);
  if (!voice) return res.status(400).json({ error: 'Choose a voice first.' });

  const key = lineKey(line.s, voice.id);
  const rel = `audio/${reelId}/${lineId}-${key}.mp3`;
  const abs = path.join(DATA_DIR, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, await speak(text, voice));
  const durationMs = await probeDurationMs(abs);

  const updated = updateReel(reelId, (r) => {
    const l = r.lines.find((x) => x.id === lineId);
    if (!l) return; // line was deleted while we were generating
    if (l.audio && l.audio.file !== rel) fs.rmSync(path.join(DATA_DIR, l.audio.file), { force: true });
    l.voiceId = voice.id;
    l.audio = { file: rel, durationMs, key, voiceId: voice.id, text, voiceLabel: voice.label.replace(/\s*·\s*designed voice$/i, '') };
  });
  res.json(serialize(updated!));
}));

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
