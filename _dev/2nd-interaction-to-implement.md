Thought for 1m 14s

Listing the colour options for the scheme.

Checking which colour variable drives the badge, bar and stamp.

Designing colour controls with eyedropper support.

Checking which selector hits the badge rectangle.

Planning badge and name edits, plus mouth timing.

Matching mouth movement to speech timing.

Timing the mouth to audio length.

Keeping mouth movement running for the full audio length.

Building a timed mouth-movement helper.

Planning color pickers with eyedropper fallback.

Wiring colour fields with hex values and presets.

Wiring accent and badge fields into the runtime.

Wiring colour pickers into the audio panel.

Let me check how the Stage details row is styled, so the new colour pickers fit in.

bash

cd /mnt/user-data/uploads && grep -n "vo-row\|vo-in\|vo-btn\|vo-more\|^:root\|--[a-z-]*:" studio.css | head -50; grep -n -A8 "\.vo-row" studio.css | head -40; grep -n -A10 "\.vo-btn" studio.css | head -30

Output

6::root {
8:  --bg: #0f1115;
9:  --pan: #14171c;
10:  --card: #1a1e24;
11:  --line: #2a2f3a;
12:  --ink: #e8eaf0;
13:  --mu: #7a8290;
14:  --ac: #00d4aa;
15:  --ac-dim: rgba(0, 212, 170, 0.15);
16:  --warn: #f0b429;
17:  --warn-bg: rgba(240, 180, 41, 0.15);
18:  --err: #ff5c8a;
19:  --err-bg: rgba(255, 92, 138, 0.15);
20:  --sel: rgba(0, 212, 170, 0.1);
21:  --shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
22:  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
23:  --radius: 10px;
24:  --radius-sm: 6px;
25:  --trans: 140ms ease;
28:  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
29:  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
30:  --heading: var(--sans);
31:  --ui-size: 13.5px;
32:  --ui-line: 1.45;
35:  --header-h: 56px;
36:  --fab-size: 44px;
37:  --drawer-w: min(360px, calc(100vw - 24px));
43:    --bg: #f2f3f6;
44:    --pan: #ffffff;
45:    --card: #ffffff;
46:    --line: #dcdee5;
47:    --ink: #1b1a20;
48:    --mu: #6a6878;
49:    --ac: #1d8a71;
50:    --ac-dim: rgba(29, 138, 113, 0.12);
51:    --warn: #b8700f;
52:    --warn-bg: rgba(184, 112, 15, 0.12);
53:    --err: #e03e6a;
54:    --err-bg: rgba(224, 62, 106, 0.12);
55:    --sel: rgba(29, 138, 113, 0.1);
56:    --shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
57:    --shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.06);
61::root[data-theme="dark"] {
62:  --bg: #0f1115;
63:  --pan: #14171c;
64:  --card: #1a1e24;
65:  --line: #2a2f3a;
66:  --ink: #e8eaf0;
67:  --mu: #7a8290;
68:  --ac: #00d4aa;
909:.vo-row { 
910-  display: flex; 
911-  align-items: center; 
912-  gap: 12px; 
913-  flex-wrap: wrap; 
914-}
915-
916:.vo-row label { 
917-  display: flex; 
918-  align-items: center; 
919-  gap: 6px; 
920-  font-size: 12px; 
921-  color: var(--ink); 
922-  cursor: pointer; 
923-}
924-
925:.vo-row label .vo-in { width: auto; min-width: 140px; }
926-
927-.vo-foot { 
928-  display: flex; 
929-  align-items: center; 
930-  justify-content: space-between; 
931-  gap: 10px; 
932-  flex-wrap: wrap; 
933-  padding-top: 4px; 
--
970:.vo-row input[type="range"] { flex: 1; max-width: 200px; }
971-
972-/* ==========================================================================
973-   Scrollbar Styling
974-   ========================================================================== */
975-
976-::-webkit-scrollbar { width: 8px; height: 8px; }
977-::-webkit-scrollbar-track { background: transparent; }
978-::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }
355:.vo-btn { 
356-  display: inline-flex; 
357-  align-items: center; 
358-  justify-content: center; 
359-  gap: 6px; 
360-  padding: 8px 12px; 
361-  border: 1px solid var(--line); 
362-  border-radius: var(--radius-sm); 
363-  background: var(--card); 
364-  color: var(--ink); 
365-  font-size: 12.5px; 
--
372:.vo-btn:hover:not(:disabled) { 
373-  background: var(--sel); 
374-  border-color: var(--ac); 
375-}
376-
377:.vo-btn:active:not(:disabled) { transform: scale(0.98); }
378-
379:.vo-btn:disabled { opacity: 0.5; cursor: not-allowed; }
380-
381:.vo-btn.primary { 
382-  background: var(--ac); 
383-  border-color: var(--ac); 
384-  color: #0a1a15; 
385-}
386-
387:.vo-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
388-
389:.vo-btn.quiet { 


Adding colour field styling to studio.css.

Adding text input widths to studio.css.

Outlining colour, text, and mouth changes, starting with the backend

bash

cd /home/claude/out && cp /mnt/user-data/uploads/studio.css frontend/src/studio.css && python3 - <<'EOF'
def sub(path, old, new):
    s=open(path).read(); assert old in s,(path,old[:70]); open(path,'w').write(s.replace(old,new,1))
f='backend/src/stagefx.ts'

# ---- header interface
sub(f,"""  propL?: string; // SVG prop, left of the face
  propR?: string; // SVG prop, right of the face
}""","""  propL?: string; // SVG prop, left of the face
  propR?: string; // SVG prop, right of the face
  accent?: string; // main colour: sign on the head, props, stamp, progress bar (preset id or #rrggbb)
  badge?: string; // text on the sign above the head (max 14 chars)
  name?: string; // text of the name label under the face (max 32 chars)
}""")
sub(f,"""// Moods 'flat'""","""// A colour field is a preset id OR any #rrggbb the user picked.
export const BADGE_MAX = 14;
export const NAME_MAX = 32;

// Moods 'flat'""")

# ---- colours: hex everywhere
sub(f,"""export const COLORS = [
  { id: 'warm', label: 'warm', rgb: '255,225,170' },
  { id: 'cold', label: 'cold white', rgb: '170,205,255' },
  { id: 'alarm', label: 'alarm red', rgb: '255,90,80' },
  { id: 'sick', label: 'sickly green', rgb: '170,255,190' },
  { id: 'violet', label: 'violet', rgb: '200,160,255' },
];""","""export const COLORS = [
  { id: 'warm', label: 'warm', hex: '#ffe1aa' },
  { id: 'cold', label: 'cold white', hex: '#aacdff' },
  { id: 'alarm', label: 'alarm red', hex: '#ff5a50' },
  { id: 'sick', label: 'sickly green', hex: '#aaffbe' },
  { id: 'violet', label: 'violet', hex: '#c8a0ff' },
];

export const ACCENTS = [
  { id: 'amber', label: 'amber (default)', hex: '#ffb454' },
  { id: 'coral', label: 'coral', hex: '#ff6b6b' },
  { id: 'mint', label: 'mint', hex: '#5de0b0' },
  { id: 'sky', label: 'sky blue', hex: '#6bb8ff' },
  { id: 'magenta', label: 'magenta', hex: '#ff6bd6' },
  { id: 'lime', label: 'lime', hex: '#c6ee5a' },
  { id: 'white', label: 'white', hex: '#f1f1f1' },
];""")

# ---- cleanFx
sub(f,"""const has = (list: { id: string }[], id: unknown) => typeof id === 'string' && list.some((x) => x.id === id);""","""const has = (list: { id: string }[], id: unknown) => typeof id === 'string' && list.some((x) => x.id === id);
const HEX = /^#[0-9a-fA-F]{6}$/;
/** A colour field: a known preset id, or a #rrggbb (normalised to lower case). Anything else is dropped. */
const colour = (list: { id: string }[], v: unknown): string | undefined =>
  typeof v === 'string' ? (HEX.test(v) ? v.toLowerCase() : has(list, v) ? v : undefined) : undefined;
/** Plain text for the sign / name label. Control characters and angle brackets removed; it is only ever applied with textContent. */
const label = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/[\\u0000-\\u001f\\u007f<>]/g, '').trim().slice(0, max);
  return t || undefined;
};""")
sub(f,"""  if (has(LIGHTS, r.light)) out.light = r.light as string;
  if (has(COLORS, r.color)) out.color = r.color as string;
  if (has(ROOMS, r.room)) out.room = r.room as string;""","""  if (has(LIGHTS, r.light)) out.light = r.light as string;
  const c = colour(COLORS, r.color); if (c) out.color = c;
  const rm = colour(ROOMS, r.room); if (rm) out.room = rm;
  const ac = colour(ACCENTS, r.accent); if (ac) out.accent = ac;
  const bd = label(r.badge, BADGE_MAX); if (bd) out.badge = bd;
  const nm = label(r.name, NAME_MAX); if (nm) out.name = nm;""")
sub(f,"""  colors: COLORS.map(({ id, label }) => ({ id, label })),
  rooms: ROOMS.map(({ id, label }) => ({ id, label })),""","""  colors: COLORS,
  rooms: ROOMS.map(({ id, label, hex }) => ({ id, label, hex })),
  accents: ACCENTS,
  limits: { badge: BADGE_MAX, name: NAME_MAX },""")

# ---- CSS: accent + ink
sub(f,"""const STAGE_CSS = `
.stage{transition:background-color .8s}""","""const STAGE_CSS = `
.stage{transition:background-color .8s}
/* accent colour: the sign on the head, the stamp and its text. --tag is the theme's own variable. */
#av rect[fill]{fill:var(--tag,#ffb454)}
#av .badge{fill:var(--fx-ink,#2a1a05)}
.stage .tagc{color:var(--fx-ink,#2a1a05)}""")
EOF
grep -n "const label\|label(" backend/src/stagefx.ts | head

Output

100:const label = (v: unknown, max: number): string | undefined => {
115:  const bd = label(r.badge, BADGE_MAX); if (bd) out.badge = bd;
116:  const nm = label(r.name, NAME_MAX); if (nm) out.name = nm;


Checking how the color list is destructured.

Renaming the helper and fixing the regex escapes.

bash

cd /home/claude/out && python3 - <<'EOF'
import re
def sub(path, old, new):
    s=open(path).read(); assert old in s,(path,old[:70]); open(path,'w').write(s.replace(old,new,1))
f='backend/src/stagefx.ts'
s=open(f).read()
s=s.replace("const label = (v: unknown, max: number)","const cleanText = (v: unknown, max: number)").replace("label(r.badge, BADGE_MAX)","cleanText(r.badge, BADGE_MAX)").replace("label(r.name, NAME_MAX)","cleanText(r.name, NAME_MAX)")
open(f,'w').write(s)

# ---------------- runtime rewrite
start=s.index("// Runs inside the theme page.")
end=s.index("/** The <script> to inject before </body>.")
new_runtime = r'''// Runs inside the theme page. It never touches the theme's own state: it only watches #cap for the
// next <p> (a new line starting to type, the same signal render.ts uses) and sets attributes/vars on #stage.
// Timers used here (setInterval) are the page's own, which render.ts virtualises, so capture stays frame-exact.
export interface RuntimeLine {
  fx: LineFx | null;
  speechMs: number; // how long this line's audio plays (0 = unknown / no audio: leave the theme's typing-based mouth alone)
}

const RUNTIME = (lines: RuntimeLine[], listen: boolean) => {
  const colors = Object.fromEntries(COLORS.map((c) => [c.id, c.hex]));
  const rooms = Object.fromEntries(ROOMS.map((r) => [r.id, r.hex]));
  const accents = Object.fromEntries(ACCENTS.map((a) => [a.id, a.hex]));
  const props = Object.fromEntries(PROPS.map((p) => [p.id, `<svg viewBox="0 0 48 48" aria-hidden="true">${p.svg}</svg>`]));
  return `
(function(){
  var FX=${json(lines.map((l) => l.fx))},SPEECH=${json(lines.map((l) => l.speechMs))};
  var COL=${json(colors)},ROOM=${json(rooms)},ACC=${json(accents)},PROP=${json(props)},LIGHT=${json(LIGHTS.map((l) => l.id))};
  var stage=document.getElementById('stage'),cap=document.getElementById('cap'),hook=document.getElementById('hook'),av=document.getElementById('av');
  if(!stage||!cap)return;
  var badge=av&&av.querySelector('.badge'),nameEl=stage.querySelector('.name');
  var badge0=badge?badge.textContent:'',name0=nameEl?nameEl.textContent:'';
  var slots={},i=-1;
  ['l','r'].forEach(function(k){var d=document.createElement('div');d.className='fx-slot fx-'+k;stage.appendChild(d);slots[k]=d});

  // preset id or #rrggbb -> #rrggbb (or '')
  function col(map,v){return typeof v!=='string'?'':/^#[0-9a-f]{6}$/i.test(v)?v:(map[v]||'')}
  function rgb(h){return parseInt(h.slice(1,3),16)+','+parseInt(h.slice(3,5),16)+','+parseInt(h.slice(5,7),16)}
  function ink(h){var r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return (0.299*r+0.587*g+0.114*b)/255>0.6?'#2a1a05':'#ffffff'}

  function prop(k,id){
    var s=slots[k]; if((s.getAttribute('data-p')||'')===(id||''))return;
    s.setAttribute('data-p',id||'');
    s.innerHTML=id&&PROP[id]?'<div class="fx-prop fx-'+id+'">'+PROP[id]+'</div>':'';
  }
  function setBadge(t){
    if(!badge)return; badge.textContent=t;
    if(t.length>11){badge.setAttribute('textLength','60');badge.setAttribute('lengthAdjust','spacingAndGlyphs')}
    else{badge.removeAttribute('textLength');badge.removeAttribute('lengthAdjust')}
  }
  function clear(){
    stage.removeAttribute('data-light');
    ['--lamp-rgb','--room','--tag','--fx-ink'].forEach(function(v){stage.style.removeProperty(v)});
    prop('l','');prop('r','');setBadge(badge0);if(nameEl)nameEl.textContent=name0;
  }
  function reset(){i=-1;stopTalk();clear()}
  function apply(f){
    if(!f)return;
    if(f.light){ if(f.light==='sway')stage.removeAttribute('data-light'); else stage.setAttribute('data-light',f.light); }
    var c=col(COL,f.color); if(c)stage.style.setProperty('--lamp-rgb',rgb(c));
    var r=col(ROOM,f.room); if(r)stage.style.setProperty('--room',r);
    var a=col(ACC,f.accent); if(a){stage.style.setProperty('--tag',a);stage.style.setProperty('--fx-ink',ink(a))}
    if(f.badge)setBadge(String(f.badge).slice(0,${BADGE_MAX}));
    if(f.name&&nameEl)nameEl.textContent=String(f.name).slice(0,${NAME_MAX});
    if(f.propL!==undefined)prop('l',f.propL);
    if(f.propR!==undefined)prop('r',f.propR);
  }

  // ---- mouth: keep talking for as long as the line's AUDIO plays, not only while the text types ----
  var talking=false,left=0,iv=null;
  function stopTalk(){talking=false;left=0;if(iv){clearInterval(iv);iv=null} if(av)av.classList.remove('talk')}
  function startTalk(ms){
    stopTalk(); if(!av||!(ms>0))return;
    talking=true;left=ms;av.classList.add('talk');
    iv=setInterval(function(){
      if(typeof paused!=='undefined'&&paused)return; // the preview's Pause freezes the mouth too
      left-=40; if(left<=0)stopTalk();
    },40);
  }
  if(av)new MutationObserver(function(){ if(talking&&!av.classList.contains('talk'))av.classList.add('talk') })
    .observe(av,{attributes:true,attributeFilter:['class']}); // the theme drops 'talk' when typing ends: put it back while audio plays

  new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){
    if(n.nodeName==='P'){i++;apply(FX[i]);startTalk(SPEECH[i]||0)}
  })})}).observe(cap,{childList:true});
  if(hook)new MutationObserver(function(){if(hook.classList.contains('on'))reset()}).observe(hook,{attributes:true,attributeFilter:['class']});
  ${listen ? `
  // "Try now": the studio sends the fully resolved look of one line and we show it immediately.
  // Same-origin, from our parent only. The line counter and the mouth are left alone, so a playing reel carries on.
  window.addEventListener('message',function(e){
    if(e.source!==parent||e.origin!==location.origin)return;
    var d=e.data,k=d&&d.t==='fx-try'&&d.look; if(!k)return;
    if(av&&typeof k.mood==='string'&&/^[a-z]{2,12}$/.test(k.mood))av.setAttribute('data-mood',k.mood);
    clear();
    apply({light:LIGHT.indexOf(k.light)>=0?k.light:'sway',color:k.color||'',room:k.room||'',accent:k.accent||'',badge:k.badge||'',name:k.name||'',propL:k.propL||'',propR:k.propR||''});
  });` : ''}
})();`;
};

'''
s=s[:start]+new_runtime+s[end:]
# stageFxScript
old=s[s.index("/** The <script> to inject before </body>."):]
newf='''/** The <script> to inject before </body>.
 *  preview: always (it carries the "Try now" listener, which must work on reels that use no effects yet).
 *  capture: only when some line has an effect or known audio length, so a reel with neither is untouched. */
export function stageFxScript(lines: { fx?: LineFx; speechMs?: number }[], mode: 'preview' | 'capture'): string {
  const rt: RuntimeLine[] = lines.map((l) => ({ fx: cleanFx(l.fx) || null, speechMs: Math.max(0, Math.round(l.speechMs || 0)) }));
  if (mode === 'capture' && !rt.some((l) => l.fx || l.speechMs)) return '';
  return `<script>${RUNTIME(rt, mode === 'preview')}</script>`;
}
'''
s=s.replace(old,newf)
open(f,'w').write(s)

sub('backend/src/model.ts',"stageFxScript(reel.lines.map((l) => l.fx), mode);","stageFxScript(reel.lines.map((l) => ({ fx: l.fx, speechMs: l.audio && !isStale(l) ? l.audio.durationMs : 0 })), mode);")
EOF
cd /tmp/fxtest && tsc --ignoreConfig --target ES2022 --module commonjs --strict --outDir . /home/claude/out/backend/src/stagefx.ts && echo "stagefx typechecks (strict)"

Output

stagefx typechecks (strict)


Checking how the pause and reset logic fits together.

Checking the observer and hook behavior during typing.

Backend done and strict-typechecks. Now the frontend: types, the look resolver, the colour field with eyedropper, and the new rows.

bash

cd /home/claude/out && python3 - <<'EOF'
def sub(path, old, new):
    s=open(path).read(); assert old in s,(path,old[:70]); open(path,'w').write(s.replace(old,new,1))

# ---- types.ts
t='frontend/src/types.ts'
sub(t,"  propL?: string\n  propR?: string\n}","  propL?: string\n  propR?: string\n  accent?: string // preset id or #rrggbb: sign, props, stamp, progress bar\n  badge?: string // text on the sign above the head\n  name?: string // name label under the face\n}")
sub(t,"  propL: string\n  propR: string\n}\n\nexport interface StageOption { id: string; label: string }","  propL: string\n  propR: string\n  accent: string\n  badge: string\n  name: string\n}\n\nexport interface StageOption { id: string; label: string; hex?: string }")
sub(t,"  colors: StageOption[]\n  rooms: StageOption[]\n  props: StageOption[]\n}","  colors: StageOption[]\n  rooms: StageOption[]\n  accents: StageOption[]\n  props: StageOption[]\n  limits?: { badge: number; name: number }\n}")

# ---- lib.ts
l='frontend/src/lib.ts'
sub(l,"const look: StageLook = { mood: 'flat', light: 'sway', color: '', room: '', propL: '', propR: '' }","const look: StageLook = { mood: 'flat', light: 'sway', color: '', room: '', propL: '', propR: '', accent: '', badge: '', name: '' }")
sub(l,"    if (l.fx?.room) look.room = l.fx.room\n","    if (l.fx?.room) look.room = l.fx.room\n    if (l.fx?.accent) look.accent = l.fx.accent\n    if (l.fx?.badge) look.badge = l.fx.badge\n    if (l.fx?.name) look.name = l.fx.name\n")

# ---- AudioPanel.tsx
a='frontend/src/AudioPanel.tsx'
s=open(a).read()
i0=s.index("                    {stage && (\n                      <div className=\"vo-row\" title=\"Lamp, colours")
i1=s.index("                    <small className=\"vo-status\" data-s={reel.plan.clamped")
newblock='''                    {stage && (
                      <>
                        <div className="vo-row" title="Stays as set until a later line changes it. The hook card resets everything.">
                          {([
                            ['Light', 'light', stage.lights],
                            ['Prop left', 'propL', stage.props],
                            ['Prop right', 'propR', stage.props],
                          ] as const).map(([label, key, opts]) => (
                            <label key={key}>
                              {label}{' '}
                              <select className="vo-in" value={l.fx?.[key] || ''} onChange={(e) => patchAndTry(l.id, { fx: nextFx(l.fx, key, e.target.value) })}>
                                <option value="">keep previous</option>
                                {opts.map((o) => (
                                  <option key={o.id} value={o.id}>{o.label}</option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                        <div className="vo-row" title="Pick a preset, choose any colour, or pick one from anywhere on screen with the eyedropper (Chrome / Edge).">
                          <ColorField label="Accent" value={l.fx?.accent} options={stage.accents} fallbackHex="#ffb454" onChange={(v) => patchAndTry(l.id, { fx: nextFx(l.fx, 'accent', v) })} />
                          <ColorField label="Room" value={l.fx?.room} options={stage.rooms} fallbackHex="#1d1b24" onChange={(v) => patchAndTry(l.id, { fx: nextFx(l.fx, 'room', v) })} />
                          <ColorField label="Light colour" value={l.fx?.color} options={stage.colors} fallbackHex="#ffe1aa" onChange={(v) => patchAndTry(l.id, { fx: nextFx(l.fx, 'color', v) })} />
                        </div>
                        <div className="vo-row" title="Empty = keep what the previous line set (or the theme's own text).">
                          <label>
                            Sign on head{' '}
                            <input className="vo-in" maxLength={stage.limits?.badge ?? 14} placeholder="e.g. THE AGENCY" value={l.fx?.badge || ''} onChange={(e) => patchAndTry(l.id, { fx: nextFx(l.fx, 'badge', e.target.value) })} />
                          </label>
                          <label>
                            Name{' '}
                            <input className="vo-in" maxLength={stage.limits?.name ?? 32} placeholder="e.g. The spokeswoman" value={l.fx?.name || ''} onChange={(e) => patchAndTry(l.id, { fx: nextFx(l.fx, 'name', e.target.value) })} />
                          </label>
                          <button type="button" className="vo-btn" title="Show this line's look in the preview now. Earlier lines' settings are included. Press Replay to watch it in sequence." onClick={() => tryLine(l.id)}>
                            Try now
                          </button>
                        </div>
                      </>
                    )}
'''
s=s[:i0]+newblock+s[i1:]

# ColorField component before the default export
cf='''const HEX_RE = /^#[0-9a-f]{6}$/i

/** A colour that is either a preset or anything the person picks (swatch picker or the screen eyedropper). */
function ColorField(p: { label: string; value?: string; options: StageOption[]; fallbackHex: string; onChange: (v: string) => void }) {
  const isHex = !!p.value && HEX_RE.test(p.value)
  const hex = isHex ? p.value! : p.options.find((o) => o.id === p.value)?.hex || p.fallbackHex
  const canPick = typeof window !== 'undefined' && 'EyeDropper' in window
  const pick = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await new (window as any).EyeDropper().open()
      p.onChange(String(r.sRGBHex).toLowerCase())
    } catch { /* cancelled with Esc */ }
  }
  return (
    <div className="vo-colorfield">
      <label>
        {p.label}{' '}
        <select className="vo-in" value={isHex ? '__custom' : p.value || ''} onChange={(e) => p.onChange(e.target.value === '__custom' ? hex : e.target.value)}>
          <option value="">keep previous</option>
          {p.options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
          <option value="__custom">custom colour</option>
        </select>
      </label>
      <input type="color" className="vo-color" value={hex} aria-label={`${p.label}: choose a colour`} onChange={(e) => p.onChange(e.target.value)} />
      {canPick && (
        <button type="button" className="vo-btn quiet" title="Pick a colour from anywhere on screen" aria-label={`${p.label}: pick from screen`} onClick={pick}>
          Pick
        </button>
      )}
    </div>
  )
}

'''
s=s.replace("export default function AudioPanel(p: Props) {",cf+"export default function AudioPanel(p: Props) {",1)
s=s.replace("import type { Line, Reel, StageCatalog, StageLook, VoicesResponse } from './types'","import type { Line, Reel, StageCatalog, StageLook, StageOption, VoicesResponse } from './types'",1)
open(a,'w').write(s)

# ---- studio.css
open('frontend/src/studio.css','a').write('''
/* ==========================================================================
   Stage effects: colour fields (swatch picker + optional screen eyedropper)
   ========================================================================== */
.vo-colorfield { display: flex; align-items: center; gap: 6px; }
.vo-colorfield .vo-btn { padding: 5px 8px; }
.vo-color {
  width: 34px;
  height: 30px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--card);
  cursor: pointer;
}
''')
EOF
node -e "
const ts=require('/home/claude/.npm-global/lib/node_modules/typescript');const fs=require('fs');
for (const f of ['backend/src/model.ts','backend/src/index.ts','backend/src/stagefx.ts','frontend/src/types.ts','frontend/src/lib.ts','frontend/src/AudioPanel.tsx','frontend/src/App.tsx']){
  const r=ts.transpileModule(fs.readFileSync(f,'utf8'),{reportDiagnostics:true,fileName:f,compilerOptions:{jsx:'preserve',target:'ES2022'}});
  console.log(f, r.diagnostics.length?r.diagnostics.map(d=>d.messageText):'syntax ok');}"

Output

backend/src/model.ts syntax ok
backend/src/index.ts syntax ok
backend/src/stagefx.ts syntax ok
frontend/src/types.ts syntax ok
frontend/src/lib.ts syntax ok
frontend/src/AudioPanel.tsx syntax ok
frontend/src/App.tsx syntax ok


Setting up stub types for a frontend check.

Weighing whether stub types are worth the effort.

Syntax is clean, so now the browser test. I'll use a line with short text (about 0.6 s of typing) but 3 s of audio, which is the exact case where the mouth used to stop early.

bash

cd /tmp/fxtest && tsc --ignoreConfig --target ES2022 --module commonjs --strict --outDir . /home/claude/out/backend/src/stagefx.ts && cat > build3.js <<'EOF'
const fs=require('fs');const fx=require('./stagefx.js');
let html=fs.readFileSync('/mnt/user-data/uploads/The_Denial_Came_First_-_Volume_II_-_en.html','utf8');
const lines=[
 {s:'Short text.',m:'flat',h:2600,speechMs:3000,fx:{accent:'#2a7fff',room:'#101830',color:'#ff8800',badge:'SHE / HER',name:'The spokeswoman',propL:'clock'}},
 {s:'Second one.',m:'up',h:1500,speechMs:2000,fx:{accent:'#f5f5f0',badge:'A VERY LONG SIGN'}},
 {s:'No audio here.',h:1200},
];
const mode=process.argv[2]||'preview';
html=html.replace(/const R\s*=\s*(\[[\s\S]*?\]);/,()=>'const R='+JSON.stringify([{n:'t',hook:'Test',next:'n',stamp:'Stamp',l:lines.map(l=>({s:l.s,m:l.m,h:l.h}))}])+';');
html=html.replace('</head>',()=>'<style>h1,.sub,.tabs{display:none!important}'+fx.stageFxCss()+'</style></head>');
html=html.replace(/<\/body>/i,()=>fx.stageFxScript(lines,mode)+'</body>');
fs.writeFileSync('player3.html',html);
EOF
node build3.js preview && cat > t3.py <<'EOF'
from playwright.sync_api import sync_playwright
import time
js="""(()=>{const s=document.getElementById('stage'),a=document.getElementById('av');
return {talk:a.classList.contains('talk'),tag:s.style.getPropertyValue('--tag'),ink:s.style.getPropertyValue('--fx-ink'),
badge:a.querySelector('.badge').textContent,tl:a.querySelector('.badge').getAttribute('textLength'),name:s.querySelector('.name').textContent,
rect:getComputedStyle(a.querySelector('rect[fill]')).fill,
typed:document.querySelector('#cap p:last-child').textContent.length}})()"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':380,'height':700}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('file:///tmp/fxtest/player3.html'); t0=time.time()
    def at(t,label,shot=None):
        while time.time()-t0<t: time.sleep(0.02)
        print(f'{t:>4}s {label}:',pg.evaluate(js))
        if shot: pg.locator('#stage').screenshot(path=shot)
    at(2.7,'line1 typing done?')      # hook 2.3s; line1 starts ~2.3
    at(3.9,'line1, text finished typing but audio still playing','m1.png')
    at(5.6,'line1 audio ended (3.0s after 2.3)')
    at(8.6,'line2 mid-speech','m2.png')
    at(14.0,'after the end','m3.png')
    # replay: should reset badge/name/colours at hook
    pg.click('#re'); time.sleep(0.8)
    print('replay hook:',pg.evaluate(js)); print('errors',errs); b.close()
EOF
python3 t3.py

Output

 2.7s line1 typing done?: {'talk': True, 'tag': '#2a7fff', 'ink': '#ffffff', 'badge': 'SHE / HER', 'tl': None, 'name': 'The spokeswoman', 'rect': 'rgb(42, 127, 255)', 'typed': 10}
 3.9s line1, text finished typing but audio still playing: {'talk': True, 'tag': '#2a7fff', 'ink': '#ffffff', 'badge': 'SHE / HER', 'tl': None, 'name': 'The spokeswoman', 'rect': 'rgb(42, 127, 255)', 'typed': 11}
 5.6s line1 audio ended (3.0s after 2.3): {'talk': True, 'tag': '#f5f5f0', 'ink': '#2a1a05', 'badge': 'A VERY LONG SI', 'tl': '60', 'name': 'The spokeswoman', 'rect': 'rgb(245, 245, 240)', 'typed': 5}
 8.6s line2 mid-speech: {'talk': False, 'tag': '#f5f5f0', 'ink': '#2a1a05', 'badge': 'A VERY LONG SI', 'tl': '60', 'name': 'The spokeswoman', 'rect': 'rgb(245, 245, 240)', 'typed': 14}
14.0s after the end: {'talk': False, 'tag': '#f5f5f0', 'ink': '#2a1a05', 'badge': 'A VERY LONG SI', 'tl': '60', 'name': 'The spokeswoman', 'rect': 'rgb(245, 245, 240)', 'typed': 14}


Checking the timing of typed output against a test.

Checking whether the mouth keeps moving between lines.

Refining the test to check when the mouth stops

bash

cd /tmp/fxtest && cat > build4.js <<'EOF'
const fs=require('fs');const fx=require('./stagefx.js');
let html=fs.readFileSync('/mnt/user-data/uploads/The_Denial_Came_First_-_Volume_II_-_en.html','utf8');
const lines=[{s:'Short text.',m:'flat',h:2500,speechMs:2000,fx:{accent:'#2a7fff',badge:'SHE / HER',name:'The spokeswoman'}}];
const mode=process.argv[2];
html=html.replace(/const R\s*=\s*(\[[\s\S]*?\]);/,()=>'const R='+JSON.stringify([{n:'t',hook:'Test',next:'n',stamp:'Stamp',l:lines.map(l=>({s:l.s,m:l.m,h:l.h}))}])+';');
html=html.replace('</head>',()=>'<style>h1,.sub,.tabs{display:none!important}'+fx.stageFxCss()+'</style></head>');
html=html.replace(/<\/body>/i,()=>fx.stageFxScript(lines,mode)+'</body>');
fs.writeFileSync('player4_'+mode+'.html',html);
EOF
node build4.js preview; node build4.js capture
cat > t4.py <<'EOF'
from playwright.sync_api import sync_playwright
import time
vc=open('/tmp/fxtest/vc.js').read()
Q="(()=>{const a=document.getElementById('av'),s=document.getElementById('stage');return [a.classList.contains('talk'),s.style.getPropertyValue('--tag'),a.querySelector('.badge').textContent,s.querySelector('.name').textContent]})()"
# ---- virtual clock (what the MP4 export uses): sample every 100ms
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':360,'height':640}); pg=ctx.new_page(); pg.add_init_script(vc)
    html=open('/tmp/fxtest/player4_capture.html').read()
    ctx.route('http://reel.local/**',lambda r:r.fulfill(status=200,content_type='text/html; charset=utf-8',body=html))
    pg.goto('http://reel.local/',wait_until='load')
    start=None; last=None; first_talk=None; end_talk=None
    for f in range(0,400):
        st=pg.evaluate("window.__vc.sync()"); t=st['now']
        talk=pg.evaluate(Q)[0]
        if start is None and pg.evaluate("document.querySelectorAll('#cap p').length")>0: start=t
        if start is not None:
            if talk and first_talk is None: first_talk=t-start
            if not talk and first_talk is not None and end_talk is None: end_talk=t-start
        pg.evaluate("ms=>window.__vc.advance(ms)",1000/30)
    print('EXPORT clock: line starts at',round(start),'ms; mouth moves from +%d ms to +%d ms (audio is 2000 ms, text types in ~440 ms)'%(round(first_talk),round(end_talk)))
    b.close()
# ---- preview: after Replay everything resets to the theme defaults
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':380,'height':700}); pg.goto('file:///tmp/fxtest/player4_preview.html'); time.sleep(3.2)
    print('preview mid-line:',pg.evaluate(Q)); pg.click('#re'); time.sleep(0.9)
    print('after Replay (hook card):',pg.evaluate(Q)); b.close()
EOF
python3 t4.py

Output

EXPORT clock: line starts at 2333 ms; mouth moves from +0 ms to +2000 ms (audio is 2000 ms, text types in ~440 ms)
preview mid-line: [True, '#2a7fff', 'SHE / HER', 'The spokeswoman']
after Replay (hook card): [False, '', 'THE AGENCY', 'The spokesperson']


Testing the new fields in the parent iframe.

Checking whether the UI can be visually tested.

Checking the export timing and replay restoration before the final test

bash

cd /tmp/fxtest && node -e "
const fs=require('fs');const fx=require('./stagefx.js');
let html=fs.readFileSync('/mnt/user-data/uploads/The_Denial_Came_First_-_Volume_II_-_en.html','utf8');
const lines=[{s:'A reel with no effects, with enough text to keep typing while we try looks on it.',h:5000}];
html=html.replace(/const R\s*=\s*(\[[\s\S]*?\]);/,()=>'const R='+JSON.stringify([{n:'t',hook:'Test',next:'n',stamp:'Stamp',l:lines}])+';');
html=html.replace('</head>',()=>'<style>h1,.sub,.tabs{display:none!important}'+fx.stageFxCss()+'</style></head>');
html=html.replace(/<\/body>/i,()=>fx.stageFxScript(lines,'preview')+'</body>');
fs.writeFileSync('player5.html',html);
const p=fs.readFileSync('parent.html','utf8').replace('player2.html','player5.html'); fs.writeFileSync('parent5.html',p);"
(nohup python3 -m http.server 8767 >/dev/null 2>&1 &); sleep 1
python3 - <<'EOF'
from playwright.sync_api import sync_playwright
import time
looks=[{'mood':'smug','light':'candle','color':'#ff9a3c','room':'#0e2a3a','propL':'folder','propR':'bulb','accent':'#33d6a6','badge':'SHE / HER','name':'The spokeswoman'},
       {'mood':'worried','light':'swing','color':'alarm','room':'#3a0e1c','propL':'clock','propR':'','accent':'#ff3d6e','badge':'MINISTRY','name':'The deputy'}]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':380,'height':700}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8767/parent5.html'); time.sleep(3.6)
    for i,l in enumerate(looks):
        pg.evaluate("l=>document.getElementById('f').contentWindow.postMessage({t:'fx-try',look:l},location.origin)",l); time.sleep(1.0)
        pg.frame_locator('#f').locator('#stage').screenshot(path=f'n{i}.png')
    print('errors',errs); b.close()
from PIL import Image
ims=[Image.open(f'n{i}.png') for i in range(2)]; w,h=ims[0].size
s=Image.new('RGB',(w*2,h)); [s.paste(im,(i*w,0)) for i,im in enumerate(ims)]; s.save('/tmp/fxtest/colour_sheet.png')
EOF
pkill -f "http.server 8767"; echo done

Output

errors []

Two custom-colour looks applied through Try now
colour_sheet.png

Checking the sign colour and the accent props.

Updating the integration notes for the new features.

Rebuilding the patch and dry-running it on originals

bash

cd /home/claude/out && U=/mnt/user-data/uploads; : > stagefx.patch
for pair in "model.ts backend/src" "index.ts backend/src" "types.ts frontend/src" "lib.ts frontend/src" "AudioPanel.tsx frontend/src" "App.tsx frontend/src" "studio.css frontend/src"; do
  set -- $pair; diff -u --label "a/$2/$1" --label "b/$2/$1" $U/$1 $2/$1 >> stagefx.patch
done
diff -u --label /dev/null --label b/backend/src/stagefx.ts /dev/null backend/src/stagefx.ts >> stagefx.patch
rm -rf /tmp/applytest && mkdir -p /tmp/applytest/backend/src /tmp/applytest/frontend/src && cd /tmp/applytest
for f in model.ts index.ts; do cp $U/$f backend/src/; done; for f in types.ts lib.ts AudioPanel.tsx App.tsx studio.css; do cp $U/$f frontend/src/; done
patch -p1 < /home/claude/out/stagefx.patch | tail -9
# the patched result must equal the delivered files
for f in backend/src/model.ts backend/src/index.ts backend/src/stagefx.ts frontend/src/types.ts frontend/src/lib.ts frontend/src/AudioPanel.tsx frontend/src/App.tsx frontend/src/studio.css; do cmp -s $f /home/claude/out/$f && echo "identical: $f" || echo "DIFFERS: $f"; done

Output

patching file backend/src/model.ts
patching file backend/src/index.ts
patching file frontend/src/types.ts
patching file frontend/src/lib.ts
patching file frontend/src/AudioPanel.tsx
patching file frontend/src/App.tsx
patching file frontend/src/studio.css
patching file backend/src/stagefx.ts
identical: backend/src/model.ts
identical: backend/src/index.ts
identical: backend/src/stagefx.ts
identical: frontend/src/types.ts
identical: frontend/src/lib.ts
identical: frontend/src/AudioPanel.tsx
identical: frontend/src/App.tsx
identical: frontend/src/studio.css


bash

cd /mnt/user-data/outputs && python3 - <<'EOF'
p='STAGEFX_INTEGRATION.md'
s=open(p).read()
def sub(old,new,cnt=1):
    global s
    assert old in s, old[:70]
    s=s.replace(old,new,cnt)

# ---- title / intro
sub("# Stage effects: integration instructions\n","# Stage effects: integration instructions (revision 2)\n\n> **Revision 2** adds: custom colours (room, lamp, accent) with colour picker and screen eyedropper, editable sign on the head and name label, and a mouth that keeps moving for the whole audio line. If revision 1 was already applied, apply **only** the delta described in §3.8. Otherwise apply everything in §3.\n")
sub("**Task:** add \"stage effects\" (more moods, controllable lamp, light colour, room tint, SVG props) and a \"Try now\" live preview to the Reel Manager.","**Task:** add \"stage effects\" (more moods, controllable lamp, colours, sign and name text, SVG props, audio-length mouth movement) and a \"Try now\" live preview to the Reel Manager.")

# ---- user-facing table
sub("""| Light colour | warm, cold white, alarm red, sickly green, violet | |
| Room | plum (default), night blue, dark red, dark green, near black | stage background tint |""","""| Light colour | presets (warm, cold white, alarm red, sickly green, violet) **or any colour** | lamp tint |
| Room | presets (plum, night blue, dark red, dark green, near black) **or any colour** | stage background |
| **Accent** | presets (amber default, coral, mint, sky blue, magenta, lime, white) **or any colour** | the theme's main colour (`--tag`): sign on the head, props' accent parts, the closing stamp, the progress bar. Text on the sign/stamp switches between dark and white automatically for contrast |
| Sign on head | free text, max 14 chars | replaces "THE AGENCY"; long text is squeezed to fit the sign |
| Name | free text, max 32 chars | replaces the label under the face ("The spokesperson") |""")
sub("""| **Try now** button | | shows this line's look in the preview immediately, without reloading |""","""| **Try now** button | | shows this line's look in the preview immediately, without reloading |

Every colour field has three ways to set it: the preset dropdown, a colour swatch (any colour), and a **Pick** button that opens the browser's screen eyedropper to take a colour from anywhere on screen. **Pick is only shown where the `EyeDropper` API exists (Chrome / Edge); it may be missing inside embedded browsers such as VS Code's Simple Browser. The swatch always works.**

**Mouth:** the avatar's mouth now moves for the whole duration of the line's audio, not just while the text is typing. Lines that have no audio keep the theme's original typing-based movement. It is on/off per line (not synced to individual words or pauses; true lip-sync would need audio-envelope analysis, see §7).""")
sub("- Existing reels that use none of this look and export exactly as before.","- Reels that use no effects look as before, **except** that the mouth now follows the audio length in the preview and in exports (this is the intended fix and applies to every reel with generated audio).")

# ---- files table
sub("| `frontend/src/App.tsx` | `frontend/src/App.tsx` | modified |","| `frontend/src/App.tsx` | `frontend/src/App.tsx` | modified |\n| `frontend/src/studio.css` | `frontend/src/studio.css` | modified (appended styles for the colour field) |")
sub("`render.ts`, `useReelEditor.ts`, `studio.css`, `App.css`,","`render.ts`, `useReelEditor.ts`, `App.css`,")

# ---- 3.x edits
sub("It exports `cleanFx`, `catalogForClient`, `stageFxCss`, `stageFxScript`, the catalog arrays (`MOODS`, `LIGHTS`, `COLORS`, `ROOMS`, `PROPS`) and the `LineFx` type.","It exports `cleanFx`, `catalogForClient`, `stageFxCss`, `stageFxScript`, the catalog arrays (`MOODS`, `LIGHTS`, `COLORS`, `ROOMS`, `ACCENTS`, `PROPS`), `BADGE_MAX`, `NAME_MAX` and the `LineFx` type.")
sub("""6. In `buildPlayerHtml`, after the `<style>` replacement and before `if (mode === 'preview') {`, add:
   ```ts
   const fxScript = stageFxScript(reel.lines.map((l) => l.fx), mode);""","""6. In `buildPlayerHtml`, after the `<style>` replacement and before `if (mode === 'preview') {`, add (note `speechMs`: the audio length of each line, 0 when it has no usable audio):
   ```ts
   const fxScript = stageFxScript(reel.lines.map((l) => ({ fx: l.fx, speechMs: l.audio && !isStale(l) ? l.audio.durationMs : 0 })), mode);""")
sub("Add `LineFx`, `StageOption`, `StageCatalog`, `StageLook` interfaces, and `fx?: LineFx` on `Line`.","Add `LineFx`, `StageOption` (with optional `hex`), `StageCatalog` (moods, lights, colors, rooms, accents, props, limits), `StageLook` interfaces, and `fx?: LineFx` on `Line`.")
sub("4. Add `nextFx(cur, key, value)`, `FALLBACK_MOODS`, and `resolveLook(lines, index)` (above the \"audition\" section).","4. Add `nextFx(cur, key, value)`, `FALLBACK_MOODS`, and `resolveLook(lines, index)` (above the \"audition\" section). `resolveLook` folds mood, light, colour, room, accent, badge, name and props.")
sub("""6. New `vo-row` after the Mood/Beat/Start row: five selects (Light, Light colour, Room, Prop left, Prop right) using `patchAndTry(l.id, { fx: nextFx(l.fx, key, value) })`, plus a **Try now** button. Reuse the existing classes (`vo-row`, `vo-in`, `vo-btn`); no CSS change is needed.""","""6. New `ColorField` component (above the default export): preset `<select>` + `<input type="color">` + an eyedropper **Pick** button shown only when `'EyeDropper' in window`. A colour value is either a preset id or `#rrggbb`.
7. Three new `vo-row`s after the Mood/Beat/Start row: (a) Light, Prop left, Prop right selects; (b) three `ColorField`s: Accent, Room, Light colour; (c) "Sign on head" and "Name" text inputs plus the **Try now** button. All use `patchAndTry(l.id, { fx: nextFx(l.fx, key, value) })`.

#### 3.7a `frontend/src/studio.css`
Append the `.vo-colorfield` and `.vo-color` rules (see the end of the delivered file).""")

# ---- 3.8 delta
sub("---\n\n## 4. How it works","""#### 3.8 If revision 1 is already applied, the delta is
- `stagefx.ts`: replace with the delivered file.
- `model.ts`: only the `stageFxScript(...)` call changes (see 3.2 step 6).
- `types.ts`, `lib.ts`, `AudioPanel.tsx`: replace or merge as in 3.4 to 3.6.
- `studio.css`: append the new rules (3.7a).
- `index.ts`, `App.tsx`: no change.

---

## 4. How it works""")

# ---- 4.x
sub("### 4.1 Data\n`Line.fx = { light?, color?, room?, propL?, propR? }` (all optional string ids).","### 4.1 Data\n`Line.fx = { light?, color?, room?, accent?, badge?, name?, propL?, propR? }` (all optional strings). `color`, `room` and `accent` hold either a preset id or a `#rrggbb` hex; `badge` and `name` are plain text.")
sub("The special prop id `'none'` removes the current prop.","The special prop id `'none'` removes the current prop. Colours, sign text and name set on line 1 therefore apply to the whole reel unless a later line changes them.")
sub("""### 4.2 The theme is never re-implemented""","""### 4.2 The theme is never re-implemented""")
sub("  - `capture`: injected only when at least one line has an effect, so exports of old reels are byte-for-byte unaffected.","  - `capture`: injected only when at least one line has an effect **or** known audio length (every export with generated audio), otherwise skipped.")
sub("The hook overlay turning `on` resets everything.","The hook overlay turning `on` resets everything, including the sign text and name (the script remembers the theme's original texts at load).\n\nColour variables: room → `--room`, accent → `--tag` (the theme's own variable, so every theme element that uses it follows) plus `--fx-ink` (contrast text colour computed from the accent's luminance), lamp → `--lamp-rgb`. The sign's rectangle has a hard-coded `fill` attribute in the theme markup, so the injected CSS overrides it with `#av rect[fill]{fill:var(--tag)}`.\n\n**Mouth:** on each new line the script starts a countdown of that line's `speechMs` (a `setInterval` that skips ticks while the theme's `paused` flag is true) and keeps the `talk` class on `#av`; a `MutationObserver` on `#av` puts `talk` back if the theme removes it when typing ends. Lines with `speechMs = 0` are left to the theme.")
sub("Ids are whitelisted server-side (`cleanFx`) on save and again when building the player; the runtime only looks ids up in server-built maps. The client can never send CSS, markup or colours.","Ids are whitelisted server-side (`cleanFx`) on save and again when building the player. Colours must be a known preset id or match `^#[0-9a-f]{6}$` (normalised to lower case); sign and name text is stripped of control characters and `<` `>`, length-limited, and only ever applied with `textContent`. The client can never send CSS or markup.")
sub("**every effect must be a CSS animation or transition** (or Web Animations). Do not use `requestAnimationFrame`, `setTimeout`, `Math.random()` or `Date.now()` for visuals; they will not match between preview and export.","**every visual effect must be a CSS animation or transition** (or Web Animations). Do not use `requestAnimationFrame`, `Math.random()` or `Date.now()` for visuals. Timers are acceptable only through the page's own `setTimeout`/`setInterval` (the mouth countdown does this), because `render.ts` replaces those with its virtual clock; never use a timer that bypasses it.")
sub("This was tested: replaying a player under the real `render.ts` virtual clock twice","This was tested: under the real `render.ts` virtual clock a line with 2000 ms of audio and 440 ms of typing moved the mouth from +0 ms to +2000 ms exactly. Separately, replaying a player under the same clock twice")
sub("`look = { mood, light, color, room, propL, propR }`","`look = { mood, light, color, room, accent, badge, name, propL, propR }`")

# ---- checklist
sub("5. Change Light / Colour / Room / props and a mood: the preview iframe changes immediately, without reloading, and the text keeps typing.","5. Change Light / props / a mood, and Accent / Room / Light colour (preset, swatch, and **Pick** if shown), and type a Sign and a Name: the preview iframe changes immediately, without reloading, and the text keeps typing. A dark accent must give a white sign/stamp text; a light accent dark text.")
sub("9. **Export MP4** a reel with effects and a reel without any. Watch both. Effects should match the preview; the old-style reel should look exactly as before.","9. **Mouth:** with narration generated, watch a short line whose audio is longer than its typing time. The mouth must keep moving until the voice stops, then stop (also during the pause between lines). Press the preview's Pause: the mouth freezes with the audio.\n9b. **Export MP4** a reel with effects and a reel without any. Watch both. Effects and mouth movement should match the preview; apart from the mouth, a reel with no effects should look as before.")
sub("10. Open another theme's reel","10. Press Replay: the sign text, name, accent, room and lamp return to the theme's defaults at the hook card.\n11. Open another theme's reel")
sub("Record which themes work fully.","Record which themes work fully, including whether their sign (`.badge`), name (`.name`) and `--tag` colour exist; if a theme lacks them those fields simply do nothing.")

# ---- extend
sub("- **Colour / Room:** add `{ id, label, rgb: 'r,g,b' }` to `COLORS` or `{ id, label, hex }` to `ROOMS`.","- **Colour presets:** add `{ id, label, hex }` to `COLORS` (lamp), `ROOMS` or `ACCENTS`. Free colours need no code; any `#rrggbb` is accepted.\n- **Text limits:** `BADGE_MAX` and `NAME_MAX` in `stagefx.ts`; the UI reads them from `/api/stagefx`. The sign's width is fixed in the theme SVG (68 units), so texts longer than 11 characters are squeezed with `textLength`.")

# ---- limitations
sub("- Prop slots sit at the top-left","- **Eyedropper** depends on the browser's `EyeDropper` API (Chrome / Edge). Elsewhere only the preset and swatch are offered.\n- **Mouth** is on/off for the audio length. It does not follow individual words or pauses inside a line. Real lip-sync would need an amplitude envelope of each mp3 (e.g. computed once with ffmpeg when audio is generated and stored on the line) and a per-frame mouth opening driven by it; not done on purpose.\n- Sign text and name are per-line sticky fields like every other effect (there is no reel-level \"character\" setting yet).\n- Prop slots sit at the top-left")

# ---- troubleshooting
sub("| TypeScript error on `Object.fromEntries`","| Mouth stops when the text finishes typing | `speechMs` not passed in `model.ts` (old `stageFxScript` call), or the line's audio is stale/missing (stale audio is not played, so it is treated as no audio) |\n| Sign or stamp colour does not change | the theme does not use `--tag` / has no `rect[fill]` on the sign; check the theme markup |\n| No **Pick** button | browser has no `EyeDropper` API (expected outside Chrome / Edge) |\n| TypeScript error on `Object.fromEntries`")
open(p,'w').write(s)
print('ok', len(s))
EOF
cd /home/claude/out && cp -r backend frontend /mnt/user-data/outputs/ && cp stagefx.patch /mnt/user-data/outputs/ && cp /tmp/fxtest/colour_sheet.png /mnt/user-data/outputs/stagefx-colours.png && grep -n "Revision 2\|3.8\|9b\." /mnt/user-data/outputs/STAGEFX_INTEGRATION.md | head

Output

ok 21953
3:> **Revision 2** adds: custom colours (room, lamp, accent) with colour picker and screen eyedropper, editable sign on the head and name label, and a mouth that keeps moving for the whole audio line. If revision 1 was already applied, apply **only** the delta described in §3.8. Otherwise apply everything in §3.
142:#### 3.8 If revision 1 is already applied, the delta is
200:9b. **Export MP4** a reel with effects and a reel without any. Watch both. Effects and mouth movement should match the preview; apart from the mouth, a reel with no effects should look as before.

Presented 2 files
Studio
Code
·CSS
Stagefx colours
Image
·PNG