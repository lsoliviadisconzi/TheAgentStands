import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import type { ChangeEvent } from 'react'
import type { CastProfile, Line, Reel, StageCatalog, StageLook, VoicesResponse } from './types'
import { accentsForLang, audition, EMOTION_PRESETS, errMsg, FALLBACK_MOODS, fmt, hue, lineState, nextFx, normalizeTtsLang, resolveLook, shortVoice, STATE_LABEL, TTS_LANGUAGES, uid } from './lib'

type Tab = 'cast' | 'write' | 'music'
const VOICE_KEY = 'tas.voice'

interface Props {
  reel: Reel
  voices: VoicesResponse | null
  liveLine: number
  busy: Record<string, boolean>
  lineErr: Record<string, string>
  generatingAll: boolean
  onEdit: (fn: (r: Reel) => Reel) => void
  onGenerate: (lineId: string, voiceId: string) => void
  onGenerateAll: () => void
  onMusicFile: (f: File) => void
  onMusicRemove: () => void
  onReloadVoices: () => void
  onUploadAudio: (lineId: string, file: File) => void
  onTryLine: (look: StageLook) => void // show a line's look in the preview right now (no reload)
  uploadingAudio: Record<string, boolean>
}

export default function AudioPanel(p: Props) {
  const { reel, voices } = p
  const [tab, setTab] = useState<Tab>('cast')
  const [expandedCast, setExpandedCast] = useState<string | null>(null)
  const [uploadingRef, setUploadingRef] = useState<Record<string, boolean>>({})
  const [testText, setTestText] = useState<Record<string, string>>({})
  const [testingCast, setTestingCast] = useState<Record<string, boolean>>({})
  const [testErr, setTestErr] = useState<Record<string, string>>({})
  const [stage, setStage] = useState<StageCatalog | null>(null)
  useEffect(() => {
    axios.get<StageCatalog>('/api/stagefx').then((r) => setStage(r.data)).catch(() => {}) // older server: just the 3 theme moods
  }, [])

  const preferred = (() => {
    try {
      return localStorage.getItem(VOICE_KEY) || ''
    } catch {
      return ''
    }
  })()
  const defaultVoice = voices?.voices.some((v) => v.id === preferred) ? preferred : voices?.defaultId || ''

  const patchLine = (id: string, patch: Partial<Line>) =>
    p.onEdit((r) => ({ ...r, lines: r.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))

  /** Show this line's look in the preview immediately. `patch` is applied first so a dropdown change is visible before the state commits. */
  const tryLine = (id: string, patch?: Partial<Line>) => {
    const lines = reel.lines.map((l) => (l.id === id ? { ...l, ...patch } : l))
    p.onTryLine(resolveLook(lines, lines.findIndex((l) => l.id === id)))
  }
  const patchAndTry = (id: string, patch: Partial<Line>) => {
    patchLine(id, patch)
    tryLine(id, patch)
  }

  const addLine = () =>
    p.onEdit((r) => {
      const last = r.lines[r.lines.length - 1]
      return { ...r, lines: [...r.lines, { id: uid(), s: '', h: 1000, voiceId: last?.voiceId || defaultVoice }] }
    })

  const removeLine = (id: string) => p.onEdit((r) => ({ ...r, lines: r.lines.filter((l) => l.id !== id) }))

  const moveLine = (i: number, dir: -1 | 1) =>
    p.onEdit((r) => {
      const lines = [...r.lines]
      const j = i + dir
      if (j < 0 || j >= lines.length) return r
      ;[lines[i], lines[j]] = [lines[j], lines[i]]
      return { ...r, lines }
    })

  const listen = audition

  const chooseVoice = (lineId: string, id: string) => {
    try {
      localStorage.setItem(VOICE_KEY, id)
    } catch {
      /* private mode */
    }
    patchLine(lineId, { voiceId: id })
  }

  /* ------- cast: derived from the voices the lines use, enriched by reel.castSettings ------- */
  const castEntries: { key: string; voiceId: string; name: string }[] = []
  const castKeyOf = (l: Line) => l.voiceId || '__none__'
  const nameOf = (l: Line) => {
    const vid = l.voiceId || ''
    const custom = vid ? reel.castSettings?.[vid]?.name : undefined
    return custom || shortVoice(voices?.voices.find((v) => v.id === vid)?.label) || l.audio?.voiceLabel || 'No voice yet'
  }
  reel.lines.forEach((l) => {
    const k = castKeyOf(l)
    if (!castEntries.some((c) => c.key === k)) {
      castEntries.push({ key: k, voiceId: l.voiceId || '', name: nameOf(l) })
    }
  })

  const patchCast = (voiceId: string, patch: Partial<CastProfile>) => {
    if (!voiceId) return
    p.onEdit((r) => {
      const cur = r.castSettings?.[voiceId] || {}
      const next: CastProfile = { ...cur, ...patch }
      for (const k of Object.keys(next) as (keyof CastProfile)[]) {
        if (next[k] === undefined || next[k] === '') delete next[k]
      }
      const castSettings = { ...(r.castSettings || {}) }
      if (Object.keys(next).length) castSettings[voiceId] = next
      else delete castSettings[voiceId]
      return { ...r, castSettings: Object.keys(castSettings).length ? castSettings : undefined }
    })
  }

  const uploadCastRef = async (voiceId: string, file: File) => {
    setUploadingRef((u) => ({ ...u, [voiceId]: true }))
    try {
      const fd = new FormData()
      fd.append('audio', file)
      const { data } = await axios.post<{ refAudio: string; refAudioName: string }>(
        `/api/reels/${encodeURIComponent(reel.id)}/cast/ref-audio`,
        fd,
      )
      patchCast(voiceId, { refAudio: data.refAudio, refAudioName: data.refAudioName })
    } finally {
      setUploadingRef((u) => ({ ...u, [voiceId]: false }))
    }
  }

  const refAudioUrl = (refAudio?: string) => {
    if (!refAudio) return ''
    if (refAudio.startsWith('ref/')) return `/api/data/${refAudio}`
    if (refAudio.startsWith('/book_files/')) return `/api/tts/ref-preview?path=${encodeURIComponent(refAudio)}`
    return ''
  }

  const testCastVoice = async (voiceId: string, prof?: CastProfile) => {
    const sample = (testText[voiceId] ?? prof?.refText ?? reel.lines.find((l) => l.voiceId === voiceId)?.s ?? 'Hello, this is a quick voice check.').trim()
    if (!sample) return
    setTestingCast((t) => ({ ...t, [voiceId]: true }))
    setTestErr((e) => ({ ...e, [voiceId]: '' }))
    try {
      const res = await axios.post(
        `/api/reels/${encodeURIComponent(reel.id)}/cast/test`,
        { voiceId, text: sample, cast: prof },
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(res.data)
      audition(url)
    } catch (e) {
      setTestErr((err) => ({ ...err, [voiceId]: errMsg(e) }))
    } finally {
      setTestingCast((t) => ({ ...t, [voiceId]: false }))
    }
  }

  const total = reel.plan.totalMs || 1
  const lineSt = (l: Line) => lineState(l, reel.castSettings?.[l.voiceId || ''])
  const pending = reel.lines.filter((l) => ['new', 'stale'].includes(lineSt(l)))

  return (
    <aside className="drawer right" aria-label="Narration, cast and audio">
      <div className="dh">
        <h2>
          Audio<small>{reel.title}</small>
        </h2>
      </div>

      <div className="aud-tabs" role="tablist">
        {(
          [
            ['cast', 'Cast & lines', String(reel.lines.length)],
            ['write', 'Write & voice', ''],
            ['music', 'Music', reel.music ? '1' : ''],
          ] as [Tab, string, string][]
        ).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className="aud-tab" onClick={() => setTab(id)}>
            {label}
            {n && <small>{n}</small>}
          </button>
        ))}
      </div>

      <div className="db">
        {voices && voices.error && <div className="note warn">{voices.error}</div>}

        {/* ======================= CAST & LINES ======================= */}
        {tab === 'cast' && (
          <>
            <div className="aud-sum">
              <span className="aud-chip">
                <b>{castEntries.length}</b> {castEntries.length === 1 ? 'voice' : 'voices'}
              </span>
              <span className="aud-chip">
                <b>{reel.lines.length}</b> lines
              </span>
              <span className="aud-chip">
                <b>{(reel.plan.totalMs / 1000).toFixed(1)}</b> s
              </span>
            </div>

            <div className="aud-track" aria-label="Narration timeline">
              {reel.lines.map((l, i) => (
                <span
                  key={l.id}
                  className="aud-seg"
                  data-live={p.liveLine === i ? '' : undefined}
                  style={{
                    left: `${(reel.plan.starts[i] / total) * 100}%`,
                    width: `${Math.max(0.8, ((reel.plan.speechEnds[i] - reel.plan.starts[i]) / total) * 100)}%`,
                    background: hue(Math.max(0, castEntries.findIndex((c) => c.key === castKeyOf(l)))),
                    opacity: lineSt(l) === 'ready' ? 1 : 0.35,
                  }}
                  title={l.s}
                />
              ))}
            </div>

            <div className="sec">Cast · {castEntries.length}</div>
            <div className="cast-list">
              {castEntries.map((c, i) => {
                const isOpen = expandedCast === c.key
                const prof = c.voiceId ? reel.castSettings?.[c.voiceId] : undefined
                const voiceObj = c.voiceId ? voices?.voices.find((v) => v.id === c.voiceId) : undefined
                const lineCount = reel.lines.filter((l) => castKeyOf(l) === c.key).length
                return (
                  <div key={c.key} className="cast-item" style={{ ['--c' as string]: hue(i) }}>
                    <button
                      type="button"
                      className="cast-card expandable"
                      aria-expanded={isOpen}
                      disabled={!c.voiceId}
                      onClick={() => c.voiceId && setExpandedCast(isOpen ? null : c.key)}
                    >
                      <span className="cast-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="cast-main">
                        <b>{c.name}</b>
                        {prof?.refAudio && <small className="cast-badge">cloned</small>}
                      </span>
                      <span className="cast-count">{lineCount}</span>
                      {c.voiceId && <span className="cast-chev">{isOpen ? '▾' : '▸'}</span>}
                    </button>

                    {isOpen && c.voiceId && (
                      <div className="cast-editor">
                        <label>
                          Character name
                          <input
                            className="vo-in"
                            type="text"
                            name={`castName-${c.voiceId}`}
                            placeholder={shortVoice(voiceObj?.label) || 'Character alias…'}
                            value={prof?.name || ''}
                            onChange={(e) => patchCast(c.voiceId, { name: e.target.value })}
                          />
                        </label>

                        <div className="cast-ref">
                          <div className="cast-ref-head">
                            <span>Reference audio ({prof?.refAudio ? 'Base cloning active' : 'VoiceDesign prompt mode'})</span>
                            {prof?.refAudio && (
                              <button type="button" className="vo-btn x" onClick={() => patchCast(c.voiceId, { refAudio: undefined, refAudioName: undefined })}>
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="vo-tts-row">
                            <input
                              id={`castRefFile-${c.voiceId}`}
                              name={`castRefFile-${c.voiceId}`}
                              type="file"
                              accept="audio/*"
                              hidden
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                e.target.value = ''
                                if (f) void uploadCastRef(c.voiceId, f)
                              }}
                            />
                            <button
                              type="button"
                              className="vo-btn"
                              disabled={uploadingRef[c.voiceId]}
                              onClick={() => document.getElementById(`castRefFile-${c.voiceId}`)?.click()}
                            >
                              {uploadingRef[c.voiceId] ? 'Uploading…' : (prof?.refAudioName ? `Clip: ${prof.refAudioName}` : 'Upload ref audio')}
                            </button>
                            {prof?.refAudio && refAudioUrl(prof.refAudio) && (
                              <button
                                type="button"
                                className="vo-btn"
                                title="Listen to the reference audio clip"
                                onClick={() => audition(refAudioUrl(prof.refAudio))}
                              >
                                ▶ Play ref
                              </button>
                            )}
                            {voiceObj?.previewUrl && (
                              <button
                                type="button"
                                className="vo-btn"
                                title="Use this voice pack's preview clip as the cloning reference"
                                onClick={() => patchCast(c.voiceId, { refAudio: voiceObj.previewUrl, refAudioName: 'Voice pack preview' })}
                              >
                                Use pack preview
                              </button>
                            )}
                          </div>
                          <textarea
                            name={`castRefText-${c.voiceId}`}
                            rows={2}
                            placeholder="Exact words spoken in the reference audio (recommended for Qwen Base cloning)…"
                            value={prof?.refText || ''}
                            onChange={(e) => patchCast(c.voiceId, { refText: e.target.value })}
                          />
                        </div>

                        <div className="cast-ref">
                          <div className="cast-ref-head">
                            <span>Validate voice with a test sentence</span>
                          </div>
                          <div className="vo-tts-row">
                            <input
                              className="vo-in"
                              type="text"
                              name={`castTestText-${c.voiceId}`}
                              placeholder={prof?.refText || 'Type a test sentence to validate…'}
                              value={testText[c.voiceId] ?? ''}
                              onChange={(e) => setTestText((t) => ({ ...t, [c.voiceId]: e.target.value }))}
                            />
                            <button
                              type="button"
                              className="vo-btn primary"
                              disabled={testingCast[c.voiceId]}
                              onClick={() => void testCastVoice(c.voiceId, prof)}
                            >
                              {testingCast[c.voiceId] ? 'Testing…' : '▶ Test'}
                            </button>
                          </div>
                          {testErr[c.voiceId] && <small className="vo-status" data-s="err">{testErr[c.voiceId]}</small>}
                        </div>

                        <label>
                          <span className="cast-label-row">
                            <span>Voice description / delivery</span>
                            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <select
                                className="vo-in vo-tts-preset"
                                name={`castPreset-${c.voiceId}`}
                                aria-label="Delivery preset"
                                value=""
                                onChange={(e) => { if (e.target.value) patchCast(c.voiceId, { instruct: e.target.value }) }}
                              >
                                <option value="">Presets…</option>
                                {EMOTION_PRESETS.map((pr) => (
                                  <option key={pr.label} value={pr.value}>{pr.label}</option>
                                ))}
                              </select>
                              {voiceObj?.instruct && (
                                <button type="button" className="vo-btn quiet" onClick={() => patchCast(c.voiceId, { instruct: voiceObj.instruct })}>
                                  Load pack
                                </button>
                              )}
                            </span>
                          </span>
                          <textarea
                            name={`castInstruct-${c.voiceId}`}
                            rows={2}
                            placeholder={prof?.refAudio ? 'Optional delivery/emotion override (cloning uses reference clip)…' : (voiceObj?.instruct || 'e.g. British male, measured, dry delivery…')}
                            value={prof?.instruct ?? ''}
                            onChange={(e) => patchCast(c.voiceId, { instruct: e.target.value })}
                          />
                        </label>

                        <div className="cast-grid">
                          <label>
                            Language
                            <select
                              className="vo-in"
                              name={`castLang-${c.voiceId}`}
                              value={prof?.langCode || normalizeTtsLang(voiceObj?.langCode || reel.lang)}
                              onChange={(e) => patchCast(c.voiceId, { langCode: e.target.value, accent: undefined })}
                            >
                              {TTS_LANGUAGES.map((lg) => (
                                <option key={lg.code} value={lg.code}>{lg.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Accent
                            {(() => {
                              const activeLang = prof?.langCode || voiceObj?.langCode || reel.lang
                              const opts = accentsForLang(activeLang)
                              const isCustom = !!prof?.accent && !opts.includes(prof.accent)
                              return (
                                <>
                                  <select
                                    className="vo-in"
                                    name={`castAccent-${c.voiceId}`}
                                    value={isCustom ? '__custom__' : (prof?.accent || '')}
                                    onChange={(e) => {
                                      const v = e.target.value
                                      if (v === '__custom__') patchCast(c.voiceId, { accent: prof?.accent || 'Custom ' })
                                      else patchCast(c.voiceId, { accent: v || undefined })
                                    }}
                                  >
                                    <option value="">Default</option>
                                    {opts.map((a) => (
                                      <option key={a} value={a}>{a}</option>
                                    ))}
                                    <option value="__custom__">Custom…</option>
                                  </select>
                                  {isCustom && (
                                    <input
                                      className="vo-in"
                                      type="text"
                                      name={`castAccentCustom-${c.voiceId}`}
                                      placeholder="Custom accent…"
                                      value={prof?.accent || ''}
                                      onChange={(e) => patchCast(c.voiceId, { accent: e.target.value })}
                                    />
                                  )}
                                </>
                              )
                            })()}
                          </label>
                        </div>

                        <div className="cast-grid">
                          <label className="vo-speed">
                            <span>Rate ({(prof?.speed ?? 1).toFixed(2)}×)</span>
                            <input
                              name={`castSpeed-${c.voiceId}`}
                              type="range"
                              min={0.75}
                              max={1.35}
                              step={0.05}
                              value={prof?.speed ?? 1}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                patchCast(c.voiceId, { speed: n === 1 ? undefined : n })
                              }}
                            />
                          </label>
                          <label className="vo-speed">
                            <span>Pitch ({(prof?.pitch ?? 0) >= 0 ? `+${prof?.pitch ?? 0}` : prof?.pitch} st)</span>
                            <input
                              name={`castPitch-${c.voiceId}`}
                              type="range"
                              min={-6}
                              max={6}
                              step={0.5}
                              value={prof?.pitch ?? 0}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                patchCast(c.voiceId, { pitch: n === 0 ? undefined : n })
                              }}
                            />
                          </label>
                        </div>

                        <div className="cast-grid three">
                          <label>
                            Temp
                            <input
                              className="vo-in"
                              type="number"
                              name={`castTemp-${c.voiceId}`}
                              min={0.1}
                              max={1.5}
                              step={0.05}
                              placeholder="auto"
                              value={prof?.temperature ?? ''}
                              onChange={(e) => patchCast(c.voiceId, { temperature: e.target.value ? Number(e.target.value) : undefined })}
                            />
                          </label>
                          <label>
                            Top-P
                            <input
                              className="vo-in"
                              type="number"
                              name={`castTopP-${c.voiceId}`}
                              min={0.1}
                              max={1}
                              step={0.05}
                              placeholder="auto"
                              value={prof?.topP ?? ''}
                              onChange={(e) => patchCast(c.voiceId, { topP: e.target.value ? Number(e.target.value) : undefined })}
                            />
                          </label>
                          <label>
                            Rep. pen
                            <input
                              className="vo-in"
                              type="number"
                              name={`castRep-${c.voiceId}`}
                              min={1}
                              max={1.5}
                              step={0.05}
                              placeholder="auto"
                              value={prof?.repetitionPenalty ?? ''}
                              onChange={(e) => patchCast(c.voiceId, { repetitionPenalty: e.target.value ? Number(e.target.value) : undefined })}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="sec">Speeches · {reel.lines.length}</div>
            {reel.lines.map((l, i) => {
              const st = lineSt(l)
              return (
                <div key={l.id} className="speech" data-live={p.liveLine === i ? '' : undefined} style={{ ['--c' as string]: hue(Math.max(0, castEntries.findIndex((c) => c.key === castKeyOf(l)))) }}>
                  <div className="speech-meta">
                    <span className="line-num">{String(i + 1).padStart(2, '0')}</span>
                    <b>{nameOf(l)}</b>
                    <span className="speech-time">{fmt(reel.plan.starts[i] ?? 0)}</span>
                    {l.audio && st === 'ready' && (
                      <button className="vo-btn quiet" onClick={() => listen(l.audio!.url)} aria-label="Listen">
                        ▶
                      </button>
                    )}
                  </div>
                  <p>{l.s || <i>(empty)</i>}</p>
                  {st !== 'ready' && <small className="vo-status" data-s={st === 'stale' ? 'stale' : ''}>{STATE_LABEL[st]}</small>}
                </div>
              )
            })}
          </>
        )}

        {/* ======================= WRITE & VOICE ======================= */}
        {tab === 'write' && (
          <>
            {voices && !voices.voices.length && (
              <div className="note warn">
                No voices available. Start the Studio server (voice designs) or the TTS service, then{' '}
                <button className="lnk" onClick={p.onReloadVoices}>
                  reload the list
                </button>
                .
              </div>
            )}

            <div className="sec">Reel</div>
            <div className="vo-card">
              <input className="vo-in" name="reelTitle" aria-label="Title" placeholder="Title" value={reel.title} onChange={(e) => p.onEdit((r) => ({ ...r, title: e.target.value }))} />
              <input className="vo-in" name="reelHook" aria-label="Hook card" placeholder="Hook card (first 2 seconds)" value={reel.hook} onChange={(e) => p.onEdit((r) => ({ ...r, hook: e.target.value }))} />
              <input className="vo-in" name="reelStamp" aria-label="Stamp" placeholder="Closing stamp" value={reel.stamp} onChange={(e) => p.onEdit((r) => ({ ...r, stamp: e.target.value }))} />
              <input className="vo-in" name="reelNext" aria-label="Next line" placeholder="“Next:” teaser" value={reel.next} onChange={(e) => p.onEdit((r) => ({ ...r, next: e.target.value }))} />
            </div>

            <div className="vo-sec">
              <div className="sec">Narration lines · {reel.lines.length}</div>
              <button className="vo-btn" onClick={addLine}>
                + Add line
              </button>
            </div>

            {reel.lines.map((l, i) => {
              const st = lineSt(l)
              const isBusy = !!p.busy[l.id]
              const selectedVoice = voices?.voices.find((v) => v.id === l.voiceId)
              const studioVoices = voices?.voices.filter((v) => v.source === 'studio') || []
              const localVoices = voices?.voices.filter((v) => v.source === 'local') || []
              const langAccents = accentsForLang(reel.lang)
              const isCustomAccent = !!l.ttsAccent && !langAccents.includes(l.ttsAccent)
              const speedVal = l.ttsSpeed ?? 1
              return (
                <div key={l.id} className="vo-card" style={{ ['--c' as string]: hue(i) }} data-live={p.liveLine === i ? '' : undefined}>
                  <div className="vo-head">
                    <span className="line-num">{String(i + 1).padStart(2, '0')}</span>
                    <select className="vo-in" name={`lineVoice-${l.id}`} aria-label="Voice" value={l.voiceId || ''} disabled={!voices?.voices.length} onChange={(e: ChangeEvent<HTMLSelectElement>) => chooseVoice(l.id, e.target.value)}>
                      <option value="">{voices ? 'Choose a voice…' : 'Loading voices…'}</option>
                      {studioVoices.length > 0 && (
                        <optgroup label="Designed voices">
                          {studioVoices.map((v) => (
                            <option key={v.id} value={v.id}>
                              {shortVoice(v.label)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {localVoices.length > 0 && (
                        <optgroup label="Base models (flow)">
                          {localVoices.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <button className="vo-btn quiet" title="Move up" disabled={i === 0} onClick={() => moveLine(i, -1)}>
                      ↑
                    </button>
                    <button className="vo-btn quiet" title="Move down" disabled={i === reel.lines.length - 1} onClick={() => moveLine(i, 1)}>
                      ↓
                    </button>
                    <button className="vo-btn x" title="Delete line" disabled={reel.lines.length === 1} onClick={() => removeLine(l.id)}>
                      ×
                    </button>
                  </div>

                  <textarea name={`lineText-${l.id}`} rows={3} maxLength={2000} placeholder="What should be said…" aria-label="Text" value={l.s} onChange={(e) => patchLine(l.id, { s: e.target.value })} />

                  <div className="vo-tts">
                    <div className="vo-tts-row">
                      <input
                        className="vo-in"
                        type="text"
                        name={`lineTtsInstruct-${l.id}`}
                        aria-label="Voice delivery / emotion"
                        placeholder="Delivery / emotion (e.g. calm, sarcastic, urgent)…"
                        value={l.ttsInstruct || ''}
                        onChange={(e) => patchLine(l.id, { ttsInstruct: e.target.value || undefined })}
                      />
                      <select
                        className="vo-in vo-tts-preset"
                        name={`lineTtsPreset-${l.id}`}
                        aria-label="Emotion preset"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) patchLine(l.id, { ttsInstruct: e.target.value })
                        }}
                      >
                        <option value="">Presets…</option>
                        {EMOTION_PRESETS.map((pr) => (
                          <option key={pr.label} value={pr.value}>{pr.label}</option>
                        ))}
                      </select>
                      {(l.m || l.d) && (
                        <button
                          type="button"
                          className="vo-btn quiet"
                          title="Fill delivery from this line's stage mood and direction"
                          onClick={() => {
                            const parts = [l.m, l.d].filter(Boolean).join(', ')
                            if (parts) patchLine(l.id, { ttsInstruct: parts })
                          }}
                        >
                          From mood
                        </button>
                      )}
                    </div>

                    <div className="vo-tts-row">
                      <label className="vo-speed">
                        <span>Speed</span>
                        <input
                          name={`lineTtsSpeed-${l.id}`}
                          type="range"
                          min={0.75}
                          max={1.35}
                          step={0.05}
                          value={speedVal}
                          onChange={(e) => {
                            const n = Number(e.target.value)
                            patchLine(l.id, { ttsSpeed: n === 1 ? undefined : n })
                          }}
                        />
                        <span>{speedVal.toFixed(2)}×</span>
                      </label>

                      {selectedVoice?.source === 'local' && (
                        <div className="vo-accent">
                          <select
                            className="vo-in"
                            name={`lineTtsAccent-${l.id}`}
                            aria-label="Regional accent"
                            value={isCustomAccent ? '__custom__' : (l.ttsAccent || '')}
                            onChange={(e) => {
                              const v = e.target.value
                              if (v === '__custom__') patchLine(l.id, { ttsAccent: l.ttsAccent || 'British - ' })
                              else patchLine(l.id, { ttsAccent: v || undefined })
                            }}
                          >
                            <option value="">Accent (default for {reel.lang})</option>
                            {langAccents.map((a) => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                            <option value="__custom__">Custom accent…</option>
                          </select>
                          {isCustomAccent && (
                            <input
                              className="vo-in"
                              type="text"
                              name={`lineTtsAccentCustom-${l.id}`}
                              aria-label="Custom regional accent"
                              placeholder="e.g. en-british scottish"
                              value={l.ttsAccent || ''}
                              onChange={(e) => patchLine(l.id, { ttsAccent: e.target.value || undefined })}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <details className="vo-more">
                    <summary>Stage details</summary>
                    <input className="vo-in" name={`lineDirection-${l.id}`} placeholder="Direction, e.g. “long pause”" aria-label="Direction" value={l.d || ''} onChange={(e) => patchLine(l.id, { d: e.target.value })} />
                    <div className="vo-row">
                      <label>
                        Mood{' '}
                        <select className="vo-in" name={`lineMood-${l.id}`} value={l.m || ''} onChange={(e) => patchAndTry(l.id, { m: e.target.value })}>
                          <option value="">keep previous</option>
                          {(stage?.moods || FALLBACK_MOODS).map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Beat after{' '}
                        <SecondsInput name={`lineBeat-${l.id}`} valueMs={l.h} onCommit={(ms) => patchLine(l.id, { h: ms ?? 0 })} /> s
                      </label>
                      <label title="The line starts no earlier than this time from the start of the reel. Empty = straight after the previous line.">
                        Start no earlier than{' '}
                        <SecondsInput name={`lineOffset-${l.id}`} valueMs={l.offset} placeholder="auto" allowEmpty onCommit={(ms) => patchLine(l.id, { offset: ms || undefined })} /> s
                      </label>
                    </div>
                    {stage && (
                      <div className="vo-row" title="Lamp, colours and props stay as set until a later line changes them. The hook card resets them.">
                        {([
                          ['Light', 'light', stage.lights],
                          ['Light colour', 'color', stage.colors],
                          ['Prop left', 'propL', stage.props],
                          ['Prop right', 'propR', stage.props],
                        ] as const).map(([label, key, opts]) => (
                          <label key={key}>
                            {label}{' '}
                            <select className="vo-in" name={`lineFx-${key}-${l.id}`} value={l.fx?.[key] || ''} onChange={(e) => patchAndTry(l.id, { fx: nextFx(l.fx, key, e.target.value) })}>
                              <option value="">keep previous</option>
                              {opts.map((o) => (
                                <option key={o.id} value={o.id}>{o.label}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                        <label>
                          Room
                          <select className="vo-in" name={`lineFxRoom-${l.id}`} value={l.fx?.room || ''} onChange={(e) => patchAndTry(l.id, { fx: nextFx(l.fx, 'room', e.target.value) })}>
                            <option value="">keep previous</option>
                            {stage.rooms.map((o) => (
                              <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="vo-colorfield">
                          Room colour
                          <input className="vo-color" name={`lineFxRoomColor-${l.id}`} type="color" value={l.fx?.room || '#1d1b24'} onChange={(e) => patchAndTry(l.id, { fx: nextFx(l.fx, 'room', e.target.value) })} />
                        </label>
                        <button type="button" className="vo-btn" title="Show this line's look in the preview now. Earlier lines' settings are included. Press Replay to watch it in sequence." onClick={() => tryLine(l.id)}>
                          Try now
                        </button>
                      </div>
                    )}
                    <div className="vo-row">
                      <label className="vo-colorfield">
                        Badge colour
                        <input className="vo-color" name={`lineFxBadgeColor-${l.id}`} type="color" value={l.fx?.badgeColor || '#f2c230'} onChange={(e) => patchAndTry(l.id, { fx: nextFx(l.fx, 'badgeColor', e.target.value) })} />
                      </label>
                      <label>
                        Badge name
                        <input className="vo-in" name={`lineFxBadgeName-${l.id}`} type="text" value={l.fx?.badgeName || ''} placeholder="e.g. AGENT" onChange={(e) => patchAndTry(l.id, { fx: nextFx(l.fx, 'badgeName', e.target.value) })} />
                      </label>
                    </div>
                    <small className="vo-status" data-s={reel.plan.clamped.includes(i) ? 'stale' : ''}>
                      Plays at {fmt(reel.plan.starts[i] ?? 0)}
                      {reel.plan.clamped.includes(i) && (i === 0 ? ' · the first line always follows the hook card' : ' · can\'t start before the previous line ends')}
                    </small>
                    <textarea name={`lineLog-${l.id}`} rows={2} placeholder="Terminal panel, one line each (e.g. orders_placed = 0)" aria-label="Panel lines" value={(l.log || []).join('\n')} onChange={(e) => patchLine(l.id, { log: e.target.value ? e.target.value.split('\n') : [] })} />
                  </details>

                  <div className="vo-foot">
                    <span className="vo-status" role="status" data-s={st === 'ready' ? 'ready' : st === 'stale' ? 'stale' : p.lineErr[l.id] ? 'err' : ''}>
                      {p.lineErr[l.id] || (st === 'ready' && l.audio ? `Ready · ${(l.audio.durationMs / 1000).toFixed(1)} s` : STATE_LABEL[st])}
                    </span>
                    {l.audio && (
                      <button className="vo-btn" aria-label="Listen to this line" title={st === 'ready' ? 'Listen' : 'Listen to the previous version (outdated)'} onClick={() => listen(l.audio!.url)}>
                        ▶
                      </button>
                    )}
                    <button className="vo-btn primary" disabled={isBusy || st === 'empty' || st === 'novoice'} onClick={() => p.onGenerate(l.id, l.voiceId!)}>
                      {isBusy ? 'Generating…' : l.audio ? 'Regenerate' : 'Generate narration'}
                    </button>
                    <input
                      name={`lineAudioUpload-${l.id}`}
                      type="file"
                      accept="audio/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) p.onUploadAudio(l.id, f)
                      }}
                    />
                    <button className="vo-btn" disabled={p.uploadingAudio[l.id]} onClick={() => (document.querySelectorAll(`input[type="file"][accept="audio/*"]`)[i] as HTMLInputElement)?.click()}>
                      {p.uploadingAudio[l.id] ? 'Uploading…' : 'Upload audio'}
                    </button>
                  </div>
                </div>
              )
            })}

            {pending.some((l) => lineState(l) !== 'novoice') && (
              <div className="aud-actions">
                <button className="vo-btn primary" disabled={p.generatingAll} onClick={() => p.onGenerateAll()}>
                  {p.generatingAll ? 'Generating…' : `Generate all narration (${pending.length})`}
                </button>
              </div>
            )}
          </>
        )}

        {/* ============================ MUSIC ============================ */}
        {tab === 'music' && <MusicTab reel={reel} onEdit={p.onEdit} onFile={p.onMusicFile} onRemove={p.onMusicRemove} />}
      </div>
    </aside>
  )
}

function MusicTab(p: { reel: Reel; onEdit: Props['onEdit']; onFile: (f: File) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const m = p.reel.music
  return (
    <>
      <div className="sec">Background music</div>
      <div className="vo-card">
        {m ? (
          <>
            <b className="music-name">{m.name}</b>
            <audio src={m.url} controls preload="none" style={{ width: '100%' }} />
            <label className="vo-row">
              Volume
              <input name="musicVolume" type="range" min={0} max={100} value={Math.round(m.volume * 100)} onChange={(e) => p.onEdit((r) => (r.music ? { ...r, music: { ...r.music, volume: Number(e.target.value) / 100 } } : r))} />
              <span>{Math.round(m.volume * 100)}%</span>
            </label>
            <div className="vo-foot">
              <span className="vo-status">Loops under the voices and fades out at the end.</span>
              <button className="vo-btn" onClick={() => input.current?.click()}>
                Replace
              </button>
              <button className="vo-btn x" onClick={p.onRemove}>
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="vo-empty">Add a track to play softly under the narration. It is mixed in when you export.</p>
            <button className="vo-btn primary" onClick={() => input.current?.click()}>
              + Upload music
            </button>
          </>
        )}
        <input
          ref={input}
          name="musicFile"
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) p.onFile(f)
          }}
        />
      </div>
    </>
  )
}

/** Seconds field that keeps what you type until you leave it (a number input rewritten on every keystroke can't take "0.5"). */
function SecondsInput(p: { name?: string; valueMs?: number; onCommit: (ms: number | null) => void; placeholder?: string; allowEmpty?: boolean }) {
  const [text, setText] = useState<string | null>(null) // null = not being edited
  const fromProps = p.valueMs === undefined || (p.allowEmpty && p.valueMs === 0) ? '' : String(Math.round(p.valueMs / 10) / 100)
  return (
    <input
      className="vo-in"
      name={p.name}
      inputMode="decimal"
      placeholder={p.placeholder}
      value={text ?? fromProps}
      onFocus={() => setText(fromProps)}
      onBlur={() => setText(null)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onChange={(e) => {
        setText(e.target.value)
        const raw = e.target.value.trim().replace(',', '.')
        if (raw === '') return p.allowEmpty ? p.onCommit(null) : undefined
        const n = Number(raw)
        if (Number.isFinite(n) && n >= 0) p.onCommit(Math.round(n * 1000))
      }}
    />
  )
}