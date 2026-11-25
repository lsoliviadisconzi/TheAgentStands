import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { cleanFx, stageFxCss, stageFxScript } from './stagefx';
import type { LineFx } from './stagefx';
import crypto from 'crypto';
import { buildTimeline, type TimedLine } from '@theagentstands/stage/timeline';
import { migrateStagefx } from '@theagentstands/stage/migrate';
import type { Cue } from '@theagentstands/stage/cues';

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
  key: string; // hash of text + voice + delivery at generation time; a mismatch means "stale"
  voiceLabel?: string;
  voiceId?: string; // what it was generated from, so the UI can flag "stale" without hashing
  text?: string;
  ttsInstruct?: string;
  ttsSpeed?: number;
  ttsAccent?: string;
}

export interface Line {
  id: string;
  s: string; // spoken + typed text
  h: number; // beat (ms) held AFTER the line is finished speaking
  d?: string; // stage direction, e.g. "pausa longa"
  m?: string; // avatar mood: flat | up | calm | worried | stern | surprised | smug | sleepy | wink
  fx?: LineFx; // lamp / colour / room tint / props (see stagefx.ts). Empty = keep what the previous line set
  log?: string[]; // terminal panel lines
  sw?: [string, string][]; // colour swatches (colours theme)
  voiceId?: string;
  ttsInstruct?: string; // per-line emotional / delivery instruction for TTS
  ttsSpeed?: number; // per-line speed multiplier (default 1)
  ttsAccent?: string; // regional accent for base/flow models
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
  cues?: Cue[];
}

export interface ThemeReel {
  n: string;
  hook: string;
  next: string;
  stamp: string;
  l: Array<{ d?: string; m?: string; s: string; h?: number; log?: string[]; sw?: [string, string][]; fx?: LineFx }>;
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

export const lineKey = (text: string, voiceId?: string, ttsInstruct?: string, ttsSpeed?: number, ttsAccent?: string) => {
  const extra = (ttsInstruct || ttsAccent || (ttsSpeed && ttsSpeed !== 1))
    ? `|${(ttsInstruct || '').trim()}|${ttsSpeed && ttsSpeed !== 1 ? ttsSpeed : ''}|${(ttsAccent || '').trim()}`
    : '';
  return crypto.createHash('sha1').update(`${text.trim()}|${voiceId || ''}${extra}`).digest('hex').slice(0, 10);
};

export const isStale = (l: Line) =>
  !!l.audio && l.audio.key !== lineKey(l.s, l.voiceId, l.ttsInstruct, l.ttsSpeed, l.ttsAccent);

function normalize(r: any): Reel {
  const lines: Line[] =
    Array.isArray(r.lines) && r.lines.length
      ? r.lines
      : [{ id: newId(), s: String(r.script || ''), h: 1000 }]; // legacy reels had one flat script
  const legacyCover = typeof r.coverPath === 'string' ? r.coverPath.replace(/^\/data\//, '') : undefined;
  const reel = {
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
  ensureCues(reel);
  return reel;
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
  ensureCues(reel);
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
      ...(cleanFx(l.fx) ? { fx: cleanFx(l.fx) } : {}),
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
  clamped: number[]; // 0-based indexes whose requested start offset could not be honoured
}

/* The theme players are strictly sequential: line N+1 begins the moment line N's hold is
 * over, and `h` is the only knob. So the plan is sequential too, and a line's `offset`
 * ("start no earlier than, ms from reel start") is implemented by stretching the PREVIOUS
 * line's hold. That makes the plan, the live preview and the exported video agree.
 * What an offset cannot do is pull a line earlier than the previous line allows, or move the
 * first line (the hook card has a fixed length); those are reported in `clamped`. */
export function planReel(reel: Reel): Plan {
  const timed: TimedLine[] = reel.lines.map((l) => ({
    id: l.id,
    s: l.s,
    h: l.h,
    offset: l.offset,
    speechMs: l.audio && !isStale(l) ? (l.audio.durationMs || 0) : 0,
  }));
  const tl = buildTimeline(timed, { pace: 'classic' });
  const missingAudio: number[] = [];
  timed.forEach((l, i) => { if (l.speechMs <= 0) missingAudio.push(i); });
  return {
    holds: tl.holds,
    starts: tl.starts,
    speechEnds: tl.speechEnds,
    ends: tl.ends,
    stampAt: tl.stampAt,
    totalMs: tl.totalMs,
    missingAudio,
    clamped: tl.clamped,
  };
}

/* --------------------------------------------------------- player HTML */
// The studio never re-implements the animated player. It takes the theme's own HTML
// file and swaps in the edited reel, so preview and export look exactly like the theme.

const jsonForScript = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const BASE_CSS = `h1,.sub,.tabs{display:none!important}html,body{scrollbar-width:none;-ms-overflow-style:none}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}` + stageFxCss();
const CAPTURE_CSS = `
:root{padding:0!important}
html,body{margin:0!important;padding:0!important;background:#000!important;min-height:0!important;display:block!important}
.ctl{display:none!important}
.stage{width:360px!important;max-width:none!important;max-height:none!important;border-radius:0!important;box-shadow:none!important;margin:0!important}`;

// Runs inside the theme page (preview only). Plays each line's mp3 the instant its text starts
// typing, and tells the studio what is happening so its playhead can follow the real player.
const PREVIEW_JS = (urls: (string | null)[]) => `
(function(){
  var URLS=${jsonForScript(urls)}, idx=-1, cur=null;
  var send=function(o){try{parent.postMessage(o,'*')}catch(e){}};
  var stop=function(){if(cur){try{cur.pause()}catch(e){}cur=null}};
  var speak=function(i){
    stop();
    if(!URLS[i])return;
    cur=new Audio(URLS[i]);
    var p=cur.play();
    if(p&&p.catch)p.catch(function(){send({t:'audioblocked'})});
  };
  new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){
    if(n.nodeName!=='P')return; idx++; send({t:'line',i:idx}); speak(idx);
  })})}).observe(document.getElementById('cap'),{childList:true});
  new MutationObserver(function(){
    if(document.getElementById('hook').classList.contains('on')){idx=-1;stop();send({t:'start'});}
  }).observe(document.getElementById('hook'),{attributes:true,attributeFilter:['class']});
  new MutationObserver(function(){ if(document.getElementById('tag').classList.contains('on'))send({t:'end'}); })
    .observe(document.getElementById('tag'),{attributes:true,attributeFilter:['class']});
  send({t:'start'}); // the theme's own play(0) already ran before these observers existed
  var pp=document.getElementById('pp');
  if(pp)pp.addEventListener('click',function(){
    if(typeof paused==='undefined')return; // the theme's handler runs first and has already toggled it
    var p=!!paused; send({t:'pause',paused:p});
    if(cur){ if(p)cur.pause(); else cur.play().catch(function(){}); }
  });
})();`;

export interface PlayerOptions {
  engine?: boolean;
}

export function buildPlayerHtml(
  reel: Reel,
  mode: 'preview' | 'capture',
  opts: PlayerOptions = {},
): string {
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

  const fxScript = stageFxScript(reel.lines.map((l) => l.fx), mode);
  if (fxScript) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => fxScript + '</body>') : html + fxScript;

  if (mode === 'preview') {
    const urls = reel.lines.map((l) => (l.audio && !isStale(l) ? `${MEDIA_URL}/${l.audio.file}` : null));
    const js = PREVIEW_JS(urls);
    if (/play\(0\);\s*<\/script>/.test(html)) {
      html = html.replace(/play\(0\);\s*<\/script>/, () => `play(0);\n${js}\n</script>`);
    } else if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, () => `<script>${js}</script></body>`); // theme ends differently: still hook the audio in
    } else {
      html += `<script>${js}</script>`;
    }
  }

  if (opts.engine) {
    const engineJs = readEngineBundle();
    if (engineJs) {
      html = html.replace('</head>', () => `<script>${engineJs}</script></head>`);
      const wire =
        `window.addEventListener('message',function(e){` +
        `if(!e.data||e.data.t!=='setTime')return;` +
        `if(window.__stage&&window.__stage.setTime)window.__stage.setTime(e.data.value);` +
        `});`;
      html = html.replace('</body>', () => `<script>${wire}</script></body>`);
    }
    // Inject cues as const C = [...]
    const jsonForScript = (v: unknown) =>
      JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    html = html.replace('</head>', () => `<script>const C=${jsonForScript(reel.cues || [])};</script></head>`);
    // Inject setTime handler into theme's player
    const setTimeHandler = `
(function(){
  if (window.__stage && window.__stage.setTime) {
    window.setTime = function(t) { window.__stage.setTime(t); };
  }
})();`;
    html = html.replace('</body>', () => `<script>${setTimeHandler}</script></body>`);
  }
  return html;
}

let _engineJs: string | null = null;
function readEngineBundle(): string {
  if (_engineJs !== null) return _engineJs;
  const p = path.join(__dirname, '..', 'dist', 'stage.iife.js');
  _engineJs = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  return _engineJs;
}

// Called on load so old reels pick up cues without a rewrite.
export function ensureCues(reel: Reel): void {
  if (!reel.cues) {
    reel.cues = migrateStagefx(reel.lines as any);
  }
}

function fallbackThemeFile(): string | null {
  for (const t of listThemes()) {
    const langs = listLanguages(t);
    const l = langs.includes('en') ? 'en' : langs[0];
    if (l) return themeFile(t, l);
  }
  return null;
}