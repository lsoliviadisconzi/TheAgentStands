import axios from 'axios'
import type { Line, LineFx, Reel, StageLook } from './types'

export const errMsg = (e: unknown): string =>
  axios.isAxiosError(e) ? (e.response?.data?.error as string) || e.message : String(e)

export const uid = () => Math.random().toString(36).slice(2, 10)

export const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}

export const hue = (i: number) => `hsl(${(i * 67 + 165) % 360} 52% 62%)`

export const shortVoice = (label?: string) => (label || '').replace(/\s*·\s*designed voice$/i, '')

export type LineState = 'empty' | 'novoice' | 'new' | 'stale' | 'ready'

// Mirrors the server: audio is "stale" as soon as the text or the voice differs from what was generated.
export function lineState(l: Line): LineState {
  if (!l.s.trim()) return 'empty'
  if (!l.voiceId) return 'novoice'
  if (!l.audio) return 'new'
  const a = l.audio
  if ((a.text !== undefined && a.text.trim() !== l.s.trim()) || (a.voiceId && a.voiceId !== l.voiceId)) return 'stale'
  return l.stale ? 'stale' : 'ready'
}

export const STATE_LABEL: Record<LineState, string> = {
  empty: 'Write some text',
  novoice: 'Choose a voice',
  new: 'Ready to generate',
  stale: 'Text or voice changed. Regenerate',
  ready: 'Ready',
}

/** Set or clear one stage effect; returns undefined when nothing is left so the field is dropped on save. */
export function nextFx(cur: LineFx | undefined, key: keyof LineFx, value: string): LineFx | undefined {
  const n: LineFx = { ...cur }
  if (value) n[key] = value
  else delete n[key]
  return Object.keys(n).length ? n : undefined
}

/**
 * What the stage looks like AT line `index`: mood and effects are sticky, so fold every line from the
 * top up to and including this one, exactly the way the player does at run time.
 */
export function resolveLook(lines: Line[], index: number): StageLook {
  const look: StageLook = { mood: 'flat', light: 'sway', color: '', room: '', propL: '', propR: '' }
  for (let i = 0; i <= index && i < lines.length; i++) {
    const l = lines[i]
    if (l.m) look.mood = l.m
    if (l.fx?.light) look.light = l.fx.light
    if (l.fx?.color) look.color = l.fx.color
    if (l.fx?.room) look.room = l.fx.room
    if (l.fx?.propL !== undefined) look.propL = l.fx.propL === 'none' ? '' : l.fx.propL
    if (l.fx?.propR !== undefined) look.propR = l.fx.propR === 'none' ? '' : l.fx.propR
  }
  return look
}

/** Used until /api/stagefx answers (or if the server is older): the theme's own three moods. */
export const FALLBACK_MOODS = [
  { id: 'flat', label: 'flat' },
  { id: 'up', label: 'eyebrows up' },
  { id: 'calm', label: 'calm smile' },
]

/* ---------------------------------------------------------------- audition */
// One shared "listen to this clip" player so two clips (panel + timeline) never talk over each other.
let auditionEl: HTMLAudioElement | null = null
export function audition(url: string) {
  auditionEl?.pause()
  auditionEl = new Audio(url)
  void auditionEl.play().catch(() => {})
}
export function stopAudition() {
  auditionEl?.pause()
  auditionEl = null
}

/* ------------------------------------------------------- server <-> client */

/** Everything the live player / export is built from. If this changes on the server, the preview is out of date. */
export function playerSig(r: Reel): string {
  return JSON.stringify([
    r.title, r.hook, r.stamp, r.next, r.lang,
    r.lines.map((l) => [l.id, l.s, l.h, l.d || '', l.m || '', l.log || [], l.offset || 0, l.fx || null, l.audio?.key || '', !!l.stale]),
  ])
}

/** The part of the reel the browser sends back on save. Server-owned data (audio, plan, urls) is never sent. */
export function savePayload(r: Reel) {
  return {
    title: r.title,
    hook: r.hook,
    stamp: r.stamp,
    next: r.next,
    lang: r.lang,
    music: r.music ? { volume: r.music.volume } : undefined,
    lines: r.lines.map((l) => ({ id: l.id, s: l.s, h: l.h, d: l.d, m: l.m, log: l.log, sw: l.sw, fx: l.fx, voiceId: l.voiceId, offset: l.offset })),
  }
}

/**
 * Fold a server response into what is on screen WITHOUT overwriting what the person has typed since the
 * request was sent: text, voice, order and stage details stay local; audio, plan and URLs come from the server.
 */
export function mergeServer(local: Reel, server: Reel): Reel {
  const byId = new Map(server.lines.map((l) => [l.id, l]))
  const sameMusicFile = local.music && server.music && local.music.file === server.music.file
  return {
    ...local,
    plan: server.plan,
    onLanding: server.onLanding,
    order: server.order,
    updatedAt: server.updatedAt,
    coverUrl: server.coverUrl,
    videoUrl: server.videoUrl,
    music: server.music ? { ...server.music, volume: sameMusicFile ? local.music!.volume : server.music.volume } : undefined,
    lines: local.lines.map((l) => {
      const s = byId.get(l.id)
      if (!s) return l
      const inSync = s.s.trim() === l.s.trim() && (s.voiceId || '') === (l.voiceId || '')
      return { ...l, audio: s.audio, stale: inSync ? s.stale : undefined }
    }),
  }
}