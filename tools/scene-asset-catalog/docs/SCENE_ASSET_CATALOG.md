# 🎨 Scene Asset Catalog — Integration Guide

The **Scene Asset Catalog** is a reusable SVG artifact system used by the Olivia Shaders module. It lets you compose animated 2D scenes from modular assets (characters, props, environment pieces, FX, sky elements) and load them dynamically through a manifest-driven catalog.

---

## Directory Layout

```
content/scenes/
├── manifest.json              # Array of scene filenames to auto-load
├── welcome.scene.json         # Example scene definition
├── story-ch1-pups-discovery.scene.json
├── ...                        # More .scene.json files
└── assets/
    ├── manifest.json          # Array of asset filenames to auto-load
    ├── README.md              # Asset authoring reference
    ├── sun.asset.json         # Reusable SVG artifact
    ├── pup.asset.json
    ├── owl.asset.json
    ├── ...                    # More .asset.json files
```

---

## 1. Scene Files (`.scene.json`)

A scene file defines a complete animated SVG scene. It is loaded automatically when its filename appears in `content/scenes/manifest.json`.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique scene identifier (snake_case) |
| `name` | string | Yes | Display name shown in the UI |
| `icon` | string | No | Emoji icon for the catalog |
| `desc` | string | No | Human-readable description |
| `category` | string | No | Scene category (e.g. `custom`, `story`, `3d`) |
| `type` | string | No | `2d` (default) or `3d` |
| `sky1`, `sky2` | string | No | Gradient sky colors (hex) |
| `ground` | string | No | Ground color (hex) |
| `bld` | string | No | Building color (hex) |
| `acc` | string | No | Accent color (hex) |
| `bg` | string | No | Background color (hex) |
| `environment` | string | No | Environment preset (`studio`, `outdoor`, etc.) |
| `model` | string | No | GLB model path (for 3d scenes) |
| `camera` | object | No | Camera config `{ fov, position: [x,y,z] }` |
| `lighting` | object | No | Lighting config `{ ambient, directional }` |
| `animations` | object | No | Animation config `{ speed, play }` |
| `code` | string | **Yes** | JavaScript that builds the SVG string |

### The `code` Runtime

The `code` string is executed as a function body with these variables in scope:

| Variable | Type | Description |
|----------|------|-------------|
| `svg` | string | Current SVG buffer — append to it and return |
| `w` | number | Canvas width |
| `h` | number | Canvas height |
| `bY` | number | Baseline Y (ground line) |
| `mt` | number | Master time (seconds × timeSpeed) |
| `w1`, `w2`, `w3` | number | Deterministic oscillators (0–1) |
| `isN` | boolean | Night mode flag |
| `ol` | number | Stroke outline width |
| `sc` | object | Scene color palette `{ sky1, sky2, ground, bld, acc }` |

**Rules:**
- Always use template literals for dynamic values.
- Never leave un-evaluated `${...}` or stray `{` inside attribute values — malformed SVG aborts the preview loop.
- Return the extended `svg` string at the end (implicit via `svg += ...`).

### Example Scene

```json
{
  "id": "welcome_local",
  "type": "3d",
  "name": "Welcome — Local Model",
  "icon": "🧊",
  "desc": "Clean starting scene using the local /uploads/model.glb — no external CDN fetches.",
  "category": "custom",
  "environment": "studio",
  "bg": "#1a1a2e",
  "model": "/uploads/model.glb",
  "camera": { "fov": 45, "position": [3, 2, 5] },
  "lighting": { "ambient": 0.6, "directional": 1.4 },
  "animations": { "speed": 1, "play": true }
}
```

---

## 2. Asset Files (`.asset.json`)

An asset is a reusable SVG artifact extracted from scenes. Assets live in `content/scenes/assets/` and are auto-loaded when listed in `content/scenes/assets/manifest.json`.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique asset identifier (snake_case) |
| `name` | string | Yes | Display name |
| `icon` | string | No | Emoji icon |
| `category` | string | Yes | `character` \| `prop` \| `environment` \| `fx` \| `sky` |
| `tags` | string[] | No | Searchable tags |
| `desc` | string | No | One-sentence description |
| `params` | object | No | Declarative parameter definitions for the catalog UI |
| `code` | string | **Yes** | JavaScript function body that appends SVG to `svg` |

### `params` Format

Each param entry maps a parameter name to a descriptor:

```json
{
  "x":     { "type": "x",     "default": "w*0.3" },
  "y":     { "type": "y",     "default": "bY-60" },
  "scale": { "type": "number","default": 1 },
  "color": { "type": "color", "default": "#8B6B4A" },
  "talk":  { "type": "bool",  "default": true }
}
```

Supported `type` values: `x`, `y`, `number`, `color`, `bool`.

### Asset `code` Runtime

The `code` string is compiled as:

```js
new Function('svg','ctx','mt','w1','w2','w3','isN','ol', code + '\nreturn svg;')
```

| Variable | Type | Description |
|----------|------|-------------|
| `svg` | string | Current SVG buffer |
| `ctx` | object | Per-call parameters (x, y, scale, color, etc.) |
| `mt` | number | Master time |
| `w1`, `w2`, `w3` | number | Deterministic oscillators (0–1) |
| `isN` | boolean | Night mode |
| `ol` | number | Stroke outline width |

The function must return the extended `svg` string.

### Example Asset

```json
{
  "id": "sun",
  "name": "Sun",
  "icon": "☀️",
  "category": "sky",
  "tags": ["day", "sky", "light"],
  "desc": "Warm sun disc with soft halo; pulses gently via w1",
  "params": {
    "x":     { "type": "x",     "default": "w*0.75" },
    "y":     { "type": "y",     "default": "h*0.15" },
    "color": { "type": "color", "default": "#FFD700" },
    "radius":{ "type": "number","default": 22 }
  },
  "code": "const sx = ctx.x ?? 300; const sy = ctx.y ?? 75; const col = ctx.color || '#FFD700'; const r = ctx.radius ?? 22;\nsvg += `<circle cx=\"${sx}\" cy=\"${sy}\" r=\"${r*1.4+w1*6}\" fill=\"${col}\" opacity=\"0.08\"/>`;\nsvg += `<circle cx=\"${sx}\" cy=\"${sy}\" r=\"${r}\" fill=\"${col}\" opacity=\"0.7\"/>`;"
}
```

---

## 3. Manifest Files

Both scenes and assets use a `manifest.json` — a JSON array of filenames to auto-load.

### `content/scenes/manifest.json`

```json
[
  "welcome.scene.json",
  "story-ch1-pups-discovery.scene.json",
  "ice-kingdom.scene.json"
]
```

### `content/scenes/assets/manifest.json`

```json
[
  "sun.asset.json",
  "pup.asset.json",
  "owl.asset.json"
]
```

**To register a new file:** add the file, then append its filename to the corresponding `manifest.json`. On next load, the Shaders room auto-discovers it.

---

## 4. Using Assets from Scene Code

Inside a scene's `code` string, invoke any catalog asset:

```js
svg = SH_ASSETS.owl.render(svg, { x: w*0.3, y: bY-80, mt, isN, ol, talk: true });
svg = SH_ASSETS.firefly_swarm.render(svg, { x: 0, y: bY-40, w, h: 55, count: 15, mt, color: sc.acc });
svg = SH_ASSETS.snowflakes.render(svg, { w, h, mt, count: 25 });
```

The `SH_ASSETS` object is populated by `shAutoLoadAssets()` at startup. Each entry has:
- `meta` — the asset's JSON metadata
- `code` — the raw code string
- `render(svg, ctx)` — the compiled render function

---

## 5. Catalog UI

The Shaders room provides `shOpenCatalog()` — a modal that lets users:
- Browse all registered assets by category
- Multi-select assets
- Auto-generate a scene whose `code` composes the selected pieces

---

## 6. Integrating into Another Project

### Step 1 — Copy the files

Copy this directory tree into your project:

```
your-project/
├── content/
│   └── scenes/
│       ├── manifest.json
│       ├── assets/
│       │   ├── manifest.json
│       │   └── *.asset.json
│       └── *.scene.json
└── frontend/
    └── js/
        └── shaders.js   (or your equivalent scene engine)
```

### Step 2 — Serve the files

Expose `content/scenes/` and `content/scenes/assets/` over HTTP so the frontend can fetch `manifest.json` and individual JSON files. The Olivia server serves them at:

```
GET /content/scenes/manifest.json
GET /content/scenes/<file>.scene.json
GET /content/scenes/assets/manifest.json
GET /content/scenes/assets/<file>.asset.json
```

### Step 3 — Initialize the catalog

In your frontend, call the auto-loaders at startup:

```js
shAutoLoadScenes();   // loads scenes from content/scenes/manifest.json
shAutoLoadAssets();   // loads assets from content/scenes/assets/manifest.json
```

### Step 4 — Use in scenes

Reference assets in scene `code`:

```js
svg = SH_ASSETS.<asset_id>.render(svg, { x, y, mt, isN, ol, ... });
```

Or list available assets programmatically:

```js
const assets = window.shListAssets();
// [{ id, name, icon, category, tags, desc, params }, ...]
```

---

## 7. Best Practices

- **IDs must be unique** across all assets and scenes.
- **Keep `code` self-contained** — avoid external dependencies.
- **Validate SVG output** — malformed attributes abort the preview loop.
- **Use `ctx.param ?? default`** pattern for robust parameter handling.
- **Test night mode** (`isN`) — assets should adapt colors accordingly.
- **Update manifests** whenever you add or remove files.

---

## Exported Elements

This export includes:

| Folder | Contents |
|--------|----------|
| `scenes/` | 22 scene definitions (`.scene.json`) + `manifest.json` |
| `assets/` | 23 reusable SVG artifacts (`.asset.json`) + `manifest.json` + `README.md` |

See the individual files for full details.