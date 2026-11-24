# Audio / preview / timeline fix

Files changed (drop over your project, same paths). `render.ts` is unchanged.

backend/src/model.ts            planReel rewritten; preview script rewritten; robust injection
backend/src/index.ts            PUT keeps `offset`; TTS route uses on-screen text, cleans up; player not cached
frontend/src/useReelEditor.ts   NEW: owns the open reel, autosave, generate, preview reload
frontend/src/App.tsx            uses the hook; real playhead; new timeline; save/preview state
frontend/src/AudioPanel.tsx     seconds input fixed; Generate-all keeps each line's voice
frontend/src/lib.ts, types.ts   merge/save helpers, shared audition player, Plan.clamped
frontend/src/studio.css         appended "Timeline v2" block only

## Root causes -> fixes
1. planReel read plan.ends before filling it, so every line started at 2.32 s (timeline stacked).
   -> single sequential pass; an offset stretches the PREVIOUS line's hold, so plan = preview = export.
2. PUT /api/reels/:id dropped `offset` (and the client only ever sent `lines`: hook, stamp, title, lang, music volume were never saved).
   -> server keeps offset; client sends the full editable payload.
3. Preview iframe key was a constant, so it never reloaded after audio was generated.
   -> reload after generation + "Update preview" button; "stale" indicator.
4. selectedReel was a snapshot: plan/audio/videoUrl/music never refreshed after saves, uploads, exports.
   -> server answers are MERGED into the screen state (typed text is never overwritten).
5. Generate used the server's copy of the text (autosave is debounced), and Generate-all sent the default voice for every line.
   -> flush first + send on-screen text; each line uses its own voice.
6. Offset input showed ms as seconds; Apply multiplied by 1000 again.
   -> proper seconds field (accepts 0.5, empty = auto).
7. Timeline posted 'seek' messages nobody listened to; playhead was a guess.
   -> removed fake scrubbing; playhead follows the real player (resynced at every line).
8. Export did not save pending edits first. -> flush before export.
9. Switching reels inside the 300 ms debounce lost the previous reel's last edits. -> saves are per-reel, ordered, flushed on switch.
