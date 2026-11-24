import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { STAMP_MS } from './model';

/* Deterministic capture of the theme's animated player.
 *
 * Real-time screen recording drifts and drops frames. Instead we replace the page's
 * clock (setTimeout, setInterval, rAF, performance.now, Date.now) with a virtual one
 * that only moves when we say so, advance it one video frame at a time, freeze every
 * CSS animation/transition to that same instant, screenshot the stage, and pipe the
 * JPEG into ffmpeg. Frame N is therefore always exactly N/fps seconds into the reel,
 * no matter how slow the machine is. */

const VIRTUAL_CLOCK = `
(() => {
  const MC = MessageChannel;
  let now = 0, seq = 0;
  const timers = new Map(), rafs = new Map();
  const flush = () => new Promise(r => { const c = new MC(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  window.setTimeout = (fn, ms, ...a) => { const id = ++seq; timers.set(id, { id, t: now + Math.max(0, +ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms, ...a) => { const e = Math.max(1, +ms || 1), id = ++seq; timers.set(id, { id, t: now + e, fn, a, e }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  window.requestAnimationFrame = fn => { const id = ++seq; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = id => { rafs.delete(id); };
  performance.now = () => now;
  Date.now = () => 1700000000000 + now;
  window.__vc = {
    get now() { return now; },
    async advance(ms) {
      const target = now + ms;
      await flush();
      for (;;) {
        let next = null;
        for (const t of timers.values()) if (t.t <= target && (!next || t.t < next.t || (t.t === next.t && t.id < next.id))) next = t;
        if (!next) break;
        now = Math.max(now, next.t);
        if (next.e) next.t += next.e; else timers.delete(next.id);
        try { next.fn(...next.a); } catch (err) { console.error(err); }
        await flush(); // let every promise continuation (the player's awaits) run before the next timer
      }
      now = target;
      const cbs = [...rafs.values()]; rafs.clear();
      cbs.forEach(f => { try { f(now); } catch (err) { console.error(err); } });
      await flush();
    },
    sync() {
      for (const a of document.getAnimations()) {
        if (a.__t0 === undefined) a.__t0 = now - (Number(a.currentTime) || 0);
        try { a.pause(); a.currentTime = now - a.__t0; } catch (err) {}
      }
      return { now, tagOn: document.getElementById('tag').classList.contains('on') };
    },
  };
  // Record the exact virtual time at which each line / the stamp appears.
  window.__marks = { lines: [], tagOn: null };
  addEventListener('DOMContentLoaded', () => {
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeName === 'P') window.__marks.lines.push(now); })))
      .observe(document.getElementById('cap'), { childList: true });
    new MutationObserver(() => { if (window.__marks.tagOn === null && document.getElementById('tag').classList.contains('on')) window.__marks.tagOn = now; })
      .observe(document.getElementById('tag'), { attributes: true, attributeFilter: ['class'] });
  });
})();`;

export interface RenderOptions {
  html: string;
  lineAudio: string[]; // absolute mp3 paths, one per line, in order
  musicFile?: string;
  musicVolume?: number;
  outFile: string; // absolute .mp4 path
  scale?: number; // device scale factor: 2 -> 720x1280, 3 -> 1080x1920
  fps?: number;
  expectedMs: number; // planned length, used only for the progress bar
  onProgress?: (fraction: number, message: string) => void;
}

export interface RenderResult {
  durationMs: number;
  lineStartsMs: number[];
  posterJpeg: Buffer | null;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    p.on('error', (e) => reject(new Error(`${cmd} could not start (${e.message}). Is it installed and on PATH?`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}: ${err.trim().split('\n').slice(-6).join('\n')}`))));
  });
}

export async function renderReel(o: RenderOptions): Promise<RenderResult> {
  const fps = o.fps || 30;
  const scale = o.scale || 2;
  const frameMs = 1000 / fps;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  const silent = path.join(work, 'silent.mp4');
  fs.mkdirSync(path.dirname(o.outFile), { recursive: true });

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: scale,
      reducedMotion: 'no-preference', // the players skip typing when reduced motion is on
    });
    const page = await ctx.newPage();
    await page.addInitScript(VIRTUAL_CLOCK);
    // setContent() would reuse the blank document and skip the init script, so serve the
    // HTML from an intercepted URL to get a real navigation. (Google Fonts still loads normally.)
    await ctx.route('http://reel.local/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: o.html }));
    await page.goto('http://reel.local/', { waitUntil: 'load', timeout: 30000 });
    // Load the fonts up front so the very first frames are not drawn with a fallback face.
    await Promise.race([
      page
        .evaluate(() =>
          Promise.all([
            document.fonts.load('700 20px "Barlow Condensed"'),
            document.fonts.load('600 20px "Barlow Condensed"'),
            document.fonts.load('20px "Special Elite"'),
          ]).then(() => document.fonts.ready)
        )
        .catch(() => {}),
      new Promise((r) => setTimeout(r, 8000)), // real timer (Node side); the page clock is virtual
    ]);
    await page.waitForTimeout(400); // real time: let font files finish arriving

    // ffmpeg encodes the frames as they arrive (no temp PNGs).
    const enc = spawn(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'veryfast', '-r', String(fps), '-movflags', '+faststart', silent],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );
    let encErr = '';
    enc.stderr.on('data', (d) => (encErr = (encErr + d).slice(-4000)));
    const encDone = new Promise<void>((resolve, reject) => {
      enc.on('error', (e) => reject(new Error(`ffmpeg could not start (${e.message}). Is it installed and on PATH?`)));
      enc.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg video encode failed: ' + encErr.trim()))));
    });
    enc.stdin.on('error', () => {}); // surfaced through encDone

    const stage = page.locator('#stage');
    const expectedFrames = Math.ceil((o.expectedMs / 1000) * fps);
    let frame = 0;
    let endAt: number | null = null;
    let poster: Buffer | null = null;
    let virtualNow = 0;
    const SAFETY_MS = o.expectedMs + 20000; // never loop forever if a theme misbehaves

    for (;;) {
      const st = await page.evaluate(() => (window as any).__vc.sync());
      virtualNow = st.now;
      if (st.tagOn && endAt === null) endAt = virtualNow + STAMP_MS;
      const buf = await stage.screenshot({ type: 'jpeg', quality: 92 });
      if (st.tagOn && !poster && virtualNow >= (endAt as number) - STAMP_MS + 700) poster = buf; // stamp fully slammed in
      if (!enc.stdin.write(buf)) await new Promise<void>((r) => enc.stdin.once('drain', () => r()));
      frame++;
      if (frame % 10 === 0) o.onProgress?.(Math.min(0.9, (frame / expectedFrames) * 0.9), `Capturing frame ${frame} of ~${expectedFrames}`);
      if (endAt !== null && virtualNow >= endAt) break;
      if (virtualNow > SAFETY_MS) throw new Error('The player never reached its closing stamp (theme timing mismatch).');
      await page.evaluate((ms) => (window as any).__vc.advance(ms), frameMs);
    }
    enc.stdin.end();
    await encDone;

    const marks = (await page.evaluate(() => (window as any).__marks)) as { lines: number[]; tagOn: number | null };
    if (marks.lines.length !== o.lineAudio.length) {
      throw new Error(`Capture saw ${marks.lines.length} lines but the reel has ${o.lineAudio.length}.`);
    }
    const durationMs = frame * frameMs;

    // ---- mux: place every line's audio at the instant its text actually appeared ----
    o.onProgress?.(0.93, 'Mixing audio');
    const args: string[] = ['-y', '-loglevel', 'error', '-i', silent];
    o.lineAudio.forEach((f) => args.push('-i', f));
    const hasMusic = !!o.musicFile;
    if (hasMusic) args.push('-stream_loop', '-1', '-i', o.musicFile!);
    const filters: string[] = [];
    const voices: string[] = [];
    marks.lines.forEach((t, i) => {
      const d = Math.max(0, Math.round(t));
      filters.push(`[${i + 1}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${d}|${d}[v${i}]`);
      voices.push(`[v${i}]`);
    });
    const secs = (durationMs / 1000).toFixed(3);
    let mixLabel = '[voice]';
    // apad: keep the audio track as long as the video so players never cut the stamp's tail short
    filters.push(`${voices.join('')}amix=inputs=${voices.length}:normalize=0:duration=longest,apad=whole_dur=${secs}[voice]`);
    if (hasMusic) {
      const vol = Math.max(0, Math.min(1, o.musicVolume ?? 0.15));
      const mi = o.lineAudio.length + 1;
      const fadeStart = Math.max(0, durationMs / 1000 - 1.5).toFixed(3);
      filters.push(`[${mi}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${secs},afade=t=out:st=${fadeStart}:d=1.5,volume=${vol}[mus]`);
      filters.push(`[voice][mus]amix=inputs=2:normalize=0:duration=longest[mix]`);
      mixLabel = '[mix]';
    }
    args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', mixLabel,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', secs, '-movflags', '+faststart', o.outFile);
    await run('ffmpeg', args);
    o.onProgress?.(1, 'Done');

    return { durationMs, lineStartsMs: marks.lines, posterJpeg: poster };
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(work, { recursive: true, force: true });
  }
}
