import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import type { Reel } from './types'
import { errMsg, lineState, mergeServer, playerSig, savePayload } from './lib'

const API = '/api'
export type SaveState = 'idle' | 'dirty' | 'saving' | 'error'

/**
 * One place that owns the reel being edited, so the editor, the saved copy, the audio and the preview
 * cannot drift apart:
 *  - edits apply synchronously to a ref (no stale closures) and are autosaved, one request at a time, in order
 *  - generating narration first flushes pending edits and sends the text on screen with the request
 *  - server answers are MERGED into the screen state, never swapped in over the top of it
 *  - the preview iframe only reloads on request or after audio is generated; `previewStale` says when it lags
 */
export function useReelEditor(onListChanged: () => void) {
  const [reel, setReel] = useState<Reel | null>(null)
  const reelRef = useRef<Reel | null>(null)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const serverSig = useRef('')
  const [serverSigState, setServerSigState] = useState('')
  const [loadedSig, setLoadedSig] = useState('')
  const [previewNonce, setPreviewNonce] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [lineErr, setLineErr] = useState<Record<string, string>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const listChanged = useRef(onListChanged)
  listChanged.current = onListChanged

  const commit = useCallback((next: Reel | null) => {
    reelRef.current = next
    setReel(next)
  }, [])

  const setSig = (r: Reel) => {
    serverSig.current = playerSig(r)
    setServerSigState(serverSig.current)
  }

  /** Fold a server copy of the CURRENT reel into the screen state. */
  const applyServer = useCallback((data: Reel) => {
    const cur = reelRef.current
    if (cur && cur.id === data.id) commit(mergeServer(cur, data))
    setSig(data)
    listChanged.current()
  }, [commit])

  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current)
    const cur = reelRef.current
    if (!dirty.current || !cur) return chain.current
    dirty.current = false
    const id = cur.id
    setSaveState('saving')
    chain.current = chain.current.then(async () => {
      try {
        // Built at send time so a queued save always carries the latest edits.
        const body = savePayload(reelRef.current && reelRef.current.id === id ? reelRef.current : cur)
        const { data } = await axios.put<Reel>(`${API}/reels/${encodeURIComponent(id)}`, body)
        applyServer(data)
        setSaveState(dirty.current ? 'dirty' : 'idle')
      } catch (e) {
        dirty.current = true
        setSaveState('error')
        console.error('Save failed', errMsg(e))
      }
    })
    return chain.current
  }, [applyServer])

  /** Open a reel (or none). Anything unsaved on the previous reel is written first. */
  const select = useCallback(async (next: Reel | null) => {
    await flush()
    commit(next)
    if (next) {
      serverSig.current = playerSig(next)
      setServerSigState(serverSig.current)
      setLoadedSig(serverSig.current)
    }
    setPreviewNonce((n) => n + 1)
    setSaveState('idle')
  }, [commit, flush])

  const edit = useCallback((fn: (r: Reel) => Reel) => {
    const cur = reelRef.current
    if (!cur) return
    commit(fn(cur))
    dirty.current = true
    setSaveState('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 500)
  }, [commit, flush])

  /** Re-read the reel from the server (after an export, a landing toggle, ...). */
  const refresh = useCallback(async () => {
    const cur = reelRef.current
    if (!cur) return
    const { data } = await axios.get<Reel>(`${API}/reels/${encodeURIComponent(cur.id)}`)
    applyServer(data)
  }, [applyServer])

  const reloadPreview = useCallback(async () => {
    await flush()
    setLoadedSig(serverSig.current)
    setPreviewNonce((n) => n + 1)
  }, [flush])

  /* ---- narration ---- */
  const generateOne = useCallback(async (
    reelId: string,
    lineId: string,
    voiceId: string,
    text: string,
    opts?: { ttsInstruct?: string; ttsSpeed?: number; ttsAccent?: string },
  ) => {
    setBusy((b) => ({ ...b, [lineId]: true }))
    setLineErr((e) => ({ ...e, [lineId]: '' }))
    try {
      const { data } = await axios.post<Reel>(`${API}/reels/${encodeURIComponent(reelId)}/lines/${encodeURIComponent(lineId)}/tts`, {
        voiceId,
        text,
        ...(opts?.ttsInstruct ? { ttsInstruct: opts.ttsInstruct } : {}),
        ...(opts?.ttsSpeed && opts.ttsSpeed !== 1 ? { ttsSpeed: opts.ttsSpeed } : {}),
        ...(opts?.ttsAccent ? { ttsAccent: opts.ttsAccent } : {}),
      })
      applyServer(data)
      return true
    } catch (e) {
      setLineErr((errs) => ({ ...errs, [lineId]: errMsg(e) }))
      return false
    } finally {
      setBusy((b) => ({ ...b, [lineId]: false }))
    }
  }, [applyServer])

  const generate = useCallback(async (lineId: string, voiceId: string) => {
    const cur = reelRef.current
    const line = cur?.lines.find((l) => l.id === lineId)
    if (!cur || !line) return
    await flush() // the server must know the current order / voices before it files audio against a line
    // Re-read: the person may have kept typing while the save was in flight.
    const latest = reelRef.current?.lines.find((l) => l.id === lineId)
    if (!latest) return
    if (await generateOne(cur.id, lineId, voiceId, latest.s, {
      ttsInstruct: latest.ttsInstruct,
      ttsSpeed: latest.ttsSpeed,
      ttsAccent: latest.ttsAccent,
    })) await reloadPreview()
  }, [flush, generateOne, reloadPreview])

  /** Every line that still needs audio, each with ITS OWN voice. */
  const generateAll = useCallback(async () => {
    const cur = reelRef.current
    if (!cur) return
    setGeneratingAll(true)
    try {
      await flush()
      const todo = (reelRef.current?.lines || []).filter((l) => ['new', 'stale'].includes(lineState(l)))
      let ok = 0
      for (const l of todo) {
        const latest = reelRef.current?.lines.find((x) => x.id === l.id)
        if (!latest?.voiceId) continue
        if (!(await generateOne(cur.id, latest.id, latest.voiceId, latest.s, {
          ttsInstruct: latest.ttsInstruct,
          ttsSpeed: latest.ttsSpeed,
          ttsAccent: latest.ttsAccent,
        }))) break // keep the error on that line, stop the run
        ok++
      }
      if (ok) await reloadPreview()
    } finally {
      setGeneratingAll(false)
    }
  }, [flush, generateOne, reloadPreview])

  /* ---- music: the server's answer is authoritative for the file, local state for the volume ---- */
  const setMusic = useCallback((data: Reel) => applyServer(data), [applyServer])

  // Don't lose edits when the tab is closed mid-debounce.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty.current) { void flush(); e.preventDefault() }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [flush])

  return {
    reel, reelRef, select, edit, flush, refresh, setMusic,
    saveState, busy, lineErr, generatingAll, generate, generateAll,
    previewNonce, reloadPreview,
    previewStale: serverSigState !== loadedSig || saveState === 'dirty' || saveState === 'saving',
  }
}