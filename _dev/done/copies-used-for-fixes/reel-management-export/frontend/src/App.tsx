import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import AudioPanel from './AudioPanel'
import type { Reel, ThemeReel, VoicesResponse, ExportJob, NarrationReel, NarrationsMasterIndex, NarrationThemeIndex, NarrationLanguageIndex } from './types'
import { errMsg, lineState } from './lib'

const API = '/api'

function App() {
  const [reels, setReels] = useState<Reel[]>([])
  const [voices, setVoices] = useState<VoicesResponse | null>(null)
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null)
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
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [lineErr, setLineErr] = useState<Record<string, string>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [exportJob, setExportJob] = useState<ExportJob>({ state: 'idle', progress: 0, message: '' })
  const [previewKey] = useState(0)
  const [liveLine, setLiveLine] = useState(-1)
  const [playheadPercent, setPlayheadPercent] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const playerRef = useRef<HTMLIFrameElement | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [drawerWidth, setDrawerWidth] = useState(360)
  const studioRef = useRef<HTMLDivElement | null>(null)
  
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

  // ---- preview iframe message handling ----
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!e.data?.t) return
      if (e.data.t === 'line' && typeof e.data.i === 'number') setLiveLine(e.data.i)
      else if (e.data.t === 'start') setLiveLine(-1)
      else if (e.data.t === 'end') setLiveLine(-1)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // ---- actions ----
  const onEdit = useCallback((fn: (r: Reel) => Reel) => {
    if (!selectedReel) return
    setSelectedReel((r) => (r ? fn(r) : r))
  }, [selectedReel])

  const debouncedSave = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushEdit = useCallback((id: string, lines: Reel['lines']) => {
    if (debouncedSave.current) clearTimeout(debouncedSave.current)
    debouncedSave.current = setTimeout(async () => {
      try {
        await axios.put(`${API}/reels/${encodeURIComponent(id)}`, { lines })
        fetchReels()
      } catch (e) {
        console.error('Save failed', e)
      }
    }, 300)
  }, [])

  const handleEdit = (fn: (r: Reel) => Reel) => {
    onEdit(fn)
    if (selectedReel) flushEdit(selectedReel.id, fn(selectedReel).lines)
  }

  const onGenerate = async (lineId: string, voiceId: string) => {
    if (!selectedReel) return
    setBusy((b) => ({ ...b, [lineId]: true }))
    setLineErr((e) => ({ ...e, [lineId]: '' }))
    try {
      const { data } = await axios.post<Reel>(`${API}/reels/${encodeURIComponent(selectedReel.id)}/lines/${encodeURIComponent(lineId)}/tts`, { voiceId })
      setSelectedReel(data)
      fetchReels()
    } catch (e) {
      setLineErr((errs) => ({ ...errs, [lineId]: errMsg(e) }))
    } finally {
      setBusy((b) => ({ ...b, [lineId]: false }))
    }
  }

  const onGenerateAll = async (voiceId: string) => {
    if (!selectedReel) return
    setGeneratingAll(true)
    const todo = selectedReel.lines.filter((l) => {
      const st = lineState(l)
      return st === 'new' || st === 'stale'
    })
    for (const l of todo) {
      if (!l.voiceId) continue
      setBusy((b) => ({ ...b, [l.id]: true }))
      try {
        const { data } = await axios.post<Reel>(`${API}/reels/${encodeURIComponent(selectedReel.id)}/lines/${encodeURIComponent(l.id)}/tts`, { voiceId })
        setSelectedReel(data)
      } catch (e) {
        setLineErr((errs) => ({ ...errs, [l.id]: errMsg(e) }))
        break
      } finally {
        setBusy((b) => ({ ...b, [l.id]: false }))
      }
    }
    fetchReels()
    setGeneratingAll(false)
  }

  const onMusicFile = async (file: File) => {
    if (!selectedReel) return
    const fd = new FormData()
    fd.append('music', file)
    try {
      await axios.post(`${API}/reels/${encodeURIComponent(selectedReel.id)}/music`, fd)
      fetchReels()
    } catch (e) {
      console.error('Music upload failed', e)
    }
  }

  const onMusicRemove = async () => {
    if (!selectedReel) return
    try {
      await axios.delete(`${API}/reels/${encodeURIComponent(selectedReel.id)}/music`)
      fetchReels()
    } catch (e) {
      console.error('Music remove failed', e)
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
    setExportJob({ state: 'running', progress: 0, message: 'Starting...' })
    try {
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
      await axios.put(`${API}/reels/${encodeURIComponent(reel.id)}`, { onLanding: !reel.onLanding })
      fetchReels()
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

  // ---- Timeline / Seeker helpers ----
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  const handleTimelineClick = (e: React.MouseEvent, reel: Reel) => {
    if (!reel) return
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    const timeMs = percent * (reel.plan.totalMs || 0)
    playerRef.current?.contentWindow?.postMessage({ t: 'seek', time: timeMs }, '*')
    setPlayheadPercent(percent * 100)
  }

  const handleTimelineMouseDown = (e: React.MouseEvent, reel: Reel) => {
    if (!reel) return
    setIsScrubbing(true)
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    setPlayheadPercent(percent * 100)
    playerRef.current?.contentWindow?.postMessage({ t: 'seek', time: percent * (reel.plan.totalMs || 0) }, '*')

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newPercent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width))
      setPlayheadPercent(newPercent * 100)
      playerRef.current?.contentWindow?.postMessage({ t: 'seek', time: newPercent * (reel.plan.totalMs || 0) }, '*')
    }

    const handleMouseUp = () => {
      setIsScrubbing(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Update playhead from liveLine messages
  useEffect(() => {
    if (!selectedReel || liveLine < 0) return
    const start = selectedReel.plan.starts[liveLine]
    const total = selectedReel.plan.totalMs || 1
    if (typeof start === 'number') {
      setPlayheadPercent((start / total) * 100)
    }
  }, [liveLine, selectedReel])

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
                <label className="tb-check">
                  <input type="checkbox" checked={selectedReel.onLanding} onChange={() => handleToggleLanding(selectedReel)} />
                  <span>On Landing</span>
                </label>
                <select className="vo-in" value={selectedReel.lang} onChange={(e) => handleEdit((r) => ({ ...r, lang: e.target.value }))}>
                  {languages.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <iframe
                ref={playerRef}
                key={previewKey}
                className="preview"
                src={`${API}/reels/${encodeURIComponent(selectedReel.id)}/player`}
                title="Reel preview"
                allow="autoplay"
              />

              {/* Timeline / Seeker */}
              <div className="timeline-container">
                <div 
                  className="timeline"
                  onClick={(e) => handleTimelineClick(e, selectedReel)}
                  onMouseDown={(e) => handleTimelineMouseDown(e, selectedReel)}
                >
                  <div className="timeline-track" />
                  {selectedReel.lines.map((l, i) => (
                    <div
                      key={l.id}
                      className="timeline-segment"
                      style={{
                        left: `${(selectedReel.plan.starts[i] / (selectedReel.plan.totalMs || 1)) * 100}%`,
                        width: `${Math.max(1, ((selectedReel.plan.speechEnds[i] - selectedReel.plan.starts[i]) / (selectedReel.plan.totalMs || 1)) * 100)}%`,
                      }}
                      title={`Line ${i + 1}: ${l.s.substring(0, 50)}...`}
                    />
                  ))}
                  <div
                    className="timeline-playhead"
                    style={{ left: `${playheadPercent}%` }}
                  />
                </div>
                <div className="timeline-labels">
                  <span>0:00</span>
                  <span>{formatTime(selectedReel.plan.totalMs || 0)}</span>
                </div>
              </div>

              <div className="progress">
                {(() => {
                  const pct = liveLine >= 0 && selectedReel.plan.starts[liveLine]
                    ? Math.min(100, (selectedReel.plan.starts[liveLine] / (selectedReel.plan.totalMs || 1)) * 100)
                    : 0
                  return <span style={{ width: `${pct}%` }} />
                })()}
                <small>{liveLine >= 0 ? `Line ${liveLine + 1}` : 'Hook'}</small>
              </div>

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
          />
        )}
      </div>
    </div>
  )
}

export default App