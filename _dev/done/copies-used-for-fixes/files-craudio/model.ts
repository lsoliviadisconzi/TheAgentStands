import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';

/* ---------------------------------------------------------------- paths */

export const ROOT = path.join(__dirname, '../..');
export const DATA_DIR = path.join(ROOT, 'data');
export const THEMES_DIR = path.join(ROOT, 'themes');
export const PAGES_DIR = path.join(ROOT, 'pages');
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

const SAFE = /^[\w-]+$/;
const R_RE = /const R\s*=\s*(\[[\s\S]*?\n\]);/;

export function listThemes(): string[] {
  if (!fs.existsSync(THEMES_DIR)) return [];
  return fs.readdirSync(THEMES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

export function listLanguages(theme: string): string[] {
  if (!SAFE.test(theme)) return [];
  const dir = path.join(THEMES_DIR, theme);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort();
}

export function themeFile(theme: string, lang: string): string | null {
  if (!SAFE.test(theme) || !SAFE.test(lang)) return null;
  const f = path.join(THEMES_DIR, theme, `${lang}.html`);
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
  let t = HOOK_MS;
  reel.lines.forEach((l, i) => {
    const typing = [...l.s].length * TICK;
    const usable = l.audio && !isStale(l);
    if (!usable) plan.missingAudio.push(i);
    const speech = usable ? l.audio!.durationMs : 0;
    const hold = ceilTick(Math.max(0, speech - typing) + Math.max(0, l.h));
    plan.holds.push(hold);
    plan.starts.push(t);
    plan.speechEnds.push(t + Math.max(typing, speech));
    t += typing + hold;
    plan.ends.push(t);
  });
  plan.stampAt = t;
  plan.totalMs = t + STAMP_MS;
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
