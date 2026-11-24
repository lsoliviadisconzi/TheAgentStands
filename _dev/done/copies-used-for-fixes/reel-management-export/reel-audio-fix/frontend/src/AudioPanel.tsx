import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Line, Reel, VoicesResponse } from './types'
import { audition, fmt, hue, lineState, shortVoice, STATE_LABEL, uid } from './lib'

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
}

export default function AudioPanel(p: Props) {
  const { reel, voices } = p
  const [tab, setTab] = useState<Tab>('cast')

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

  /* ------- cast: derived from the voices the lines use ------- */
  const castNames: string[] = []
  const nameOf = (l: Line) =>
    shortVoice(voices?.voices.find((v) => v.id === l.voiceId)?.label) || l.audio?.voiceLabel || 'No voice yet'
  reel.lines.forEach((l) => {
    const n = nameOf(l)
    if (!castNames.includes(n)) castNames.push(n)
  })
  const total = reel.plan.totalMs || 1
  const pending = reel.lines.filter((l) => ['new', 'stale'].includes(lineState(l)))

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
                <b>{castNames.length}</b> {castNames.length === 1 ? 'voice' : 'voices'}
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
                    background: hue(Math.max(0, castNames.indexOf(nameOf(l)))),
                    opacity: lineState(l) === 'ready' ? 1 : 0.35,
                  }}
                  title={l.s}
                />
              ))}
            </div>

            <div className="sec">Cast · {castNames.length}</div>
            <div className="cast-list">
              {castNames.map((name, i) => (
                <div key={name} className="cast-card" style={{ ['--c' as string]: hue(i) }}>
                  <span className="cast-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="cast-main">
                    <b>{name}</b>
                  </span>
                  <span className="cast-count">{reel.lines.filter((l) => nameOf(l) === name).length}</span>
                </div>
              ))}
            </div>

            <div className="sec">Speeches · {reel.lines.length}</div>
            {reel.lines.map((l, i) => {
              const st = lineState(l)
              return (
                <div key={l.id} className="speech" data-live={p.liveLine === i ? '' : undefined} style={{ ['--c' as string]: hue(Math.max(0, castNames.indexOf(nameOf(l)))) }}>
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
              <input className="vo-in" aria-label="Title" placeholder="Title" value={reel.title} onChange={(e) => p.onEdit((r) => ({ ...r, title: e.target.value }))} />
              <input className="vo-in" aria-label="Hook card" placeholder="Hook card (first 2 seconds)" value={reel.hook} onChange={(e) => p.onEdit((r) => ({ ...r, hook: e.target.value }))} />
              <input className="vo-in" aria-label="Stamp" placeholder="Closing stamp" value={reel.stamp} onChange={(e) => p.onEdit((r) => ({ ...r, stamp: e.target.value }))} />
              <input className="vo-in" aria-label="Next line" placeholder="“Next:” teaser" value={reel.next} onChange={(e) => p.onEdit((r) => ({ ...r, next: e.target.value }))} />
            </div>

            <div className="vo-sec">
              <div className="sec">Narration lines · {reel.lines.length}</div>
              <button className="vo-btn" onClick={addLine}>
                + Add line
              </button>
            </div>

            {reel.lines.map((l, i) => {
              const st = lineState(l)
              const isBusy = !!p.busy[l.id]
              return (
                <div key={l.id} className="vo-card" style={{ ['--c' as string]: hue(i) }} data-live={p.liveLine === i ? '' : undefined}>
                  <div className="vo-head">
                    <span className="line-num">{String(i + 1).padStart(2, '0')}</span>
                    <select className="vo-in" aria-label="Voice" value={l.voiceId || ''} disabled={!voices?.voices.length} onChange={(e: ChangeEvent<HTMLSelectElement>) => chooseVoice(l.id, e.target.value)}>
                      <option value="">{voices ? 'Choose a voice…' : 'Loading voices…'}</option>
                      {voices?.voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
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

                  <textarea rows={3} maxLength={2000} placeholder="What should be said…" aria-label="Text" value={l.s} onChange={(e) => patchLine(l.id, { s: e.target.value })} />

                  <details className="vo-more">
                    <summary>Stage details</summary>
                    <input className="vo-in" placeholder="Direction, e.g. “long pause”" aria-label="Direction" value={l.d || ''} onChange={(e) => patchLine(l.id, { d: e.target.value })} />
                    <div className="vo-row">
                      <label>
                        Mood{' '}
                        <select className="vo-in" value={l.m || ''} onChange={(e) => patchLine(l.id, { m: e.target.value })}>
                          <option value="">keep previous</option>
                          <option value="flat">flat</option>
                          <option value="up">eyebrows up</option>
                          <option value="calm">calm smile</option>
                        </select>
                      </label>
                      <label>
                        Beat after{' '}
                        <SecondsInput valueMs={l.h} onCommit={(ms) => patchLine(l.id, { h: ms ?? 0 })} /> s
                      </label>
                      <label title="The line starts no earlier than this time from the start of the reel. Empty = straight after the previous line.">
                        Start no earlier than{' '}
                        <SecondsInput valueMs={l.offset} placeholder="auto" allowEmpty onCommit={(ms) => patchLine(l.id, { offset: ms || undefined })} /> s
                      </label>
                    </div>
                    <small className="vo-status" data-s={reel.plan.clamped.includes(i) ? 'stale' : ''}>
                      Plays at {fmt(reel.plan.starts[i] ?? 0)}
                      {reel.plan.clamped.includes(i) && (i === 0 ? ' · the first line always follows the hook card' : ' · can’t start before the previous line ends')}
                    </small>
                    <textarea rows={2} placeholder="Terminal panel, one line each (e.g. orders_placed = 0)" aria-label="Panel lines" value={(l.log || []).join('\n')} onChange={(e) => patchLine(l.id, { log: e.target.value ? e.target.value.split('\n') : [] })} />
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
              <input type="range" min={0} max={100} value={Math.round(m.volume * 100)} onChange={(e) => p.onEdit((r) => (r.music ? { ...r, music: { ...r.music, volume: Number(e.target.value) / 100 } } : r))} />
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
function SecondsInput(p: { valueMs?: number; onCommit: (ms: number | null) => void; placeholder?: string; allowEmpty?: boolean }) {
  const [text, setText] = useState<string | null>(null) // null = not being edited
  const fromProps = p.valueMs === undefined || (p.allowEmpty && p.valueMs === 0) ? '' : String(Math.round(p.valueMs / 10) / 100)
  return (
    <input
      className="vo-in"
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
