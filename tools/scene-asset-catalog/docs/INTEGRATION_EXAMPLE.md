# 🎨 Scene Asset Catalog — Integration Example

This example shows how to integrate the Scene Asset Catalog into another project.

## 1. Copy the Files

Copy the exported directory into your project:

```bash
cp -r export/scene-asset-catalog/ your-project/content/scenes/
```

Your project structure should look like:

```
your-project/
├── content/
│   └── scenes/
│       ├── manifest.json
│       ├── assets/
│       │   ├── manifest.json
│       │   ├── sun.asset.json
│       │   ├── pup.asset.json
│       │   └── ...
│       ├── welcome.scene.json
│       └── ...
├── frontend/
│   └── js/
│       └── shaders.js   (your scene engine)
└── server.py            (or equivalent HTTP server)
```

## 2. Serve the Scene Files

Your HTTP server must serve `content/scenes/` and `content/scenes/assets/` so the frontend can fetch manifests and JSON files.

**Example endpoints:**

```
GET /content/scenes/manifest.json
GET /content/scenes/welcome.scene.json
GET /content/scenes/assets/manifest.json
GET /content/scenes/assets/sun.asset.json
```

If you're using Olivia's `serve.py`, these routes already exist via `_serve_content_scenes`.

## 3. Initialize in Your Frontend

At application startup, call the auto-loaders:

```js
// Load scenes from manifest
shAutoLoadScenes();

// Load assets from manifest
shAutoLoadAssets();
```

## 4. Create a Scene That Uses Assets

Here's a complete scene that composes multiple assets:

```json
{
  "id": "my_custom_scene",
  "name": "My Custom Scene",
  "icon": "🌲",
  "desc": "A scene composed from catalog assets",
  "category": "custom",
  "code": "// Sky gradient\nsvg += `<defs><linearGradient id=\"sky\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"${isN ? '#0A1628' : '#4DA6FF'}\"/><stop offset=\"100%\" stop-color=\"${isN ? '#1A2A48' : '#87CEEB'}\"/></linearGradient></defs>`;\nsvg += `<rect x=\"0\" y=\"0\" width=\"${w}\" height=\"${h}\" fill=\"url(#sky)\"/>`;\n\n// Ground\nsvg += `<rect x=\"0\" y=\"${bY}\" width=\"${w}\" height=\"${h-bY}\" fill=\"#7BC47F\"/>`;\n\n// Sun (from asset catalog)\nsvg = SH_ASSETS.sun.render(svg, { x: w*0.8, y: h*0.15, mt, isN, ol });\n\n// Owl (from asset catalog)\nsvg = SH_ASSETS.owl.render(svg, { x: w*0.3, y: bY-60, mt, isN, ol, talk: true });\n\n// Fireflies (from asset catalog)\nsvg = SH_ASSETS.firefly_swarm.render(svg, { x: 0, y: bY-100, w, h: 100, count: 20, mt, color: '#FFD700' });\n\n// Snowflakes (from asset catalog)\nif (isN) {\n  svg = SH_ASSETS.snowflakes.render(svg, { w, h, mt, count: 30 });\n}"
}
```

Add `"my_custom_scene.scene.json"` to `content/scenes/manifest.json` and reload.

## 5. List Assets Programmatically

```js
const assets = window.shListAssets();
assets.forEach(a => {
  console.log(`${a.icon} ${a.name} (${a.category}): ${a.desc}`);
  // a.params contains the declarative parameter definitions for UI
});
```

## 6. Minimal Server Example (Python)

```python
from http.server import HTTPServer, SimpleHTTPRequestHandler
import os

os.chdir('your-project')  # serve from project root
HTTPServer(('127.0.0.1', 8000), SimpleHTTPRequestHandler).serve_forever()
```

Then access scenes at `http://127.0.0.1:8000/content/scenes/manifest.json`.

## 7. Checklist Before Shipping

- [ ] All `.scene.json` and `.asset.json` files are valid JSON
- [ ] All scene/asset IDs are unique
- [ ] All new filenames are listed in the corresponding `manifest.json`
- [ ] Scene `code` uses template literals for dynamic values
- [ ] Asset `code` returns the `svg` string
- [ ] Assets handle `isN` (night mode) gracefully
- [ ] `shAutoLoadScenes()` and `shAutoLoadAssets()` are called at startup