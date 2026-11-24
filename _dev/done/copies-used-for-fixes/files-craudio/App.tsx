import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import './App.css'
import AudioPanel from './AudioPanel'
import { errMsg, lineState } from './lib'
import type { ExportJob, Reel, ThemeFile, VoicesResponse } from './types'

const IDLE: ExportJob = { state: 'idle', progress: 0, message: '' }

export default function App() {
  const [reels, setReels] = useState<Reel[]>([])
  const [curId, setCurId] = useState<string | null>(null)
  const [voices, setVoices] = useState<VoicesResponse | null>(null)

  const [themes, setThemes] = useState<string[]>([])
  const [languages, setLanguages] = useState<string[]>([])
  const [theme, setTheme] = useState('')
  const [lang, setLang] = useState('')
  const [themeFile, setThemeFile] = useState<ThemeFile | null>(null)

  const [previewKey, setPreviewKey] = useState(0)
  const [previewStale, setPreviewStale] = useState(false)
  const [liveLine, setLiveLine] = useState(-1)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [lineErr, setLineErr] = useState<Record<string, string>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [job, setJob] = useState<ExportJob>(IDLE)
  const [scale, setScale] = useState(2)
  const [toast, setToast] = useState('')

  const iframe = useRef<HTMLIFrameElement>(null)
  const reelsRef = useRef<Reel[]>([])
  reelsRef.current = reels
  const timers = useRef<Record<string, number>>({})
  const dirty = useRef<Set<string>>(new Set())

  const cur = reels.find((r) => r.id === curId) || null

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? '' : t)), 5000)
  }

  /* ----------------------------------------------------------- loading */

  const loadVoices = async (refresh = false) => {
    try {
      setVoices((await axios.get<VoicesResponse>('/api/tts/voices', { params: refresh ? { refresh: 1 } : {} })).data)
    } catch (e) {
      setVoices({ voices: [], defaultId: '', source: 'none', error: errMsg(e) })
    }
  }

  useEffect(() => {
    axios.get<Reel[]>('/api/reels').then((r) => {
      setReels(r.data)
      if (r.data.length) setCurId(r.data[0].id)
    }).catch((e) => flash('Could not load reels: ' + errMsg(e)))
    axios.get<string[]>('/api/themes').then((r) => setThemes(r.data)).catch(() => setThemes([]))
    void loadVoices()
  }, [])

  // Follow-along: the preview player tells us which line is on screen.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow) return
      if (e.data?.t === 'line') setLiveLine(e.data.i)
      else if (e.data?.t === 'start' || e.data?.t === 'end') setLiveLine(-1)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // Selecting a reel restarts its preview and checks for a running export.
  useEffect(() => {
    setLiveLine(-1)
    setPreviewKey((k) => k + 1)
    setPreviewStale(false)
    setJob(IDLE)
    if (!curId) return
    axios.get<ExportJob>(`/api/reels/${curId}/export`).then((r) => setJob(r.data)).catch(() => {})
  }, [curId])

  // Poll while an export is running.
  useEffect(() => {
    if (job.state !== 'running' || !curId) return
    const id = curId
    const t = window.setInterval(async () => {
      try {
        const { data } = await axios.get<ExportJob>(`/api/reels/${id}/export`)
        setJob(data)
        if (data.state === 'done') {
          const fresh = (await axios.get<Reel>(`/api/reels/${id}`)).data
          applyServer(fresh)
        }
      } catch {
        /* transient; next tick retries */
      }
    }, 1500)
    return () => window.clearInterval(t)
  }, [job.state, curId])

  /* ---------------------------------------------------------- theme browser */

  const pickTheme = async (t: string) => {
    setTheme(t)
    setLang('')
    setThemeFile(null)
    setLanguages([])
    if (!t) return
    try {
      setLanguages((await axios.get<string[]>(`/api/themes/${t}/languages`)).data)
    } catch (e) {
      flash(errMsg(e))
    }
  }

  const pickLang = async (l: string) => {
    setLang(l)
    setThemeFile(null)
    if (!l) return
    try {
      setThemeFile((await axios.get<ThemeFile>(`/api/themes/${theme}/${l}/reels`)).data)
    } catch (e) {
      flash(errMsg(e))
    }
  }

  const importReel = async (index: number) => {
    try {
      const { data } = await axios.post<Reel>('/api/reels/import', { theme, lang, index })
      setReels((rs) => [...rs, data])
      setCurId(data.id)
    } catch (e) {
      flash('Import failed: ' + errMsg(e))
    }
  }

  const newBlank = async () => {
    try {
      const { data } = await axios.post<Reel>('/api/reels', { title: 'New reel', theme: theme || themes[0] || '', lang: lang || 'en' })
      setReels((rs) => [...rs, data])
      setCurId(data.id)
    } catch (e) {
      flash(errMsg(e))
    }
  }

  const deleteReel = async (r: Reel) => {
    if (!window.confirm(`Delete “${r.title}” and its audio and video?`)) return
    try {
      await axios.delete(`/api/reels/${r.id}`)
      setReels((rs) => rs.filter((x) => x.id !== r.id))
      if (curId === r.id) setCurId(null)
    } catch (e) {
      flash(errMsg(e))
    }
  }

  /* --------------------------------------------------- editing + autosave */

  // Take the server's derived data (audio, stale flags, plan, urls) but keep what the user is typing.
  const applyServer = (srv: Reel) =>
    setReels((rs) =>
      rs.map((r) => {
        if (r.id !== srv.id) return r
        const byId = new Map(srv.lines.map((l) => [l.id, l]))
        return {
          ...srv,
          title: r.title, hook: r.hook, stamp: r.stamp, next: r.next,
          music: srv.music ? { ...srv.music, volume: r.music?.volume ?? srv.music.volume } : undefined,
          lines: r.lines.map((l) => {
            const s = byId.get(l.id)
            return s ? { ...l, audio: s.audio, stale: s.stale } : l
          }),
        }
      })
    )

  const flush = async (id: string) => {
    window.clearTimeout(timers.current[id])
    if (!dirty.current.has(id)) return
    dirty.current.delete(id)
    const r = reelsRef.current.find((x) => x.id === id)
    if (!r) return
    try {
      const { data } = await axios.put<Reel>(`/api/reels/${id}`, {
        title: r.title, hook: r.hook, stamp: r.stamp, next: r.next, lines: r.lines,
        music: r.music ? { volume: r.music.volume } : undefined,
      })
      applyServer(data)
      setPreviewStale(true)
    } catch (e) {
      dirty.current.add(id)
      flash('Save failed: ' + errMsg(e))
    }
  }

  const edit = (fn: (r: Reel) => Reel) => {
    if (!curId) return
    const id = curId
    setReels((rs) => rs.map((r) => (r.id === id ? fn(r) : r)))
    dirty.current.add(id)
    window.clearTimeout(timers.current[id])
    timers.current[id] = window.setTimeout(() => void flush(id), 700)
  }

  /* ------------------------------------------------------------------ TTS */

  const generateOne = async (reelId: string, lineId: string, voiceId: string): Promise<boolean> => {
    setBusy((b) => ({ ...b, [lineId]: true }))
    setLineErr((e) => ({ ...e, [lineId]: '' }))
    try {
      await flush(reelId) // the server must know the latest text before it speaks it
      const { data } = await axios.post<Reel>(`/api/reels/${reelId}/lines/${lineId}/tts`, { voiceId })
      applyServer(data)
      setPreviewStale(true)
      return true
    } catch (e) {
      setLineErr((x) => ({ ...x, [lineId]: errMsg(e) }))
      return false
    } finally {
      setBusy((b) => ({ ...b, [lineId]: false }))
    }
  }

  const generateAll = async (fallbackVoice: string) => {
    if (!cur) return
    setGeneratingAll(true)
    for (const l of reelsRef.current.find((r) => r.id === cur.id)?.lines || []) {
      const st = lineState(l)
      if (st !== 'new' && st !== 'stale') continue
      if (!(await generateOne(cur.id, l.id, l.voiceId || fallbackVoice))) break
    }
    setGeneratingAll(false)
    setPreviewKey((k) => k + 1)
    setPreviewStale(false)
  }

  /* ---------------------------------------------------------- music/export */

  const uploadMusic = async (file: File) => {
    if (!curId) return
    const fd = new FormData()
    fd.append('music', file)
    try {
      applyServer((await axios.post<Reel>(`/api/reels/${curId}/music`, fd)).data)
    } catch (e) {
      flash('Upload failed: ' + errMsg(e))
    }
  }

  const removeMusic = async () => {
    if (!curId) return
    try {
      applyServer((await axios.delete<Reel>(`/api/reels/${curId}/music`)).data)
    } catch (e) {
      flash(errMsg(e))
    }
  }

  const toggleLanding = async (r: Reel) => {
    try {
      applyServer((await axios.put<Reel>(`/api/reels/${r.id}`, { onLanding: !r.onLanding })).data)
    } catch (e) {
      flash(errMsg(e))
    }
  }

  const startExport = async () => {
    if (!cur) return
    try {
      await flush(cur.id)
      const { data } = await axios.post<ExportJob>(`/api/reels/${cur.id}/export`, { scale })
      setJob(data)
    } catch (e) {
      flash(errMsg(e))
    }
  }

  const ready = !!cur && cur.lines.length > 0 && cur.lines.every((l) => lineState(l) === 'ready')
  const exporting = job.state === 'running'

  /* ------------------------------------------------------------------ view */

  return (
    <div className="studio">
      {/* ------------------------------ left: library ------------------------------ */}
      <aside className="drawer left">
        <div className="dh">
          <h2>
            Reel Manager<small>{reels.length} reels</small>
          </h2>
        </div>
        <div className="db">
          <div className="sec first">Theme library</div>
          <div className="lib-pick">
            <select value={theme} onChange={(e) => void pickTheme(e.target.value)} aria-label="Theme">
              <option value="">Theme…</option>
              {themes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={lang} disabled={!theme} onChange={(e) => void pickLang(e.target.value)} aria-label="Language">
              <option value="">Language…</option>
              {languages.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
          </div>

          {themeFile && (
            <>
              <p className="lib-sub">{themeFile.sub}</p>
              {themeFile.reels.map((tr, i) => (
                <div key={i} className="row">
                  <span className="row-main">
                    <b>{i + 1}. {tr.n}</b>
                    <small>{tr.l.length} lines · {tr.hook}</small>
                  </span>
                  <button className="vo-btn" onClick={() => void importReel(i)}>Import</button>
                </div>
              ))}
            </>
          )}

          <div className="sec">My reels</div>
          {reels.length === 0 && <p className="vo-empty">Nothing here yet. Pick a theme and language above, then import a reel.</p>}
          {reels.map((r) => {
            const done = r.lines.filter((l) => lineState(l) === 'ready').length
            return (
              <div key={r.id} className="row" aria-current={r.id === curId} onClick={() => setCurId(r.id)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') setCurId(r.id) }}>
                {r.coverUrl ? <img className="thumb" src={r.coverUrl} alt="" /> : <span className="thumb empty" />}
                <span className="row-main">
                  <b>{r.title}</b>
                  <small>{r.theme || 'no theme'} · {r.lang.toUpperCase()} · voice {done}/{r.lines.length}{r.videoUrl ? ' · MP4 ✓' : ''}</small>
                </span>
                <button className="vo-btn x" title="Delete" onClick={(e) => { e.stopPropagation(); void deleteReel(r) }}>×</button>
              </div>
            )
          })}
          <button className="vo-btn" style={{ marginTop: 8 }} onClick={() => void newBlank()}>+ New blank reel</button>
        </div>
      </aside>

      {/* ------------------------------ centre: preview ------------------------------ */}
      <main className="center">
        {!cur ? (
          <div className="empty-stage">Import a reel from the theme library to start.</div>
        ) : (
          <>
            <div className="toolbar">
              <b className="tb-title">{cur.title}</b>
              {previewStale && <button className="vo-btn" onClick={() => { setPreviewKey((k) => k + 1); setPreviewStale(false) }}>↻ Update preview</button>}
              <label className="tb-check">
                <input type="checkbox" checked={cur.onLanding} onChange={() => void toggleLanding(cur)} /> On landing
              </label>
              <select value={scale} onChange={(e) => setScale(Number(e.target.value))} disabled={exporting} aria-label="Export size">
                <option value={1}>360×640 (fast)</option>
                <option value={2}>720×1280</option>
                <option value={3}>1080×1920</option>
              </select>
              <button className="vo-btn primary" disabled={!ready || exporting} onClick={() => void startExport()}
                title={ready ? 'Capture the animated player and mix the narration' : 'Generate narration for every line first'}>
                {exporting ? 'Exporting…' : 'Export MP4'}
              </button>
            </div>

            {exporting && (
              <div className="progress" role="progressbar" aria-valuenow={Math.round(job.progress * 100)}>
                <span style={{ width: `${job.progress * 100}%` }} />
                <small>{job.message}</small>
              </div>
            )}
            {job.state === 'error' && <div className="note warn">Export failed: {job.message}</div>}

            <iframe ref={iframe} key={previewKey} className="preview" title="Reel preview" allow="autoplay"
              src={`/api/reels/${cur.id}/player?k=${previewKey}`} />

            {cur.videoUrl && (
              <div className="video-bar">
                <a href={cur.videoUrl} target="_blank" rel="noreferrer">Open exported MP4</a>
                <a href={cur.videoUrl} download={`${cur.title}.mp4`}>Download</a>
              </div>
            )}
          </>
        )}
      </main>

      {/* ------------------------------ right: audio ------------------------------ */}
      {cur && (
        <AudioPanel
          reel={cur} voices={voices} liveLine={liveLine} busy={busy} lineErr={lineErr} generatingAll={generatingAll}
          onEdit={edit}
          onGenerate={(lineId, voiceId) => void generateOne(cur.id, lineId, voiceId).then(() => setPreviewKey((k) => k + 1))}
          onGenerateAll={(v) => void generateAll(v)}
          onMusicFile={(f) => void uploadMusic(f)}
          onMusicRemove={() => void removeMusic()}
          onReloadVoices={() => void loadVoices(true)}
        />
      )}

      {toast && <div className="toast" role="alert">{toast}</div>}
    </div>
  )
}
