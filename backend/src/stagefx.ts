/* Stage effects: more expressions, a controllable lamp, room tints and a small SVG prop catalog.
 *
 * Design rules (so nothing else in the studio has to change):
 *  - The theme HTML stays the single source of truth. Effects are INJECTED into the theme page as a
 *    <style> and (only when a reel uses them) one small <script>, exactly like PREVIEW_JS is.
 *  - Everything is a CSS animation or transition. render.ts already freezes document.getAnimations()
 *    to its virtual clock, so preview and exported MP4 match frame for frame. No rAF, no Math.random.
 *  - Effects are "sticky" per line, like mood: a line that sets nothing keeps what the previous line set.
 *    The hook card resets everything, so Replay always starts clean.
 *  - Ids are whitelisted on the server; the client can never inject markup or CSS.
 */

export interface LineFx {
  light?: string; // lamp behaviour
  color?: string; // lamp colour
  room?: string; // room tint
  propL?: string; // SVG prop, left of the face
  propR?: string; // SVG prop, right of the face
  badgeColor?: string; // avatar badge fill colour (CSS colour string)
  badgeName?: string; // text inside the avatar badge
}

/* ------------------------------------------------------------------ catalog */

// Moods 'flat' | 'up' | 'calm' are the theme's own. The others are drawn by MOOD_CSS below.
export const MOODS = [
  { id: 'flat', label: 'flat' },
  { id: 'up', label: 'eyebrows up' },
  { id: 'calm', label: 'calm smile' },
  { id: 'worried', label: 'worried' },
  { id: 'stern', label: 'stern' },
  { id: 'surprised', label: 'surprised' },
  { id: 'smug', label: 'smug' },
  { id: 'sleepy', label: 'sleepy' },
  { id: 'wink', label: 'wink' },
];

export const LIGHTS = [
  { id: 'sway', label: 'sway (theme default)' },
  { id: 'steady', label: 'steady' },
  { id: 'candle', label: 'candle' },
  { id: 'flicker', label: 'flicker (failing bulb)' },
  { id: 'swing', label: 'swing (hanging lamp)' },
  { id: 'sweep', label: 'sweep side to side' },
  { id: 'pulse', label: 'slow pulse (alarm)' },
  { id: 'dim', label: 'dim' },
  { id: 'off', label: 'off' },
];

export const COLORS = [
  { id: 'warm', label: 'warm', rgb: '255,225,170' },
  { id: 'cold', label: 'cold white', rgb: '170,205,255' },
  { id: 'alarm', label: 'alarm red', rgb: '255,90,80' },
  { id: 'sick', label: 'sickly green', rgb: '170,255,190' },
  { id: 'violet', label: 'violet', rgb: '200,160,255' },
];

export const ROOMS = [
  { id: 'plum', label: 'plum (default)', hex: '#1d1b24' },
  { id: 'night', label: 'night blue', hex: '#121a2c' },
  { id: 'blood', label: 'dark red', hex: '#2a1416' },
  { id: 'moss', label: 'dark green', hex: '#13241d' },
  { id: 'black', label: 'near black', hex: '#09090b' },
];

// Props are plain static SVG (no scripts). Strokes/fills come from the theme's own colours through CSS.
// class "a" = accent colour, class "t" = text.
export const PROPS = [
  { id: 'clock', label: 'clock', svg: '<circle cx="24" cy="24" r="17"/><line class="hh" x1="24" y1="24" x2="24" y2="14"/><line class="mh a" x1="24" y1="24" x2="33" y2="24"/>' },
  { id: 'folder', label: 'folder', svg: '<path d="M6 14h13l4 5h19v21H6z"/><line x1="12" y1="27" x2="36" y2="27"/><line class="a" x1="12" y1="33" x2="30" y2="33"/>' },
  { id: 'magnifier', label: 'magnifier', svg: '<circle cx="20" cy="20" r="11"/><line class="a" x1="28" y1="28" x2="41" y2="41"/>' },
  { id: 'moth', label: 'moth', svg: '<g class="wl"><path d="M24 22C16 10 6 14 8 24c1 7 10 8 16 3z"/></g><g class="wr"><path d="M24 22c8-12 18-8 16 2-1 7-10 8-16 3z"/></g><line class="a" x1="24" y1="18" x2="24" y2="34"/>' },
  { id: 'phone', label: 'phone (ringing)', svg: '<path d="M8 30Q24 12 40 30l-5 6Q24 27 13 36z"/><line class="a" x1="12" y1="40" x2="36" y2="40"/>' },
  { id: 'question', label: 'question mark', svg: '<text class="t" x="24" y="38" text-anchor="middle">?</text>' },
  { id: 'mic', label: 'microphone', svg: '<rect x="18" y="6" width="12" height="20" rx="6"/><path d="M12 22a12 12 0 0 0 24 0"/><line x1="24" y1="34" x2="24" y2="42"/><line class="a" x1="16" y1="42" x2="32" y2="42"/>' },
  { id: 'bulb', label: 'idea bulb', svg: '<path class="a" d="M24 6a12 12 0 0 0-7 21v5h14v-5A12 12 0 0 0 24 6z"/><line x1="19" y1="38" x2="29" y2="38"/><line x1="21" y1="43" x2="27" y2="43"/>' },
  // Scene Asset Catalog props
  { id: 'windmill', label: 'Dutch Windmill', svg: '<rect x="-30" y="180" width="60" height="80" rx="3" stroke="#3A3228" stroke-width="2"/><path d="M-30 180 L0 155 L30 180 Z" fill="#D4A76A" stroke="#3A3228" stroke-width="2"/><line x1="0" y1="155" x2="0" y2="120" stroke="#5D4037" stroke-width="4"/><circle cx="0" cy="123" r="3" fill="#3A2818"/>' },
  { id: 'castle_ice', label: 'Ice Castle', svg: '<rect x="-50" y="180" width="100" height="80" rx="3" fill="#D4A76A" stroke="#3A3228" stroke-width="2"/><path d="M-50 180 L0 155 L50 180 Z" fill="#8B7355" stroke="#3A3228" stroke-width="2"/>' },
  { id: 'flower_row', label: 'Flower Row', svg: '<g><circle cx="10" cy="200" r="10" fill="#FF6B9D"/><circle cx="30" cy="190" r="10" fill="#FFD166"/><circle cx="50" cy="200" r="10" fill="#FF6B6B"/><circle cx="70" cy="190" r="10" fill="#DA70D6"/><circle cx="90" cy="200" r="10" fill="#FF8C42"/><circle cx="110" cy="190" r="10" fill="#4ECDC4"/><circle cx="130" cy="200" r="10" fill="#9370DB"/><circle cx="150" cy="190" r="10" fill="#87CEEB"/></g>' },
  { id: 'mushroom_patch', label: 'Glowing Mushroom Patch', svg: '<g><circle cx="20" cy="190" r="15" fill="#C4862D"/><circle cx="40" cy="180" r="12" fill="#D4A050"/><circle cx="60" cy="190" r="15" fill="#C4862D"/><circle cx="80" cy="180" r="12" fill="#D4A050"/><circle cx="100" cy="190" r="15" fill="#C4862D"/><circle cx="120" cy="180" r="12" fill="#D4A050"/><circle cx="140" cy="190" r="15" fill="#C4862D"/><circle cx="160" cy="180" r="12" fill="#D4A050"/></g>' },
  { id: 'oak_tree', label: 'Oak Tree (large)', svg: '<g><path d="M-20 180 Q-10 140 20 180 Q30 160 40 180" fill="#8B7355" stroke="#3A3228" stroke-width="2"/><circle cx="0" cy="130" r="30" fill="#4A6A3A"/><circle cx="-15" cy="110" r="10" fill="#8B5A3C"/><circle cx="15" cy="110" r="10" fill="#8B5A3C"/><circle cx="-25" cy="90" r="8" fill="#6B4B2A"/><circle cx="25" cy="90" r="8" fill="#6B4B2A"/><circle cx="-35" cy="70" r="6" fill="#5A3A20"/><circle cx="35" cy="70" r="6" fill="#5A3A20"/></g>' },
  { id: 'pine_tree_snowy', label: 'Snowy Pine Tree', svg: '<g><polygon points="60 180 40 80 80 80" fill="#8B7355" stroke="#3A3228" stroke-width="2"/><polygon points="40 160 20 100 60 160" fill="#8B7355" stroke="#3A3228" stroke-width="2"/><polygon points="20 140 0 60 40 140" fill="#8B7355" stroke="#3A3228" stroke-width="2"/><circle cx="40" cy="50" r="8" fill="#FFF"/><circle cx="20" cy="40" r="8" fill="#FFF"/><circle cx="0" cy="50" r="8" fill="#FFF"/><circle cx="-20" cy="40" r="8" fill="#FFF"/><circle cx="-40" cy="50" r="8" fill="#FFF"/></g>' },
  // TAH (Tools/Scene-Asset-Catalog) assets
  { id: 'archivist', label: 'The Archivist', svg: '<g transform="translate(200 220) scale(0.6)"><path d="M20 0 L0 20 L-20 0 Z" fill="#18202B" stroke="#FF8A5C" stroke-width="2"/><circle cx="0" cy="-5" r="3" fill="#FF8A5C"/><circle cx="-8" cy="5" r="2" fill="#FF8A5C"/><circle cx="8" cy="5" r="2" fill="#FF8A5C"/></g>' },
  { id: 'clean_hands', label: 'Clean Hands', svg: '<g transform="translate(200 220) scale(1)"><path d="M30 0 L0 40 L-30 0 Z" fill="#18202B" stroke="#FF8A5C" stroke-width="2"/><circle cx="0" cy="-5" r="3" fill="#FF8A5C"/></g>' },
  { id: 'crowd_echo', label: 'Echoing Crowd', svg: '<g transform="translate(200 220) scale(1)"><circle cx="-30" cy="-10" r="5" fill="#FF8A5C"/><circle cx="-20" cy="-10" r="5" fill="#FF8A5C"/><circle cx="-10" cy="-10" r="5" fill="#FF8A5C"/><circle cx="10" cy="-10" r="5" fill="#FF8A5C"/><circle cx="20" cy="-10" r="5" fill="#FF8A5C"/><circle cx="30" cy="-10" r="5" fill="#FF8A5C"/></g>' },
  { id: 'door_exclusion', label: 'Closing Door', svg: '<g transform="translate(200 220) scale(1)"><path d="M0 0 L0 40 H40 Z" fill="#18202B" stroke="#FF8A5C" stroke-width="2"/><line x1="0" y1="40" x2="40" y2="40" stroke="#FF8A5C" stroke-width="1"/></g>' },
  { id: 'evidence_board', label: 'Evidence Board', svg: '<g transform="translate(200 220) scale(1)"><rect x="0" y="0" width="40" height="50" rx="5" fill="#18202B" stroke="#FF8A5C" stroke-width="2"/><text x="20" y="35" text-anchor="middle" fill="#FF8A5C">EVIDENCE</text></g>' },
  { id: 'family_portrait', label: 'Family Portrait', svg: '<g transform="translate(200 220) scale(1)"><circle cx="-15" cy="-10" r="4" fill="#FF8A5C"/><circle cx="-5" cy="-10" r="4" fill="#FF8A5C"/><circle cx="5" cy="-10" r="4" fill="#FF8A5C"/><circle cx="15" cy="-10" r="4" fill="#FF8A5C"/><circle cx="0" cy="10" r="6" fill="#18202B"/><circle cx="-8" cy="2" r="3" fill="#FF8A5C"/><circle cx="8" cy="2" r="3" fill="#FF8A5C"/></g>' },
  { id: 'ledger', label: 'Contradiction Ledger', svg: '<g transform="translate(200 220) scale(1)"><rect x="0" y="0" width="50" height="80" rx="5" fill="#18202B" stroke="#FF8A5C" stroke-width="2"/><line x1="25" y1="0" x2="25" y2="80" stroke="#FF8A5C"/><line x1="0" y1="40" x2="50" y2="40" stroke="#FF8A5C"/></g>' },
  { id: 'like_counter', label: 'Applause Counter', svg: '<g transform="translate(200 220) scale(1)"><rect x="0" y="0" width="30" height="40" rx="3" fill="#18202B" stroke="#FF8A5C" stroke-width="2"/><text x="15" y="30" text-anchor="middle" fill="#FF8A5C">0</text><circle cx="5" cy="35" r="3" fill="#FF8A5C"/><circle cx="25" cy="35" r="3" fill="#FF8A5C"/></g>' },
  { id: 'mirror', label: 'Accountability Mirror', svg: '<g transform="translate(200 220) scale(1)"><rect x="0" y="0" width="40" height="40" fill="#18202B" stroke="#FF8A5C" stroke-width="2"/><circle cx="20" cy="20" r="18" fill="none" stroke="#FF8A5C" stroke-width="2"/></g>' },
  { id: 'original_question', label: 'The Original Question', svg: '<g transform="translate(200 220) scale(1)"><text x="20" y="35" text-anchor="middle" fill="#FF8A5C">?</text><circle cx="0" cy="0" r="10" fill="#18202B"/><circle cx="0" cy="0" r="4" fill="#FF8A5C"/></g>' },
  { id: 'puppet_strings', label: 'Puppet Strings', svg: '<g transform="translate(200 220) scale(1)"><line x1="0" y1="-30" x2="0" y2="30" stroke="#FF8A5C" stroke-width="2"/><line x1="-20" y1="-10" x2="-20" y2="10" stroke="#FF8A5C" stroke-width="2"/><line x1="20" y1="-10" x2="20" y2="10" stroke="#FF8A5C" stroke-width="2"/></g>' },
  { id: 'redacted_doc', label: 'Redacted Document', svg: '<g transform="translate(200 220) scale(1)"><rect x="0" y="0" width="60" height="80" rx="5" fill="#18202B"/><rect x="5" y="5" width="50" height="30" fill="none" stroke="#FF8A5C" stroke-width="2"/><line x1="5" y1="5" x2="55" y2="5" stroke="#FF8A5C"/><line x1="5" y1="35" x2="55" y2="35" stroke="#FF8A5C"/><line x1="5" y1="55" x2="25" y2="55" stroke="#FF8A5C"/><line x1="35" y1="55" x2="55" y2="55" stroke="#FF8A5C"/></g>' },
  { id: 'scales', label: 'Scales of Standards', svg: '<g transform="translate(200 220) scale(1)"><path d="M10 80 L40 10 M40 10 L10 80" stroke="#FF8A5C" stroke-width="3"/><circle cx="25" cy="45" r="8" fill="none" stroke="#FF8A5C" stroke-width="2"/><circle cx="25" cy="45" r="5" fill="#18202B"/></g>' },
  { id: 'slam_stamp', label: 'Slam Stamp', svg: '<g transform="translate(200 220) scale(1)"><circle cx="20" cy="20" r="10" fill="#FF8A5C"/><path d="M10 10 L30 30 M30 10 L10 30" stroke="#18202B" stroke-width="2"/></g>' },
  { id: 'speaker_lectern', label: 'Speaker at Lectern', svg: '<g transform="translate(200 220) scale(1)"><rect x="0" y="0" width="30" height="80" rx="3" fill="#18202B" stroke="#FF8A5C" stroke-width="2"/><rect x="5" y="70" width="20" height="10" fill="#FF8A5C"/></g>' },
  { id: 'speech_bubbles', label: 'Deflection Bubbles', svg: '<g transform="translate(200 220) scale(1)"><circle cx="-25" cy="-20" r="12" fill="#FF8A5C" opacity="0.5"/><circle cx="-10" cy="-20" r="12" fill="#FF8A5C" opacity="0.5"/><circle cx="0" cy="-20" r="12" fill="#FF8A5C" opacity="0.5"/><circle cx="10" cy="-20" r="12" fill="#FF8A5C" opacity="0.5"/><circle cx="25" cy="-20" r="12" fill="#FF8A5C" opacity="0.5"/></g>' },
  { id: 'timeline', label: 'Chronology Strip', svg: '<g transform="translate(200 220) scale(1)"><line x1="0" y1="0" x2="200" y2="0" stroke="#FF8A5C" stroke-width="2"/><circle cx="10" cy="5" r="3" fill="#FF8A5C"/><circle cx="30" cy="5" r="3" fill="#FF8A5C"/><circle cx="50" cy="5" r="3" fill="#FF8A5C"/><circle cx="70" cy="5" r="3" fill="#FF8A5C"/><circle cx="90" cy="5" r="3" fill="#FF8A5C"/><circle cx="110" cy="5" r="3" fill="#FF8A5C"/><circle cx="130" cy="5" r="3" fill="#FF8A5C"/><circle cx="150" cy="5" r="3" fill="#FF8A5C"/><circle cx="170" cy="5" r="3" fill="#FF8A5C"/><circle cx="190" cy="5" r="3" fill="#FF8A5C"/></g>' },
];

const has = (list: { id: string }[], id: unknown) => typeof id === 'string' && list.some((x) => x.id === id);

/** Only whitelisted ids survive. Returns undefined when nothing is set. */
export function cleanFx(raw: unknown): LineFx | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: LineFx = {};
  if (has(LIGHTS, r.light)) out.light = r.light as string;
  if (has(COLORS, r.color)) out.color = r.color as string;
  // room: accept whitelisted ID or any hex colour string (#RRGGBB)
  if (typeof r.room === 'string') {
    if (has(ROOMS, r.room)) out.room = r.room;
    else if (/^#[0-9a-fA-F]{6}$/.test(r.room)) out.room = r.room;
  }
  if (r.propL === 'none' || has(PROPS, r.propL)) out.propL = r.propL as string; // 'none' removes the current prop
  if (r.propR === 'none' || has(PROPS, r.propR)) out.propR = r.propR as string;
  // badgeColor and badgeName are free-form strings (CSS colour / text), so no whitelist
  if (typeof r.badgeColor === 'string') out.badgeColor = r.badgeColor;
  if (typeof r.badgeName === 'string') out.badgeName = r.badgeName;
  return Object.keys(out).length ? out : undefined;
}

/** What the studio UI needs to build its dropdowns (no SVG). */
export const catalogForClient = () => ({
  moods: MOODS,
  lights: LIGHTS,
  colors: COLORS.map(({ id, label }) => ({ id, label })),
  rooms: ROOMS.map(({ id, label }) => ({ id, label })),
  props: [{ id: 'none', label: '— remove prop —' }, ...PROPS.map(({ id, label }) => ({ id, label }))],
});

/* ---------------------------------------------------------------------- CSS */

const MOOD_CSS = `
#av .eye{transition:scale .25s}
#av[data-mood="worried"] .brow{transform:translateY(-3px) rotate(-14deg)}
#av[data-mood="worried"] .brow.r{transform:translateY(-3px) rotate(14deg)}
#av[data-mood="worried"] .mouth{d:path("M46 76 Q53 70 60 76 T74 76")}
#av[data-mood="stern"] .brow{transform:translateY(3px) rotate(14deg)}
#av[data-mood="stern"] .brow.r{transform:translateY(3px) rotate(-14deg)}
#av[data-mood="stern"] .mouth{d:path("M46 76 Q60 70 74 76")}
#av[data-mood="surprised"] .brow,#av[data-mood="surprised"] .brow.r{transform:translateY(-8px)}
#av[data-mood="surprised"] .eye{scale:1.25}
#av[data-mood="surprised"] .mouth{d:path("M52 68 C50 84 70 84 68 68 C64 64 56 64 52 68")}
#av[data-mood="smug"] .brow{transform:translateY(1px)}
#av[data-mood="smug"] .brow.r{transform:translateY(-6px) rotate(10deg)}
#av[data-mood="smug"] .eye{scale:1 .6}
#av[data-mood="smug"] .mouth{d:path("M46 74 Q62 78 76 66")}
#av[data-mood="sleepy"] .brow,#av[data-mood="sleepy"] .brow.r{transform:translateY(3px)}
#av[data-mood="sleepy"] .eye{scale:1 .25}
#av[data-mood="sleepy"] .mouth{d:path("M50 74 Q60 72 70 74")}
#av[data-mood="wink"] .brow.r{transform:translateY(-4px) rotate(8deg)}
#av[data-mood="wink"] .eye ~ .eye{scale:1 .12}
#av[data-mood="wink"] .mouth{d:path("M46 72 Q60 80 76 68")}
@keyframes fx-talk{to{transform:scaleY(2.5)}}
#av.talk[data-mood="worried"] .mouth,#av.talk[data-mood="stern"] .mouth,#av.talk[data-mood="surprised"] .mouth,
#av.talk[data-mood="smug"] .mouth,#av.talk[data-mood="sleepy"] .mouth,#av.talk[data-mood="wink"] .mouth{animation-name:fx-talk}
`;

const STAGE_CSS = `
.stage{transition:background-color .8s}
.stage .lamp{background:radial-gradient(ellipse at 50% 0,rgba(var(--lamp-rgb,255,225,170),.26),rgba(var(--lamp-rgb,255,225,170),0) 70%);transition:opacity .5s}
.stage[data-light="steady"] .lamp{animation:none}
.stage[data-light="candle"] .lamp{animation:fx-candle 2.3s ease-in-out infinite}
.stage[data-light="flicker"] .lamp{animation:fx-flicker 3.7s steps(1,end) infinite}
.stage[data-light="swing"] .lamp{animation:fx-swing 3.6s ease-in-out infinite}
.stage[data-light="sweep"] .lamp{animation:fx-sweep 7s ease-in-out infinite alternate}
.stage[data-light="pulse"] .lamp{animation:fx-pulse 1.8s ease-in-out infinite}
.stage[data-light="dim"] .lamp{animation:none;opacity:.35}
.stage[data-light="off"] .lamp{animation:none;opacity:0}
@keyframes fx-candle{
 0%,100%{opacity:.85;transform:translateX(-50%) scale(1,1)}
 18%{opacity:1;transform:translateX(-50%) scale(1.03,.98)}
 34%{opacity:.78;transform:translateX(-50.6%) scale(.98,1.02)}
 52%{opacity:.95;transform:translateX(-49.4%) scale(1.02,1)}
 71%{opacity:.8;transform:translateX(-50%) scale(.99,1.01)}}
@keyframes fx-flicker{0%{opacity:1}7%{opacity:.5}9%{opacity:.95}14%{opacity:.45}16%{opacity:.85}55%{opacity:1}58%{opacity:.55}61%{opacity:1}83%{opacity:.7}85%{opacity:1}}
@keyframes fx-swing{0%,100%{transform:translateX(-50%) rotate(-14deg)}50%{transform:translateX(-50%) rotate(14deg)}}
@keyframes fx-sweep{from{transform:translateX(-50%) rotate(-35deg)}to{transform:translateX(-50%) rotate(35deg)}}
@keyframes fx-pulse{0%,100%{opacity:.4}50%{opacity:1}}

.fx-slot{position:absolute;top:11%;width:15cqw;height:15cqw;z-index:2;pointer-events:none}
.fx-l{left:5cqw}.fx-r{right:5cqw}
.fx-prop{width:100%;height:100%;opacity:.92;animation:fx-pop .4s both,fx-bob 3.2s ease-in-out .4s infinite}
.fx-prop svg{width:100%;height:100%;overflow:visible;fill:none;stroke:var(--paper);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.fx-prop svg .a{stroke:var(--tag)}
.fx-prop svg .t{fill:var(--tag);stroke:none;font:700 40px "Barlow Condensed",sans-serif}
@keyframes fx-pop{from{transform:scale(.5);opacity:0}}
@keyframes fx-bob{50%{transform:translateY(-2.5cqw)}}
@keyframes fx-spin{to{transform:rotate(360deg)}}
.fx-clock .mh,.fx-clock .hh{transform-box:view-box;transform-origin:50% 50%}
.fx-clock .mh{animation:fx-spin 6s linear infinite}
.fx-clock .hh{animation:fx-spin 72s linear infinite}
.fx-moth .wl,.fx-moth .wr{animation:fx-flap .6s ease-in-out infinite alternate}
.fx-moth .wl{transform-box:fill-box;transform-origin:100% 50%}
.fx-moth .wr{transform-box:fill-box;transform-origin:0 50%}
@keyframes fx-flap{to{transform:scaleX(.55)}}
.fx-phone{animation:fx-pop .4s both,fx-ring 1.6s ease-in-out .4s infinite}
@keyframes fx-ring{0%,30%,100%{transform:rotate(0)}5%,15%,25%{transform:rotate(-9deg)}10%,20%{transform:rotate(9deg)}}
.fx-magnifier{animation:fx-pop .4s both,fx-tilt 3.4s ease-in-out .4s infinite alternate}
@keyframes fx-tilt{from{transform:rotate(-10deg) translateX(-1cqw)}to{transform:rotate(10deg) translateX(1cqw)}}
.fx-bulb svg .a{animation:fx-glow 1.8s ease-in-out infinite}
@keyframes fx-glow{50%{stroke:#fff3c4;filter:drop-shadow(0 0 2.5cqw rgba(255,225,140,.8))}}
@media (prefers-reduced-motion: reduce){
 .stage[data-light] .lamp,.fx-prop,.fx-prop *{animation:none!important}
}
`;

export const stageFxCss = () => MOOD_CSS + STAGE_CSS;

/* ------------------------------------------------------------------ runtime */

const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// Runs inside the theme page. Uses the shared stage engine (window.__stage) for cue evaluation.
// Falls back to legacy MutationObserver approach if engine is not available.
const RUNTIME = (fx: (LineFx | null)[], listen: boolean) => {
  const colors = Object.fromEntries(COLORS.map((c) => [c.id, c.rgb]));
  const rooms = Object.fromEntries(ROOMS.map((r) => [r.id, r.hex]));
  const props = Object.fromEntries(PROPS.map((p) => [p.id, `<svg viewBox="0 0 48 48" aria-hidden="true">${p.svg}</svg>`]));
  return `
(function(){
  var COL=${json(colors)},ROOM=${json(rooms)},PROP=${json(props)},LIGHT=${json(LIGHTS.map((l) => l.id))};
  var stage=document.getElementById('stage'),cap=document.getElementById('cap'),hook=document.getElementById('hook');
  if(!stage||!cap)return;
  var slots={};
  ['l','r'].forEach(function(k){var d=document.createElement('div');d.className='fx-slot fx-'+k;stage.appendChild(d);slots[k]=d});
  function prop(k,id){
    var s=slots[k]; if((s.getAttribute('data-p')||'')===(id||''))return;
    s.setAttribute('data-p',id||'');
    s.innerHTML=id&&PROP[id]?'<div class="fx-prop fx-'+id+'">'+PROP[id]+'</div>':'';
  }
  function clear(){
    stage.removeAttribute('data-light');stage.style.removeProperty('--lamp-rgb');stage.style.removeProperty('--room');stage.style.removeProperty('--badge-color');
    prop('l','');prop('r','');
  }
  function apply(f){
    if(!f)return;
    if(f.light){ if(f.light==='sway')stage.removeAttribute('data-light'); else stage.setAttribute('data-light',f.light); }
    if(f.color&&COL[f.color])stage.style.setProperty('--lamp-rgb',COL[f.color]);
    if(f.room){
      if(ROOM[f.room]) stage.style.setProperty('--room',ROOM[f.room]);
      else if(/^#[0-9a-fA-F]{6}$/.test(f.room)) stage.style.setProperty('--room',f.room);
    }
    if(f.badgeColor){ stage.style.setProperty('--badge-color',f.badgeColor); }
    if(f.badgeColor || f.badgeName){
      var av=document.getElementById('av');
      if(av){
        var textElement=av.querySelector('.badge');
        if(textElement){
          if(f.badgeName) textElement.textContent=f.badgeName;
          if(f.badgeColor) {
            textElement.setAttribute('fill', f.badgeColor);
            var rectElement=textElement.previousElementSibling;
            if(rectElement && rectElement.tagName==='rect') rectElement.setAttribute('fill', f.badgeColor);
          }
        }
      }
    }
    if(f.propL!==undefined)prop('l',f.propL);
    if(f.propR!==undefined)prop('r',f.propR);
  }
  function reset(){clear()}
  
  // Use engine if available (Phase 2+), otherwise fall back to legacy MutationObserver
  var engine = window.__stage;
  var cues = (typeof C !== 'undefined' ? C : []);
  var timeline = (typeof R !== 'undefined' && R[0] ? { 
    starts: R[0].l.map((_, i) => R[0].l.slice(0, i+1).reduce((acc, l, idx) => acc + (idx===0?2320:0) + l.h + [...l.s].length*40, 0)), // approximate
    ends: [],
    stampAt: 0,
    speechEnds: [],
    typingMs: R[0].l.map(l => [...l.s].length*40)
  } : null);
  
  if (engine && engine.sceneAt && cues.length > 0 && timeline) {
    // Engine-based cue evaluation - called on each frame via setTime
    window.addEventListener('message', function(e) {
      if (!e.data || e.data.t !== 'setTime') return;
      var t = e.data.value;
      var scene = engine.sceneAt(cues, timeline, R[0].l.map(l => ({id: l.id || '', s: l.s})), t);
      apply(scene);
      // Also update avatar mood
      var av = document.getElementById('av');
      if (av && scene.mood) av.setAttribute('data-mood', scene.mood);
    });
    // Also listen for hook reset
    if (hook) new MutationObserver(function(){ if (hook.classList.contains('on')) reset(); }).observe(hook, {attributes: true, attributeFilter: ['class']});
  } else {
    // Legacy MutationObserver approach - use the fx array passed in, not a global FX
    var i = -1;
    new MutationObserver(function(ms){ ms.forEach(function(m){ m.addedNodes.forEach(function(n){
      if (n.nodeName === 'P') { i++; apply(fx[i] || null); }
    })})}).observe(cap, {childList: true});
    if (hook) new MutationObserver(function(){ if (hook.classList.contains('on')) { i = -1; reset(); } }).observe(hook, {attributes: true, attributeFilter: ['class']});
  }
  
  ${listen ? `
  // "Try now": the studio sends the fully resolved look of one line and we show it immediately.
  // Same-origin, from our parent only. The line counter is left alone, so a playing reel carries on.
  window.addEventListener('message', function(e) {
    if (e.source !== parent || e.origin !== location.origin) return;
    var d = e.data, k = d && d.t === 'fx-try' && d.look; if (!k) return;
    var av = document.getElementById('av');
    if (av && typeof k.mood === 'string' && /^[a-z]{2,12}$/.test(k.mood)) av.setAttribute('data-mood', k.mood);
    clear();
    apply({ light: LIGHT.indexOf(k.light) >= 0 ? k.light : 'sway', color: k.color || '', room: k.room || '', badgeColor: k.badgeColor || '', badgeName: k.badgeName || '', propL: k.propL || '', propR: k.propR || '' });
  });` : ''}
})();`;
};

/** The <script> to inject before </body>.
 *  preview: always (it carries the "Try now" listener, which must work on reels that use no effects yet).
 *  capture: only when some line uses an effect, so exports of old reels are untouched. */
export function stageFxScript(lines: (LineFx | undefined)[], mode: 'preview' | 'capture'): string {
  const clean = lines.map((l) => cleanFx(l) || null);
  if (mode === 'capture' && !clean.some(Boolean)) return '';
  return `<script>${RUNTIME(clean, mode === 'preview')}</script>`;
}