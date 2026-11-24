import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import AudioPanel from './AudioPanel'
import type { Reel, StageLook, ThemeReel, VoicesResponse, ExportJob, NarrationsMasterIndex, NarrationThemeIndex, NarrationLanguageIndex } from './types'
import { audition, errMsg, fmt, hue, lineState } from './lib'
import { useReelEditor } from './useReelEditor'

const API = '/api'

function App() {
  const [reels, setReels] = useState<Reel[]>([])
  const [voices, setVoices] = useState<VoicesResponse | null>(null)
  const [themeReels, setThemeReels] = useState<ThemeReel[]>([])
  const [themes, setThemes] = useState<string[]>([])
  const [languages, setLanguages] = useState<string[]>([])
  const [selectedTheme, setSelectedTheme] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('')
  const [loadingTheme, setLoadingTheme] = useState(false)

  /* Narration browser state */
  const [narrationThemes, setNarrationThemes] = useState<NarrationsMasterIndex['themes']>({})
  const [narrationTheme, setNarrationTheme] = useState<NarrationThemeIndex | null>(null)
  const [narrationLanguage, setNarrationLanguage] = useState<NarrationLanguageIndex | null>(null)
  const [selectedNarrationThemeSlug, setSelectedNarrationThemeSlug] = useState('')
  const [selectedNarrationLanguage, setSelectedNarrationLanguage] = useState('')
  const [loadingNarration, setLoadingNarration] = useState(false)
  const [exportJob, setExportJob] = useState<ExportJob>({ state: 'idle', progress: 0, message: '' })
  const [liveLine, setLiveLine] = useState(-1)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const playheadRef = useRef<HTMLDivElement | null>(null)
  const clockLabelRef = useRef<HTMLSpanElement | null>(null)
  // wall-clock model of the live player: origin = performance.now() at reel time 0
  const clock = useRef({ origin: 0, running: false, paused: false, frozen: 0 })
  const playerRef = useRef<HTMLIFrameElement | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [drawerWidth, setDrawerWidth] = useState(360)
  const studioRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ lineId: string; index: number; startX: number; startOffset: number; delta: number } | null>(null)
  
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = drawerWidth
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.max(160, Math.min(480, startWidth + delta))
      setDrawerWidth(newWidth)
      if (studioRef.current) {
        studioRef.current.style.setProperty('--drawer-w', `${newWidth}px`)
      }
    }
    
    const handleMouseUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // ---- timeline drag-to-move ----
  // Dragging a segment changes its `offset` (start no earlier than) so the line
  // moves without changing its length. The plan re-measures and clamps as needed.

  const onDragStart = (e: React.MouseEvent, i: number, lineId: string) => {
    const tl = timelineRef.current
    if (!tl) return
    const rect = tl.getBoundingClientRect()
    const startMs = selectedReel.plan.starts[i]
    const cur = selectedReel.lines[i].offset ?? 0
    setDrag({ lineId, index: i, startX: e.clientX, startOffset: cur, delta: 0 })
    e.preventDefault()
  }

  const onDragMove = (e: MouseEvent) => {
    if (!drag || !timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const total = selectedReel.plan.totalMs || 1
    const pxPerMs = rect.width / total
    const deltaMs = Math.round((e.clientX - drag.startX) / pxPerMs)
    const newOffset = Math.max(0, drag.startOffset + deltaMs)
    setDrag((d) => d ? { ...d, delta: newOffset - drag.startOffset } : null)
    handleEdit((r) => ({
      ...r,
      lines: r.lines.map((l, i) =>
        i === drag.index ? { ...l, offset: newOffset } : l
      ),
    }))
  }

  const onDragEnd = () => {
    if (drag) {
      handleEdit((r) => ({
        ...r,
        lines: r.lines.map((l, i) =>
          i === drag.index && l.offset === 0 ? { ...l, offset: undefined } : l
        ),
      }))
    }
    setDrag(null)
  }

  // ---- boot ----
  useEffect(() => {
    fetchReels()
    fetchVoices()
    fetchThemes()
    fetchNarrationThemes()
  }, [])

  // ---- helpers ----
  const fetchReels = async () => {
    try {
      const { data } = await axios.get<Reel[]>(`${API}/reels`)
      setReels(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch reels', e)
      setReels([])
    }
  }

  const {
    reel: selectedReel, reelRef, select: setSelectedReel, edit: handleEdit, flush, refresh, setMusic,
    saveState, busy, lineErr, generatingAll, generate: onGenerate, generateAll: onGenerateAll,
    previewNonce, reloadPreview, previewStale,
  } = useReelEditor(fetchReels)

  const fetchVoices = async () => {
    try {
      const { data } = await axios.get<VoicesResponse>(`${API}/tts/voices`)
      setVoices(data)
    } catch (e) {
      console.error('Failed to fetch voices', e)
      setVoices({ voices: [], defaultId: '', source: 'none', error: errMsg(e) })
    }
  }

  const fetchThemes = async () => {
    try {
      const { data } = await axios.get<string[]>(`${API}/themes`)
      setThemes(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch themes', e)
      setThemes([])
    }
  }

  const fetchNarrationThemes = async () => {
    try {
      const { data } = await axios.get<NarrationsMasterIndex>(`${API}/narrations`)
      setNarrationThemes(data.themes || {})
    } catch (e) {
      console.error('Failed to fetch narration themes', e)
      setNarrationThemes({})
    }
  }

  const fetchNarrationTheme = useCallback(async (slug: string) => {
    setLoadingNarration(true)
    try {
      const { data } = await axios.get<NarrationThemeIndex>(`${API}/narrations/${encodeURIComponent(slug)}`)
      setNarrationTheme(data)
      setNarrationLanguage(null)
      setSelectedNarrationLanguage('')
    } catch (e) {
      console.error('Failed to fetch narration theme', e)
      setNarrationTheme(null)
    } finally {
      setLoadingNarration(false)
    }
  }, [])

  const fetchNarrationLanguage = useCallback(async (themeSlug: string, lang: string) => {
    setLoadingNarration(true)
    try {
      const { data } = await axios.get<NarrationLanguageIndex>(`${API}/narrations/${encodeURIComponent(themeSlug)}/${encodeURIComponent(lang)}`)
      setNarrationLanguage(data)
    } catch (e) {
      console.error('Failed to fetch narration language', e)
      setNarrationLanguage(null)
    } finally {
      setLoadingNarration(false)
    }
  }, [])

  const fetchLanguages = useCallback(async (theme: string) => {
    try {
      const { data } = await axios.get<string[]>(`${API}/themes/${encodeURIComponent(theme)}/languages`)
      setLanguages(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch languages', e)
      setLanguages([])
    }
  }, [])

  const fetchThemeReels = async (theme: string, language: string) => {
    setLoadingTheme(true)
    try {
      const { data } = await axios.get<{ reels: ThemeReel[] }>(`${API}/themes/${encodeURIComponent(theme)}/${encodeURIComponent(language)}/reels`)
      setThemeReels(data.reels || [])
    } catch (e) {
      console.error('Failed to fetch theme reels', e)
      setThemeReels([])
    } finally {
      setLoadingTheme(false)
    }
  }

  // ---- "Try now": show one line's look (mood, lamp, room, props) in the running preview, no reload ----
  const onTryLine = useCallback((look: StageLook) => {
    playerRef.current?.contentWindow?.postMessage({ t: 'fx-try', look }, window.location.origin)
  }, [])

  // ---- live playhead: follows the real player instead of guessing ----
  const paintPlayhead = useCallback((ms: number) => {
    const total = reelRef.current?.plan.totalMs || 1
    const clamped = Math.max(0, Math.min(ms, total))
    if (playheadRef.current) playheadRef.current.style.left = `${(clamped / total) * 100}%`
    if (clockLabelRef.current) clockLabelRef.current.textContent = fmt(clamped)
  }, [reelRef])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!e.data?.t || e.source !== playerRef.current?.contentWindow) return // only our own preview
      const c = clock.current
      const plan = reelRef.current?.plan
      const now = performance.now()
      switch (e.data.t) {
        case 'start':
          clock.current = { origin: now, running: true, paused: false, frozen: 0 }
          setLiveLine(-1)
          break
        case 'line': {
          setLiveLine(e.data.i)
          const st = plan?.starts[e.data.i]
          if (typeof st === 'number') c.origin = now - st // re-sync to the planned start of this line
          break
        }
        case 'pause':
          c.paused = !!e.data.paused
          if (c.paused) c.frozen = now - c.origin
          else c.origin = now - c.frozen
          break
        case 'end': // the stamp has slammed in
          setLiveLine(-1)
          if (plan) c.origin = now - plan.stampAt
          break
        case 'audioblocked':
          setAudioBlocked(true)
          break
      }
    }
    window.addEventListener('message', onMessage)
    let raf = 0
    const tick = () => {
      const c = clock.current
      if (c.running && !c.paused) paintPlayhead(performance.now() - c.origin)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('message', onMessage)
      cancelAnimationFrame(raf)
    }
  }, [paintPlayhead, reelRef])

  // A fresh preview document starts from zero.
  useEffect(() => {
    clock.current = { origin: 0, running: false, paused: false, frozen: 0 }
    setLiveLine(-1)
    setAudioBlocked(false)
    paintPlayhead(0)
  }, [previewNonce, paintPlayhead])

  // ---- actions ----

  const onMusicFile = async (file: File) => {
    if (!selectedReel) return
    const fd = new FormData()
    fd.append('music', file)
    try {
      await flush()
      const { data } = await axios.post<Reel>(`${API}/reels/${encodeURIComponent(selectedReel.id)}/music`, fd)
      setMusic(data)
    } catch (e) {
      console.error('Music upload failed', e)
    }
  }

  const onMusicRemove = async () => {
    if (!selectedReel) return
    try {
      await flush()
      const { data } = await axios.delete<Reel>(`${API}/reels/${encodeURIComponent(selectedReel.id)}/music`)
      setMusic(data)
    } catch (e) {
      console.error('Music remove failed', e)
    }
  }

  const [uploadingAudio, setUploadingAudio] = useState<Record<string, boolean>>({})

  const onUploadAudio = async (lineId: string, file: File) => {
    if (!selectedReel) return
    const fd = new FormData()
    fd.append('audio', file)
    setUploadingAudio((s) => ({ ...s, [lineId]: true }))
    try {
      await flush()
      const { data } = await axios.post<Reel>(`${API}/reels/${encodeURIComponent(selectedReel.id)}/lines/${encodeURIComponent(lineId)}/audio`, fd)
      setMusic(data)
      void reloadPreview()
    } catch (e) {
      console.error('Audio upload failed', e)
    } finally {
      setUploadingAudio((s) => ({ ...s, [lineId]: false }))
    }
  }

  const onReloadVoices = async () => {
    try {
      const { data } = await axios.get<VoicesResponse>(`${API}/tts/voices`, { params: { refresh: '1' } })
      setVoices(data)
    } catch (e) {
      console.error('Voice reload failed', e)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    const title = String(fd.get('title') || '').trim()
    const theme = String(fd.get('theme') || '').trim()
    const lang = String(fd.get('lang') || 'en').trim()
    if (!title) return
    try {
      const { data } = await axios.post<Reel>(`${API}/reels`, { title, theme, lang })
      setSelectedReel(data)
      fetchReels()
    } catch (e) {
      console.error('Create failed', e)
    }
  }

  const handleImport = async (theme: string, lang: string, index: number) => {
    try {
      const { data } = await axios.post<Reel>(`${API}/reels/import`, { theme, lang, index })
      setSelectedReel(data)
      fetchReels()
    } catch (e) {
      console.error('Import failed', e)
    }
  }

  const handleImportNarration = async (themeSlug: string, language: string, reelSlug: string) => {
    try {
      const { data } = await axios.post<Reel>(`${API}/reels/import-narration`, { themeSlug, language, reelSlug })
      setSelectedReel(data)
      fetchReels()
    } catch (e) {
      console.error('Import narration failed', e)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${API}/reels/${encodeURIComponent(id)}`)
      if (selectedReel?.id === id) setSelectedReel(null)
      fetchReels()
    } catch (e) {
      console.error('Delete failed', e)
    }
  }

  const handleExport = async (id: string) => {
    setExportJob({ state: 'running', progress: 0, message: 'Saving…' })
    try {
      await flush() // the export is built from the SAVED reel, so make sure it is
      await axios.post(`${API}/reels/${encodeURIComponent(id)}/export`, { scale: 2 })
      pollExport(id)
    } catch (e) {
      setExportJob({ state: 'error', progress: 0, message: errMsg(e) })
    }
  }

  const pollExport = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = window.setInterval(async () => {
      try {
        const { data } = await axios.get<ExportJob>(`${API}/reels/${encodeURIComponent(id)}/export`)
        setExportJob(data)
        if (data.state === 'done' || data.state === 'error') {
          clearInterval(pollRef.current!)
          fetchReels()
          void refresh() // new videoUrl / auto cover
        }
      } catch (e) {
        console.error('Export poll failed', e)
      }
    }, 1000)
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedReel || !e.target.files?.[0]) return
    const fd = new FormData()
    fd.append('cover', e.target.files[0])
    try {
      await axios.post(`${API}/reels/${encodeURIComponent(selectedReel.id)}/cover`, fd)
      fetchReels()
    } catch (e) {
      console.error('Cover upload failed', e)
    }
  }
  void handleCoverUpload

  const handleToggleLanding = async (reel: Reel) => {
    try {
      const { data } = await axios.put<Reel>(`${API}/reels/${encodeURIComponent(reel.id)}`, { onLanding: !reel.onLanding })
      if (selectedReel?.id === reel.id) setMusic(data) // refresh the open reel too (checkbox in the toolbar)
      else fetchReels()
    } catch (e) {
      console.error('Toggle landing failed', e)
    }
  }

  const handleThemeChange = (theme: string) => {
    setSelectedTheme(theme)
    setSelectedLanguage('')
    setThemeReels([])
    fetchLanguages(theme)
  }

  const handleLanguageChange = (lang: string) => {
    setSelectedLanguage(lang)
    if (selectedTheme) fetchThemeReels(selectedTheme, lang)
  }

  const handleNarrationThemeSelect = (slug: string) => {
    setSelectedNarrationThemeSlug(slug)
    setSelectedNarrationLanguage('')
    fetchNarrationTheme(slug)
  }

  const handleNarrationLanguageSelect = (lang: string) => {
    setSelectedNarrationLanguage(lang)
    if (selectedNarrationThemeSlug) fetchNarrationLanguage(selectedNarrationThemeSlug, lang)
  }

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`
  }

  // ---- render ----
  return (
    <div className="app">
      <header className="app-header">
        <h1>TheAgentStands · Reel Manager</h1>
      </header>

      <div className="studio" ref={studioRef} data-resizing={isResizing}>
        <div className="resize-handle" onMouseDown={handleResizeStart} />
        {/* ---------- LEFT: Library ---------- */}
        <aside className="drawer left" aria-label="Reel library">
          <div className="dh">
            <h2>Reels<small>{reels.length} in collection</small></h2>
          </div>
          <div className="db">
            {/* --- Create new --- */}
            <form className="sec first" onSubmit={handleCreate}>
              <input className="lib-in" name="title" placeholder="Title" required />
              <div className="lib-pick">
                <select name="theme" className="vo-in">
                  <option value="">Theme (optional)</option>
                  {themes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select name="lang" className="vo-in">
                  <option value="en">en</option>
                  {languages.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <button className="vo-btn primary" type="submit">Create reel</button>
            </form>

            {/* --- Narration Browser (AFS-style) --- */}
            <div className="sec">Narrations</div>
            {Object.keys(narrationThemes).length === 0 ? (
              <p className="note">No narration data. Run sync script.</p>
            ) : (
              <>
                <div className="lib-pick">
                  <select className="vo-in" value={selectedNarrationThemeSlug} onChange={(e) => handleNarrationThemeSelect(e.target.value)}>
                    <option value="">-- Select Theme --</option>
                    {Object.entries(narrationThemes).map(([slug, data]) => (
                      <option key={slug} value={slug}>{data.title} <small>({data.languages.length} langs)</small></option>
                    ))}
                  </select>
                  <select className="vo-in" value={selectedNarrationLanguage} onChange={(e) => handleNarrationLanguageSelect(e.target.value)} disabled={!selectedNarrationThemeSlug}>
                    <option value="">-- Language --</option>
                    {narrationTheme?.languages && Object.entries(narrationTheme.languages).map(([code, data]) => (
                      <option key={code} value={code}>{data.label} ({data.reelCount})</option>
                    ))}
                  </select>
                </div>
                {loadingNarration && <p className="note">Loading…</p>}
                {!loadingNarration && narrationLanguage && narrationLanguage.reels.length > 0 && (
                  <div className="sec">{narrationLanguage.theme} · {narrationLanguage.language.toUpperCase()} — {narrationLanguage.reels.length} reels</div>
                )}
                {!loadingNarration && narrationLanguage && narrationLanguage.reels.map((nr) => (
                  <div key={nr.slug} className="row" onClick={() => handleImportNarration(selectedNarrationThemeSlug, selectedNarrationLanguage, nr.slug)}>
                    <div className="row-main">
                      <b>{nr.title}</b>
                      <small>{nr.hook} · {nr.sceneCount} scenes</small>
                    </div>
                    <span className="vo-btn quiet">Import</span>
                  </div>
                ))}
              </>
            )}

            <hr style={{ borderColor: 'var(--line)', margin: '12px 0' }} />

            {/* --- Theme browser (legacy HTML) --- */}
            <div className="sec">Theme browser (HTML)</div>
            <div className="lib-pick">
              <select className="vo-in" value={selectedTheme} onChange={(e) => handleThemeChange(e.target.value)}>
                <option value="">-- Select Theme --</option>
                {themes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="vo-in" value={selectedLanguage} onChange={(e) => handleLanguageChange(e.target.value)} disabled={!selectedTheme}>
                <option value="">-- Language --</option>
                {languages.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
              </select>
            </div>
            {loadingTheme && <p className="note">Loading reels…</p>}
            {!loadingTheme && themeReels.length > 0 && (
              <div className="sec">{selectedTheme} · {selectedLanguage.toUpperCase()} — {themeReels.length} reels</div>
            )}
            {!loadingTheme && themeReels.map((tr, idx) => (
              <div key={idx} className="row" onClick={() => handleImport(selectedTheme, selectedLanguage, idx)}>
                <div className="row-main">
                  <b>{idx + 1}. {tr.n}</b>
                  <small>{tr.hook}</small>
                </div>
                <span className="vo-btn quiet">Import</span>
              </div>
            ))}

            <hr style={{ borderColor: 'var(--line)', margin: '12px 0' }} />

            {/* --- My reels --- */}
            <div className="sec">My reels · {reels.length}</div>
            {reels.length === 0 ? (
              <p className="note">No reels yet. Create one above or import from a theme.</p>
            ) : (
              reels.map((r) => (
                <div
                  key={r.id}
                  className="row"
                  aria-current={selectedReel?.id === r.id ? 'true' : 'false'}
                  onClick={() => setSelectedReel(r)}
                >
                  {(r.coverUrl || r.videoUrl) && (
                    <img
                      className="thumb"
                      src={r.coverUrl || r.videoUrl || ''}
                      alt=""
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                  <div className="row-main">
                    <b>{r.title}</b>
                    <small>{r.theme || 'custom'} · {r.lang} · {r.lines.length} lines · {(r.plan.totalMs / 1000).toFixed(1)} s</small>
                  </div>
                  <label className="tb-check">
                    <input type="checkbox" checked={r.onLanding} onChange={() => handleToggleLanding(r)} onClick={(e) => e.stopPropagation()} />
                    <span>Landing</span>
                  </label>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ---------- CENTRE: Preview ---------- */}
        <section className="center" aria-label="Preview">
          {selectedReel ? (
            <>
              <div className="toolbar">
                <span className="tb-title">{selectedReel.title}</span>
                <span className="tb-save" data-s={saveState} role="status">
                  {{ idle: 'Saved', dirty: 'Unsaved…', saving: 'Saving…', error: 'Save failed, will retry on next edit' }[saveState]}
                </span>
                <label className="tb-check">
                  <input type="checkbox" checked={selectedReel.onLanding} onChange={() => handleToggleLanding(selectedReel)} />
                  <span>On Landing</span>
                </label>
                <select className="vo-in" value={selectedReel.lang} onChange={(e) => handleEdit((r) => ({ ...r, lang: e.target.value }))}>
                  {Array.from(new Set([selectedReel.lang, ...languages])).map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <button className={`vo-btn${previewStale ? ' primary' : ''}`} onClick={() => void reloadPreview()} title="Rebuild the preview from the saved reel and play it from the start">
                  {previewStale ? '↻ Update preview' : '↻ Replay'}
                </button>
              </div>

              {audioBlocked && (
                <div className="note warn">The browser blocked sound in the preview. Press "Replay" (a click allows audio) and it will play.</div>
              )}

              <iframe
                ref={playerRef}
                key={previewNonce}
                className="preview"
                src={`${API}/reels/${encodeURIComponent(selectedReel.id)}/player?v=${previewNonce}`}
                title="Reel preview"
                allow="autoplay"
              />

              {/* Timeline: planned layout of the reel; the playhead follows the real player */}
              {(() => {
                const plan = selectedReel.plan
                const total = plan.totalMs || 1
                const pct = (ms: number) => `${(ms / total) * 100}%`
                const voices: string[] = []
                selectedReel.lines.forEach((l) => { if (!voices.includes(l.voiceId || '')) voices.push(l.voiceId || '') })
                return (
                  <div className="timeline-container">
                    <div className="timeline" role="group" aria-label="Reel timeline" ref={timelineRef} onMouseUp={onDragEnd} onMouseMove={onDragMove as any}>
                      <div className="tl-band tl-hook" style={{ left: 0, width: pct(plan.starts[0] ?? 0) }} title="Hook card" />
                      {selectedReel.lines.map((l, i) => {
                        const st = lineState(l)
                        const span = Math.max(1, plan.ends[i] - plan.starts[i])
                        const isDragging = drag?.index === i
                        return (
                          <button
                            key={l.id}
                            className="tl-line"
                            data-live={liveLine === i ? '' : undefined}
                            data-ready={st === 'ready'}
                            data-clamped={plan.clamped.includes(i)}
                            data-dragging={isDragging ? '' : undefined}
                            style={{ left: pct(plan.starts[i]), width: pct(span), ['--c' as string]: hue(voices.indexOf(l.voiceId || '')) }}
                            title={`Line ${i + 1} · ${fmt(plan.starts[i])}\n${l.s.slice(0, 80)}${st === 'ready' ? '\nClick to listen' : '\n' + (st === 'stale' ? 'Narration is out of date' : 'No narration yet')}\nDrag to move`}
                            onClick={() => l.audio && st === 'ready' && audition(l.audio.url)}
                            onMouseDown={(e) => onDragStart(e, i, l.id)}
                          >
                            <span className="tl-speech" style={{ width: `${Math.min(100, ((plan.speechEnds[i] - plan.starts[i]) / span) * 100)}%` }} />
                            <span className="tl-num">{i + 1}</span>
                            {l.offset !== undefined && <small className="tl-offset">{fmt(l.offset)}</small>}
                          </button>
                        )
                      })}
                      <div className="tl-band tl-stamp" style={{ left: pct(plan.stampAt), width: pct(total - plan.stampAt) }} title="Closing stamp" />
                      <div className="timeline-playhead" ref={playheadRef} style={{ left: 0 }} />
                    </div>
                    <div className="timeline-labels">
                      <span ref={clockLabelRef}>0:00.0</span>
                      <span>{liveLine >= 0 ? `Line ${liveLine + 1} of ${selectedReel.lines.length}` : 'Hook / stamp'}</span>
                      <span>{formatTime(total)}</span>
                    </div>
                    {plan.missingAudio.length > 0 && (
                      <small className="note">Narration missing or out of date for line {plan.missingAudio.map((i) => i + 1).join(', ')}. The preview is silent there and export is blocked until they are generated.</small>
                    )}
                  </div>
                )
              })()}

              <div className="video-bar">
                {selectedReel.videoUrl && <a href={selectedReel.videoUrl} target="_blank" rel="noopener">Open MP4</a>}
                <button className="vo-btn primary" onClick={() => handleExport(selectedReel.id)} disabled={exportJob.state === 'running'}>
                  {exportJob.state === 'running' ? `Exporting… ${Math.round(exportJob.progress * 100)}%` : selectedReel.videoUrl ? 'Re-export MP4' : 'Export MP4'}
                </button>
                <button className="vo-btn x" onClick={() => handleDelete(selectedReel.id)}>Delete reel</button>
              </div>

              {exportJob.state === 'running' && (
                <div className="progress" style={{ marginTop: 8 }}>
                  <span style={{ width: `${exportJob.progress * 100}%` }} />
                  <small>{exportJob.message}</small>
                </div>
              )}
            </>
          ) : (
            <div className="empty-stage">
              <h2>Select a reel</h2>
              <p className="note">Pick one from the library or import from a theme.</p>
            </div>
          )}
        </section>

        {/* ---------- RIGHT: Audio drawer ---------- */}
        {selectedReel && (
          <AudioPanel
            reel={selectedReel}
            voices={voices}
            liveLine={liveLine}
            busy={busy}
            lineErr={lineErr}
            generatingAll={generatingAll}
            onEdit={handleEdit}
            onGenerate={onGenerate}
            onGenerateAll={onGenerateAll}
            onMusicFile={onMusicFile}
            onMusicRemove={onMusicRemove}
            onReloadVoices={onReloadVoices}
            onUploadAudio={onUploadAudio}
            onTryLine={onTryLine}
            uploadingAudio={uploadingAudio}
          />
        )}
      </div>
    </div>
  )
}

export default App