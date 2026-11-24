import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';

/* ---------------------------------------------------------------- paths */

export const ROOT = path.join(__dirname, '../..');
export const DATA_DIR = path.join(ROOT, 'data');
export const THEMES_DIR = path.join(ROOT, 'themes');
export const PAGES_DIR = path.join(ROOT, 'pages');
export const NARRATIONS_DIR = path.join(ROOT, 'data', 'narrations');
const DATA_FILE = path.join(DATA_DIR, 'reels.json');
export const MEDIA_URL = '/api/data'; // express.static(DATA_DIR) is mounted here

/* ---------------------------------------------------------------- types */

export interface LineAudio {
  file: string; // relative to DATA_DIR, e.g. audio/<reelId>/<lineId>-<key>.mp3
  durationMs: number;
  key: string; // hash of text + voice at generation time; a mismatch means "stale"
  voiceLabel?: string;
  voiceId?: string; // what it was generated from, so the UI can flag "stale" without hashing
  text?: string;
}

export interface Line {
  id: string;
  s: string; // spoken + typed text
  h: number; // beat (ms) held AFTER the line is finished speaking
  d?: string; // stage direction, e.g. "pausa longa"
  m?: string; // avatar mood: flat | up | calm
  log?: string[]; // terminal panel lines
  sw?: [string, string][]; // colour swatches (colours theme)
  voiceId?: string;
  offset?: number; // start offset in ms from reel start
  audio?: LineAudio;
}

export interface Music {
  file: string;
  name: string;
  volume: number; // 0..1
}

export interface Reel {
  id: string;
  title: string;
  theme: string;
  lang: string;
  hook: string;
  stamp: string;
  next: string;
  lines: Line[];
  music?: Music;
  coverFile?: string;
  coverAuto?: boolean;
  videoFile?: string;
  onLanding: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface ThemeReel {
  n: string;
  hook: string;
  next: string;
  stamp: string;
  l: Array<{ d?: string; m?: string; s: string; h?: number; log?: string[]; sw?: [string, string][] }>;
}

/* ---------------------------------------------------------------- narrations */

export interface NarrationScene {
  index: number;
  direction: string;
  text: string;
  mood: string;
  panel: string[];
  holdMs: number;
  swatches: [string, string][];
}

export interface NarrationReel {
  theme: string;
  language: string;
  reel: string;
  title: string;
  hook: string;
  stamp: string;
  next: string;
  scenes: NarrationScene[];
}

export interface NarrationLanguageIndex {
  theme: string;
  language: string;
  reels: { slug: string; title: string; hook: string; sceneCount: number }[];
}

export interface NarrationThemeIndex {
  theme: string;
  title: string;
  languages: Record<string, { code: string; label: string; reelCount: number }>;
}

export interface NarrationsMasterIndex {
  themes: Record<string, { title: string; languages: string[] }>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function themeSlug(theme: string): string {
  return slugify(theme);
}

function reelSlug(title: string): string {
  return slugify(title);
}

export function listNarrationThemes(): { slug: string; title: string; languages: string[] }[] {
  const indexFile = path.join(NARRATIONS_DIR, 'index.json');
  if (!fs.existsSync(indexFile)) return [];
  try {
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as NarrationsMasterIndex;
    return Object.entries(index.themes).map(([slug, data]) => ({
      slug,
      title: data.title,
      languages: data.languages,
    }));
  } catch {
    return [];
  }
}

export function getNarrationTheme(slug: string): NarrationThemeIndex | null {
  const file = path.join(NARRATIONS_DIR, slug, 'index.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as NarrationThemeIndex;
  } catch {
    return null;
  }
}

export function getNarrationLanguage(themeSlug: string, lang: string): NarrationLanguageIndex | null {
  const file = path.join(NARRATIONS_DIR, themeSlug, lang, 'index.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as NarrationLanguageIndex;
  } catch {
    return null;
  }
}

export function getNarrationReel(themeSlug: string, lang: string, reelSlug: string): NarrationReel | null {
  const file = path.join(NARRATIONS_DIR, themeSlug, lang, `${reelSlug}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as NarrationReel;
  } catch {
    return null;
  }
}

export function narrationReelToReel(theme: string, lang: string, nr: NarrationReel, order: number): Reel {
  const now = Date.now();
  return {
    id: 'r' + now.toString(36) + newId().slice(0, 3),
    title: nr.title,
    theme,
    lang,
    hook: nr.hook,
    stamp: nr.stamp,
    next: nr.next,
    lines: nr.scenes.map((s) => ({
      id: newId(),
      s: s.text,
      h: s.holdMs,
      ...(s.direction ? { d: s.direction } : {}),
      ...(s.mood ? { m: s.mood } : {}),
      ...(s.panel?.length ? { log: s.panel } : {}),
      ...(s.swatches?.length ? { sw: s.swatches } : {}),
    })),
    onLanding: false,
    order,
    createdAt: now,
    updatedAt: now,
  };
}

/* ---------------------------------------------------------------- store */
// All reads/writes are synchronous, so a load -> mutate -> save cycle can never
// interleave with another request. Never hold a Reel across an `await`; re-read
// it with updateReel() afterwards.

export const newId = () => crypto.randomBytes(4).toString('hex');

export const lineKey = (text: string, voiceId?: string) =>
  crypto.createHash('sha1').update(`${text.trim()}|${voiceId || ''}`).digest('hex').slice(0, 10);

export const isStale = (l: Line) => !!l.audio && l.audio.key !== lineKey(l.s, l.voiceId);

function normalize(r: any): Reel {
  const lines: Line[] =
    Array.isArray(r.lines) && r.lines.length
      ? r.lines
      : [{ id: newId(), s: String(r.script || ''), h: 1000 }]; // legacy reels had one flat script
  const legacyCover = typeof r.coverPath === 'string' ? r.coverPath.replace(/^\/data\//, '') : undefined;
  return {
    id: String(r.id),
    title: String(r.title || 'Untitled'),
    theme: String(r.theme || ''),
    lang: String(r.lang || 'en'),
    hook: String(r.hook || r.title || ''),
    stamp: String(r.stamp || ''),
    next: String(r.next || ''),
    lines: lines.map((l) => ({ ...l, id: l.id || newId(), s: String(l.s ?? ''), h: Number.isFinite(l.h) ? l.h : 1000 })),
    music: r.music,
    coverFile: r.coverFile || legacyCover,
    coverAuto: r.coverAuto,
    videoFile: r.videoFile,
    onLanding: !!r.onLanding,
    order: Number.isFinite(r.order) ? r.order : 0,
    createdAt: r.createdAt || Date.now(),
    updatedAt: r.updatedAt || Date.now(),
  };
}

export function loadReels(): Reel[] {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return Array.isArray(raw) ? raw.map(normalize) : [];
  } catch {
    return [];
  }
}

export function saveReels(reels: Reel[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(reels, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomic: a crash never leaves a half-written reels.json
}

export const getReel = (id: string) => loadReels().find((r) => r.id === id) || null;

export function updateReel(id: string, fn: (r: Reel) => void): Reel | null {
  const reels = loadReels();
  const reel = reels.find((r) => r.id === id);
  if (!reel) return null;
  fn(reel);
  reel.updatedAt = Date.now();
  saveReels(reels);
  return reel;
}

export function addReel(reel: Reel) {
  const reels = loadReels();
  reels.push(reel);
  saveReels(reels);
}

export function removeReel(id: string) {
  saveReels(loadReels().filter((r) => r.id !== id));
  for (const dir of ['audio', 'music']) fs.rmSync(path.join(DATA_DIR, dir, id), { recursive: true, force: true });
  for (const f of [`video/${id}.mp4`, `cover/${id}_auto.jpg`]) fs.rmSync(path.join(DATA_DIR, f), { force: true });
}

/* ---------------------------------------------------------------- themes */

// Match const R = [...] with or without newlines before the closing ];
const R_RE = /const R\s*=\s*(\[[\s\S]*?\]);/;

// Helper to sanitize theme/language names for filesystem safety
// Allow alphanumeric, spaces, hyphens, apostrophes, periods, parentheses, commas
const SAFE_NAME = /^[\w\s\-'(),.]+$/;

function sanitizeComponent(name: string): string {
  // Replace any potentially dangerous characters (keep commas, periods, parentheses)
  return name.replace(/[^\w\s\-'(),.]/g, '');
}

export function listThemes(): string[] {
  if (!fs.existsSync(THEMES_DIR)) return [];
  return fs.readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function listLanguages(theme: string): string[] {
  const safeTheme = sanitizeComponent(theme);
  if (!SAFE_NAME.test(safeTheme)) return [];
  const dir = path.join(THEMES_DIR, safeTheme);
  if (!fs.existsSync(dir)) return [];
  // Files are named like "Theme Name - lang.html"
  const prefix = `${safeTheme} - `;
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.html') && f.startsWith(prefix))
    .map((f) => f.slice(prefix.length, -5)) // remove "Theme Name - " prefix and ".html" suffix
    .sort();
}

export function themeFile(theme: string, lang: string): string | null {
  const safeTheme = sanitizeComponent(theme);
  const safeLang = sanitizeComponent(lang);
  if (!SAFE_NAME.test(safeTheme) || !SAFE_NAME.test(safeLang)) return null;
  // Files are named like "Theme Name - lang.html"
  const f = path.join(THEMES_DIR, safeTheme, `${safeTheme} - ${safeLang}.html`);
  return fs.existsSync(f) ? f : null;
}

export function parseThemeFile(file: string): { title: string; sub: string; reels: ThemeReel[] } {
  const html = fs.readFileSync(file, 'utf-8');
  const m = html.match(R_RE);
  if (!m) throw new Error('No `const R = [...]` array found in ' + path.basename(file));
  // The array is a plain object literal; evaluate it in an empty sandbox with a timeout.
  const reels = vm.runInNewContext('(' + m[1] + ')', Object.create(null), { timeout: 250 }) as ThemeReel[];
  return {
    title: (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '',
    sub: (html.match(/<p class="sub">([\s\S]*?)<\/p>/) || [])[1] || '',
    reels,
  };
}

export function themeReelToReel(theme: string, lang: string, tr: ThemeReel, order: number): Reel {
  const now = Date.now();
  return {
    id: 'r' + now.toString(36) + newId().slice(0, 3),
    title: tr.n,
    theme,
    lang,
    hook: tr.hook,
    stamp: tr.stamp,
    next: tr.next,
    lines: tr.l.map((l) => ({
      id: newId(),
      s: l.s,
      h: l.h ?? 1000,
      ...(l.d ? { d: l.d } : {}),
      ...(l.m ? { m: l.m } : {}),
      ...(l.log ? { log: l.log } : {}),
      ...(l.sw ? { sw: l.sw } : {}),
    })),
    onLanding: false,
    order,
    createdAt: now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------- timeline */
// The theme players type one character per 40 ms tick (their `w(24)` rounds up to one
// 40 ms step), wait 1920 + 400 ms on the hook card, and show the stamp for 3800 ms.
// Rather than patching those players, we steer them through the one knob they expose:
// each line's `h` (hold after typing). Audio start times are re-measured during capture,
// so a small error here can never put a voice out of sync with its text.

export const TICK = 40;
export const HOOK_MS = 1920 + 400;
export const STAMP_MS = 3800;
const ceilTick = (ms: number) => Math.ceil(ms / TICK) * TICK;

export interface Plan {
  holds: number[]; // effective `h` per line, handed to the player
  starts: number[]; // when each line starts typing / speaking
  speechEnds: number[];
  ends: number[]; // when the player moves on to the next line
  stampAt: number;
  totalMs: number;
  missingAudio: number[]; // 0-based indexes of lines with no usable audio
}

export function planReel(reel: Reel): Plan {
  const plan: Plan = { holds: [], starts: [], speechEnds: [], ends: [], stampAt: 0, totalMs: 0, missingAudio: [] };
  
  // Calculate start times with optional offsets
  const lineStarts: number[] = [];
  reel.lines.forEach((l, i) => {
    const offset = l.offset || 0;
    lineStarts[i] = offset;
  });
  
  // For lines without explicit offset, place them sequentially after the previous line
  let t = HOOK_MS;
  reel.lines.forEach((l, i) => {
    if (l.offset === undefined || l.offset === 0) {
      // Find the latest end time so far to avoid overlap
      const maxEnd = Math.max(...plan.ends.slice(0, i), t);
      t = Math.max(t, maxEnd);
      lineStarts[i] = t;
    }
  });
  
  // Now calculate holds, speechEnds, ends based on lineStarts
  reel.lines.forEach((l, i) => {
    const typing = [...l.s].length * TICK;
    const usable = l.audio && !isStale(l);
    if (!usable) plan.missingAudio.push(i);
    const speech = usable ? l.audio!.durationMs : 0;
    const hold = ceilTick(Math.max(0, speech - typing) + Math.max(0, l.h));
    plan.holds.push(hold);
    plan.starts.push(lineStarts[i]);
    plan.speechEnds.push(lineStarts[i] + Math.max(typing, speech));
    plan.ends.push(lineStarts[i] + typing + hold);
  });
  
  // Total duration is the maximum of all line ends plus stamp
  const maxEnd = Math.max(...plan.ends);
  plan.stampAt = maxEnd;
  plan.totalMs = maxEnd + STAMP_MS;
  return plan;
}

/* --------------------------------------------------------- player HTML */
// The studio never re-implements the animated player. It takes the theme's own HTML
// file and swaps in the edited reel, so preview and export look exactly like the theme.

const jsonForScript = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const BASE_CSS = `h1,.sub,.tabs{display:none!important}`;
const CAPTURE_CSS = `
:root{padding:0!important}
html,body{margin:0!important;padding:0!important;background:#000!important;min-height:0!important;display:block!important}
.ctl{display:none!important}
.stage{width:360px!important;max-width:none!important;max-height:none!important;border-radius:0!important;box-shadow:none!important;margin:0!important}`;

const PREVIEW_JS = (urls: (string | null)[]) => `
(function(){
  var URLS=${jsonForScript(urls)}, idx=-1, cur=null;
  var send=function(o){try{parent.postMessage(o,'*')}catch(e){}};
  var stop=function(){if(cur){cur.pause();cur=null}};
  new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){
    if(n.nodeName!=='P')return; idx++; send({t:'line',i:idx}); stop();
    if(URLS[idx]){cur=new Audio(URLS[idx]);cur.play().catch(function(){});}
  })})}).observe(document.getElementById('cap'),{childList:true});
  new MutationObserver(function(){
    if(document.getElementById('hook').classList.contains('on')){idx=-1;stop();send({t:'start'});}
  }).observe(document.getElementById('hook'),{attributes:true,attributeFilter:['class']});
  new MutationObserver(function(){ if(document.getElementById('tag').classList.contains('on'))send({t:'end'}); })
    .observe(document.getElementById('tag'),{attributes:true,attributeFilter:['class']});
  send({t:'start'}); // the theme's own play(0) already ran before these observers existed
  document.getElementById('pp').addEventListener('click',function(){ if(!cur)return; if(paused)cur.pause(); else cur.play().catch(function(){}); });
})();`;

export function buildPlayerHtml(reel: Reel, mode: 'preview' | 'capture'): string {
  const file = themeFile(reel.theme, reel.lang) || fallbackThemeFile();
  if (!file) throw new Error('No theme HTML files found in /themes');
  let html = fs.readFileSync(file, 'utf-8');
  if (!R_RE.test(html)) throw new Error('Theme file has no `const R = [...]` array: ' + path.basename(file));

  const plan = planReel(reel);
  const entry = {
    n: reel.title,
    hook: reel.hook,
    next: reel.next,
    stamp: reel.stamp,
    l: reel.lines.map((l, i) => ({
      ...(l.d ? { d: l.d } : {}),
      ...(l.m ? { m: l.m } : {}),
      s: l.s,
      h: plan.holds[i],
      ...(l.log?.length ? { log: l.log } : {}),
      ...(l.sw?.length ? { sw: l.sw } : {}),
    })),
  };
  html = html.replace(R_RE, () => `const R=${jsonForScript([entry])};`);
  html = html.replace('</head>', () => `<style>${BASE_CSS}${mode === 'capture' ? CAPTURE_CSS : ''}</style></head>`);

  if (mode === 'preview') {
    const urls = reel.lines.map((l) => (l.audio && !isStale(l) ? `${MEDIA_URL}/${l.audio.file}` : null));
    html = html.replace(/play\(0\);\s*<\/script>/, () => `play(0);\n${PREVIEW_JS(urls)}\n</script>`);
  }
  return html;
}

function fallbackThemeFile(): string | null {
  for (const t of listThemes()) {
    const langs = listLanguages(t);
    const l = langs.includes('en') ? 'en' : langs[0];
    if (l) return themeFile(t, l);
  }
  return null;
}
