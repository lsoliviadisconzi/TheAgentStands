import axios from 'axios'
import type { Line } from './types'

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