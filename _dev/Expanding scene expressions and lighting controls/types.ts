export interface LineAudio {
  file: string
  url: string
  durationMs: number
  key: string
  voiceLabel?: string
  voiceId?: string
  text?: string
}

export interface LineFx {
  light?: string
  color?: string
  room?: string
  propL?: string
  propR?: string
}

/** The fully resolved look of one line (earlier lines' sticky settings folded in). Sent to the preview by "Try now". */
export interface StageLook {
  mood: string
  light: string
  color: string
  room: string
  propL: string
  propR: string
}

export interface StageOption { id: string; label: string }
export interface StageCatalog {
  moods: StageOption[]
  lights: StageOption[]
  colors: StageOption[]
  rooms: StageOption[]
  props: StageOption[]
}

export interface Line {
  id: string
  s: string // text, spoken and typed
  h: number // beat (ms) after the line
  d?: string // stage direction
  m?: string // mood: flat | up | calm | worried | stern | surprised | smug | sleepy | wink
  fx?: LineFx // lamp, colour, room tint, props. Empty = keep what the previous line set
  log?: string[] // terminal panel lines
  sw?: [string, string][] // colour swatches (kept as-is, not editable here)
  voiceId?: string
  offset?: number // start no earlier than (ms from reel start); empty = follow the previous line
  audio?: LineAudio
  stale?: boolean
}

export interface Plan {
  holds: number[]
  starts: number[]
  speechEnds: number[]
  ends: number[]
  stampAt: number
  totalMs: number
  missingAudio: number[]
  clamped: number[] // lines whose requested start offset could not be honoured
}

export interface Music {
  file: string
  name: string
  volume: number
  url: string
}

export interface Reel {
  id: string
  title: string
  theme: string
  lang: string
  hook: string
  stamp: string
  next: string
  lines: Line[]
  music?: Music
  coverUrl?: string
  videoUrl?: string
  onLanding: boolean
  order: number
  updatedAt: number
  plan: Plan
}

export interface Voice {
  id: string
  label: string
  model: string
  kind: string
  instruct: string
  voice: string
  langCode: string
  source: 'studio' | 'local'
}

export interface VoicesResponse {
  voices: Voice[]
  defaultId: string
  source: string
  error?: string
}

export interface ThemeReel {
  n: string
  hook: string
  next: string
  stamp: string
  l: { s: string; d?: string; m?: string; h?: number; log?: string[]; sw?: [string, string][] }[]
}

export interface ThemeFile {
  title: string
  sub: string
  reels: ThemeReel[]
}

/* ---------------------------------------------------------------- narrations */

export interface NarrationScene {
  index: number
  direction: string
  text: string
  mood: string
  panel: string[]
  holdMs: number
  swatches: [string, string][]
}

export interface NarrationReel {
  theme: string
  language: string
  reel: string
  title: string
  hook: string
  stamp: string
  next: string
  scenes: NarrationScene[]
}

export interface NarrationLanguageIndex {
  theme: string
  language: string
  reels: { slug: string; title: string; hook: string; sceneCount: number }[]
}

export interface NarrationThemeIndex {
  theme: string
  title: string
  languages: Record<string, { code: string; label: string; reelCount: number }>
}

export interface NarrationsMasterIndex {
  themes: Record<string, { title: string; languages: string[] }>
}

export interface ExportJob {
  state: 'idle' | 'running' | 'done' | 'error'
  progress: number
  message: string
}